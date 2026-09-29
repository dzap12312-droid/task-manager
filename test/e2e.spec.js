'use strict';

// Playwright _electron E2E: `npm run test:e2e`
// - Windows: 그대로 실행
// - Linux(CI/클라우드): `xvfb-run -a npm run test:e2e` (root면 --no-sandbox 자동 추가)
// 데이터는 TASK_MANAGER_DATA_DIR로 지정한 임시 폴더에만 쓴다(실제 업무 데이터에 영향 없음).

const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function launch(dataDir) {
  const args = [ROOT];
  if (process.platform === 'linux' && process.getuid && process.getuid() === 0) args.push('--no-sandbox');
  const app = await electron.launch({
    args,
    env: { ...process.env, TASK_MANAGER_DATA_DIR: dataDir },
  });
  const win = await app.firstWindow();
  await win.waitForSelector('#task-input');
  return { app, win };
}

async function addTask(win, { task, assignee, date }) {
  await win.fill('#assignee-input', assignee);
  if (date) await win.fill('#date-input', date);
  await win.fill('#task-input', task);
  await win.press('#task-input', 'Enter');
}

async function readTasks(dataDir) {
  return JSON.parse(await fs.readFile(path.join(dataDir, 'tasks.json'), 'utf8'));
}

test.describe.configure({ mode: 'serial' });

test('추가 -> 체크(완료일 저장) -> 해제 -> 삭제 -> 재실행 후 데이터 유지', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-manager-e2e-'));
  let { app, win } = await launch(dataDir);

  await expect(win.locator('#empty-message')).toBeVisible();

  await addTask(win, { assignee: '김민수', task: '주간 보고서 작성' });
  await expect(win.locator('.task-row')).toHaveCount(1);
  await expect(win.locator('#assignee-input')).toHaveValue('김민수');
  await expect(win.locator('#task-input')).toHaveValue('');

  await win.locator('.task-row input[type=checkbox]').check();
  await expect(win.locator('.task-row.completed')).toHaveCount(1);
  await expect.poll(async () => (await readTasks(dataDir))[0].completedAt).toBe(localDate(0));

  await win.locator('.task-row input[type=checkbox]').uncheck();
  await expect(win.locator('.task-row.completed')).toHaveCount(0);
  await expect.poll(async () => 'completedAt' in (await readTasks(dataDir))[0]).toBe(false);

  win.once('dialog', (dialog) => dialog.accept());
  await win.locator('.task-row .delete-btn').click({ force: true });
  await expect(win.locator('#empty-message')).toBeVisible();

  await addTask(win, { assignee: '홍길동', task: '회의록 정리' });
  await expect(win.locator('.task-row')).toHaveCount(1);
  await app.close();

  ({ app, win } = await launch(dataDir));
  await expect(win.locator('.task-row')).toHaveCount(1);
  await expect(win.locator('.task-row')).toContainText('회의록 정리');
  await app.close();
});

test('마감 표시·요약, 검색, 상태 필터, CSV 내보내기', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-manager-e2e-'));
  const { app, win } = await launch(dataDir);

  await addTask(win, { assignee: '김민수', task: '지난 보고서', date: localDate(-3) });
  await addTask(win, { assignee: '홍길동', task: '오늘 견적', date: localDate(0) });
  await addTask(win, { assignee: '홍길동', task: '다음 주 회의', date: localDate(7) });

  await expect(win.locator('#due-summary')).toContainText('오늘 1건');
  await expect(win.locator('#due-summary')).toContainText('지연 1건');
  await expect(win.locator('.task-row.due-overdue')).toContainText('지난 보고서');
  await expect(win.locator('.task-row.due-today')).toContainText('오늘 견적');

  await win.fill('#search-input', '견적');
  await expect(win.locator('.task-row')).toHaveCount(1);
  await win.fill('#search-input', '홍길동');
  await expect(win.locator('.task-row')).toHaveCount(2);

  // 현재 필터(검색: 홍길동) 목록을 CSV로. 저장 대화상자는 테스트에서 경로를 바로 돌려준다.
  const csvPath = path.join(dataDir, 'export.csv');
  await app.evaluate(({ dialog }, p) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: p });
  }, csvPath);
  await win.click('#export-csv');
  await expect.poll(async () => fs.readFile(csvPath, 'utf8').catch(() => '')).toContain('오늘 견적');
  const csv = await fs.readFile(csvPath, 'utf8');
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const lines = csv.slice(1).trim().split('\r\n');
  expect(lines[0]).toBe('업무,담당자,날짜,완료여부,완료일');
  expect(lines).toHaveLength(3);
  expect(csv).not.toContain('지난 보고서');

  await win.fill('#search-input', '');
  await win.locator('#status-filter button[data-status="completed"]').click();
  await expect(win.locator('#empty-message')).toBeVisible();
  await win.locator('#status-filter button[data-status="all"]').click();
  await expect(win.locator('.task-row')).toHaveCount(3);

  await app.close();
});

test('백업 복원: 시작 시 자동 백업 -> 선택 복원 -> 복원 전 파일도 백업', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-manager-e2e-'));
  const original = [{ id: 1, assignee: '김민수', task: '백업된 업무', date: localDate(1), completed: false }];
  await fs.writeFile(path.join(dataDir, 'tasks.json'), JSON.stringify(original), 'utf8');

  let { app, win } = await launch(dataDir); // 시작 시 백업 1개 생성
  await expect(win.locator('.task-row')).toHaveCount(1);
  win.once('dialog', (dialog) => dialog.accept());
  await win.locator('.task-row .delete-btn').click({ force: true });
  await expect(win.locator('#empty-message')).toBeVisible();

  await win.click('#restore-backup');
  await expect(win.locator('#backup-dialog')).toBeVisible();
  await win.locator('#backup-dialog input[name="backup"]').first().check();
  win.once('dialog', (dialog) => dialog.accept());
  await win.click('#backup-restore-btn');
  await expect(win.locator('.task-row')).toHaveCount(1);
  await expect(win.locator('.task-row')).toContainText('백업된 업무');

  const names = await fs.readdir(path.join(dataDir, 'backups'));
  expect(names.some((n) => n.endsWith('-before-restore.json'))).toBe(true);
  await app.close();

  ({ app, win } = await launch(dataDir));
  await expect(win.locator('.task-row')).toHaveCount(1);
  await app.close();
});

test('기존 v1.1 형식 tasks.json을 그대로 읽는다', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-manager-e2e-'));
  const v11 = [
    { id: 1727136000000, assignee: '김민수', task: 'v1.1에서 만든 업무', date: '2026-09-24', completed: true },
    { id: 1727136000001, assignee: '홍길동', task: 'v1.1 미완료 업무', date: '2099-01-01', completed: false },
  ];
  await fs.writeFile(path.join(dataDir, 'tasks.json'), JSON.stringify(v11, null, 2), 'utf8');
  const { app, win } = await launch(dataDir);
  await expect(win.locator('.task-row')).toHaveCount(2);
  await expect(win.locator('.task-row.completed')).toContainText('v1.1에서 만든 업무');
  await app.close();
  expect(await readTasks(dataDir)).toEqual(v11); // 읽기만 했을 때 파일 내용 불변
});
