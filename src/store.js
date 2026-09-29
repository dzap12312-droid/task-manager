'use strict';

const fs = require('fs/promises');
const path = require('path');

// 파일 입출력은 main 프로세스 전용. 안전한 쓰기(tmp -> rename), 깨진 JSON 보존 후 초기화.
// v1.2: 같은 파일에 대한 저장을 순서대로 처리(동시 저장 시 tmp 파일 충돌 방지),
//       Windows 백신/인덱서가 파일을 잡고 있을 때 rename 재시도.

const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES']);
const saveQueues = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function renameWithRetry(from, to, attempts = 5) {
  for (let i = 0; ; i += 1) {
    try {
      await fs.rename(from, to);
      return;
    } catch (err) {
      if (!RENAME_RETRY_CODES.has(err.code) || i >= attempts - 1) throw err;
      await sleep(50 * (i + 1));
    }
  }
}

async function loadTasks(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') {
      await saveTasks(filePath, []);
      return { tasks: [], broken: false };
    }
    throw err;
  }

  try {
    // 메모장 등으로 편집해 UTF-8 BOM이 붙은 파일도 정상적으로 읽는다.
    const parsed = JSON.parse(raw.replace(/^﻿/, ''));
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return { tasks: parsed, broken: false };
  } catch (err) {
    const dir = path.dirname(filePath);
    const stamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-');
    const brokenPath = path.join(dir, `tasks.broken-${stamp}.json`);
    await renameWithRetry(filePath, brokenPath);
    await saveTasks(filePath, []);
    return { tasks: [], broken: true, brokenPath };
  }
}

async function writeAtomic(filePath, tasks) {
  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(tasks, null, 2), 'utf8');
  await renameWithRetry(tmpPath, filePath);
}

// 같은 파일 경로에 대한 저장은 앞선 저장이 끝난 뒤 실행한다.
function saveTasks(filePath, tasks) {
  const key = path.resolve(filePath);
  const prev = saveQueues.get(key) || Promise.resolve();
  const next = prev.catch(() => {}).then(() => writeAtomic(filePath, tasks));
  saveQueues.set(key, next);
  next
    .catch(() => {})
    .then(() => {
      if (saveQueues.get(key) === next) saveQueues.delete(key);
    });
  return next;
}

module.exports = { loadTasks, saveTasks };
