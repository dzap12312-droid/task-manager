'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createBackup, listBackups, restoreBackup, pruneBackups, isValidBackupName } = require('../src/backup.js');

async function setup(content) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tm-backup-'));
  const file = path.join(dir, 'tasks.json');
  const backups = path.join(dir, 'backups');
  if (content !== undefined) await fs.writeFile(file, content, 'utf8');
  return { dir, file, backups };
}

test('createBackup: 현재 파일을 백업하고, 내용이 같으면 다시 만들지 않는다', async () => {
  const { file, backups } = await setup('[{"id":1}]');
  const first = await createBackup(file, backups, { now: new Date('2026-09-29T01:00:00.000Z') });
  assert.equal(first, 'tasks-2026-09-29T01-00-00-000Z.json');
  assert.equal(await createBackup(file, backups), null);

  await fs.writeFile(file, '[{"id":1},{"id":2}]', 'utf8');
  const second = await createBackup(file, backups, { now: new Date('2026-09-29T02:00:00.000Z') });
  assert.ok(second);

  const list = await listBackups(backups);
  assert.deepEqual(list.map((b) => b.name), [second, first]); // 최신순
  assert.deepEqual(list.map((b) => b.count), [2, 1]);
  assert.equal(list[1].createdAt, '2026-09-29T01-00-00-000Z');
  assert.equal(list[1].beforeRestore, false);
});

test('createBackup: tasks.json이 없으면 건너뛴다', async () => {
  const { file, backups } = await setup();
  assert.equal(await createBackup(file, backups), null);
  assert.deepEqual(await listBackups(backups), []);
});

test('restoreBackup: 복원 전에 현재 파일을 before-restore로 백업한다', async () => {
  const { file, backups } = await setup('[{"id":1,"task":"old"}]');
  const name = await createBackup(file, backups, { now: new Date('2026-09-28T00:00:00.000Z') });
  await fs.writeFile(file, '[{"id":2,"task":"new"}]', 'utf8');

  const { tasks, safetyName } = await restoreBackup(file, backups, name);
  assert.deepEqual(tasks, [{ id: 1, task: 'old' }]);
  assert.deepEqual(JSON.parse(await fs.readFile(file, 'utf8')), [{ id: 1, task: 'old' }]);
  assert.match(safetyName, /-before-restore\.json$/);
  assert.equal(await fs.readFile(path.join(backups, safetyName), 'utf8'), '[{"id":2,"task":"new"}]');
});

test('restoreBackup: 경로 조작(../) 이름과 깨진 백업은 거부한다', async () => {
  const { file, backups } = await setup('[]');
  await assert.rejects(restoreBackup(file, backups, '../tasks.json'));
  await assert.rejects(restoreBackup(file, backups, 'tasks-2026-09-29T01-00-00-000Z.json/../../x'));

  await fs.mkdir(backups, { recursive: true });
  const bad = 'tasks-2026-09-29T01-00-00-000Z.json';
  await fs.writeFile(path.join(backups, bad), '{broken', 'utf8');
  await assert.rejects(restoreBackup(file, backups, bad));
  assert.equal(await fs.readFile(file, 'utf8'), '[]'); // 실패 시 현재 파일 그대로
});

test('isValidBackupName', () => {
  assert.equal(isValidBackupName('tasks-2026-09-29T01-00-00-000Z.json'), true);
  assert.equal(isValidBackupName('tasks-2026-09-29T01-00-00-000Z-before-restore.json'), true);
  assert.equal(isValidBackupName('tasks.json'), false);
  assert.equal(isValidBackupName('..\\tasks-2026-09-29T01-00-00-000Z.json'), false);
  assert.equal(isValidBackupName(null), false);
});

test('pruneBackups: 최신 N개만 남긴다', async () => {
  const { file, backups } = await setup('[]');
  for (let i = 0; i < 5; i += 1) {
    await fs.writeFile(file, JSON.stringify([{ id: i }]), 'utf8');
    await createBackup(file, backups, { now: new Date(Date.UTC(2026, 8, 1 + i)), keep: 100 });
  }
  const removed = await pruneBackups(backups, 3);
  assert.equal(removed.length, 2);
  const left = await listBackups(backups);
  assert.deepEqual(left.map((b) => b.count), [1, 1, 1]);
  assert.equal(left[0].name, 'tasks-2026-09-05T00-00-00-000Z.json');
});
