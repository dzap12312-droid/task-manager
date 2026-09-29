'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { resolveDataDir, migrateLegacyData } = require('../src/paths.js');

const USER_DATA = path.join('C:', 'Users', 'me', 'AppData', 'Roaming', '업무관리');

test('포터블 exe: PORTABLE_EXECUTABLE_DIR 옆 data 폴더', () => {
  const exeDir = path.join('D:', 'Tools', '업무관리');
  const r = resolveDataDir({ env: { PORTABLE_EXECUTABLE_DIR: exeDir }, userDataPath: USER_DATA });
  assert.equal(r.dir, path.join(exeDir, 'data'));
  assert.equal(r.portable, true);
});

test('설치형: PORTABLE_EXECUTABLE_DIR이 없으면 %APPDATA% (userData) 유지', () => {
  const r = resolveDataDir({ env: {}, userDataPath: USER_DATA });
  assert.equal(r.dir, USER_DATA);
  assert.equal(r.portable, false);
});

test('PORTABLE_EXECUTABLE_DIR이 빈 문자열이면 설치형으로 취급', () => {
  const r = resolveDataDir({ env: { PORTABLE_EXECUTABLE_DIR: '  ' }, userDataPath: USER_DATA });
  assert.equal(r.dir, USER_DATA);
  assert.equal(r.portable, false);
});

test('TASK_MANAGER_DATA_DIR(테스트용 강제 지정)이 가장 우선', () => {
  const r = resolveDataDir({
    env: { TASK_MANAGER_DATA_DIR: '/tmp/x', PORTABLE_EXECUTABLE_DIR: '/tmp/y' },
    userDataPath: USER_DATA,
  });
  assert.equal(r.dir, '/tmp/x');
  assert.equal(r.portable, false);
});

test('migrateLegacyData: 포터블 data에 파일이 없으면 기존 %APPDATA% 데이터를 복사(원본 유지)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tm-paths-'));
  const from = path.join(root, 'appdata');
  const to = path.join(root, 'portable', 'data');
  await fs.mkdir(from, { recursive: true });
  await fs.writeFile(path.join(from, 'tasks.json'), '[{"id":1}]', 'utf8');

  assert.equal(await migrateLegacyData(from, to), true);
  assert.equal(await fs.readFile(path.join(to, 'tasks.json'), 'utf8'), '[{"id":1}]');
  assert.equal(await fs.readFile(path.join(from, 'tasks.json'), 'utf8'), '[{"id":1}]');

  // 이미 있으면 덮어쓰지 않는다
  await fs.writeFile(path.join(to, 'tasks.json'), '[]', 'utf8');
  assert.equal(await migrateLegacyData(from, to), false);
  assert.equal(await fs.readFile(path.join(to, 'tasks.json'), 'utf8'), '[]');
});

test('migrateLegacyData: 기존 데이터가 없거나 같은 폴더면 아무것도 하지 않는다', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tm-paths-'));
  assert.equal(await migrateLegacyData(path.join(root, 'none'), path.join(root, 'to')), false);
  assert.equal(await migrateLegacyData(root, root), false);
});
