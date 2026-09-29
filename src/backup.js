'use strict';

const fs = require('fs/promises');
const path = require('path');
const { saveTasks } = require('./store');

// 자동 백업 + 복원. 백업 파일은 <데이터 폴더>\backups\tasks-<시각>[-before-restore].json

const BACKUP_NAME_RE = /^tasks-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-before-restore)?\.json$/;
const DEFAULT_KEEP = 30;

function stamp(now = new Date()) {
  return now.toISOString().replace(/[:.]/g, '-');
}

function isValidBackupName(name) {
  return typeof name === 'string' && BACKUP_NAME_RE.test(name) && path.basename(name) === name;
}

async function readIfExists(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function listBackups(backupDir) {
  let names;
  try {
    names = await fs.readdir(backupDir);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
  const items = [];
  for (const name of names) {
    if (!isValidBackupName(name)) continue;
    const full = path.join(backupDir, name);
    const stat = await fs.stat(full);
    let count = null;
    try {
      const parsed = JSON.parse((await fs.readFile(full, 'utf8')).replace(/^﻿/, ''));
      if (Array.isArray(parsed)) count = parsed.length;
    } catch {
      count = null;
    }
    items.push({
      name,
      size: stat.size,
      count,
      beforeRestore: name.endsWith('-before-restore.json'),
      createdAt: name.slice(6, 29), // 파일명의 시각(UTC) 부분
    });
  }
  // 파일명의 시각이 ISO 형식이라 문자열 역순 정렬 = 최신순
  items.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
  return items;
}

async function pruneBackups(backupDir, keep = DEFAULT_KEEP) {
  const items = await listBackups(backupDir);
  const removed = [];
  for (const item of items.slice(keep)) {
    await fs.unlink(path.join(backupDir, item.name));
    removed.push(item.name);
  }
  return removed;
}

// 현재 tasks.json을 백업한다. 파일이 없거나 가장 최근 백업과 내용이 같으면 건너뛴다.
async function createBackup(tasksFilePath, backupDir, { suffix = '', now = new Date(), force = false, keep = DEFAULT_KEEP } = {}) {
  const content = await readIfExists(tasksFilePath);
  if (content === null) return null;

  if (!force) {
    const latest = (await listBackups(backupDir))[0];
    if (latest) {
      const latestContent = await readIfExists(path.join(backupDir, latest.name));
      if (latestContent === content) return null;
    }
  }

  await fs.mkdir(backupDir, { recursive: true });
  let name = `tasks-${stamp(now)}${suffix}.json`;
  // 같은 밀리초에 두 번 호출되는 경우 이름 충돌 방지
  let bump = 0;
  while ((await readIfExists(path.join(backupDir, name))) !== null) {
    bump += 1;
    name = `tasks-${stamp(new Date(now.getTime() + bump))}${suffix}.json`;
  }
  await fs.writeFile(path.join(backupDir, name), content, 'utf8');
  await pruneBackups(backupDir, keep);
  return name;
}

// 백업에서 복원. 복원 전에 현재 파일을 "-before-restore" 백업으로 남긴다.
async function restoreBackup(tasksFilePath, backupDir, name) {
  if (!isValidBackupName(name)) throw new Error('잘못된 백업 파일 이름입니다.');
  const full = path.join(backupDir, name);
  const raw = await fs.readFile(full, 'utf8');
  const tasks = JSON.parse(raw.replace(/^﻿/, ''));
  if (!Array.isArray(tasks)) throw new Error('백업 파일 형식이 올바르지 않습니다.');

  const safetyName = await createBackup(tasksFilePath, backupDir, { suffix: '-before-restore', force: true });
  await saveTasks(tasksFilePath, tasks);
  return { tasks, safetyName };
}

module.exports = {
  listBackups,
  createBackup,
  restoreBackup,
  pruneBackups,
  isValidBackupName,
  DEFAULT_KEEP,
};
