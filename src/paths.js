'use strict';

const fs = require('fs/promises');
const path = require('path');

// 데이터 폴더 결정.
// - 포터블 exe: electron-builder가 PORTABLE_EXECUTABLE_DIR(=exe가 있는 폴더)을 넣어 준다 -> <exe 폴더>\data
// - 설치형/개발 실행: app.getPath('userData') (= %APPDATA%\업무관리) 그대로
// - TASK_MANAGER_DATA_DIR: 테스트(E2E/스크린샷)용으로 데이터 폴더를 강제 지정
function resolveDataDir({ env = process.env, userDataPath }) {
  const override = (env.TASK_MANAGER_DATA_DIR || '').trim();
  if (override) {
    return { dir: override, portable: false, source: 'override' };
  }
  const portableDir = (env.PORTABLE_EXECUTABLE_DIR || '').trim();
  if (portableDir) {
    return { dir: path.join(portableDir, 'data'), portable: true, source: 'portable' };
  }
  return { dir: userDataPath, portable: false, source: 'userData' };
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

// v1.1 포터블은 %APPDATA%\업무관리 에 저장했다. v1.2 포터블을 처음 실행하면
// exe 옆 data\ 에 tasks.json이 없을 때 한 번만 복사해 온다(원본은 지우지 않음).
async function migrateLegacyData(fromDir, toDir, fileName = 'tasks.json') {
  if (!fromDir || !toDir || path.resolve(fromDir) === path.resolve(toDir)) return false;
  const target = path.join(toDir, fileName);
  const source = path.join(fromDir, fileName);
  if (await exists(target)) return false;
  if (!(await exists(source))) return false;
  await fs.mkdir(toDir, { recursive: true });
  await fs.copyFile(source, target);
  return true;
}

module.exports = { resolveDataDir, migrateLegacyData };
