'use strict';

// README용 스크린샷 생성: 실제 Electron 앱을 가상 데이터로 띄워 라이트/다크 × 900px/600px 캡처.
// 사용: npm run screenshots   (Linux 서버: xvfb-run -a npm run screenshots)
// 실제 업무 데이터는 사용하지 않는다(임시 폴더 + 가상 데이터).

const { _electron: electron } = require('@playwright/test');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screenshots');

function localDate(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const today = localDate(0);
const SAMPLE = [
  { id: 1, task: '메일·결재 확인', assignee: '김민수', date: today, completed: true, completedAt: today, completedPeriod: today, category: 'daily' },
  { id: 2, task: '출고 현황 점검', assignee: '이서연', date: today, completed: false, category: 'daily' },
  { id: 3, task: '주간 업무 보고', assignee: '김민수', date: '', completed: false, category: 'weekly', weekday: 5 },
  { id: 4, task: '팀 회의록 공유', assignee: '박지훈', date: '', completed: false, category: 'weekly', weekday: 1 },
  { id: 5, task: '월말 비용 정산', assignee: '최유진', date: '', completed: false, category: 'monthly', monthDay: 31 },
  { id: 6, task: '월간 실적 보고서 제출', assignee: '김민수', date: localDate(-3), completed: false },
  { id: 7, task: '거래처 견적서 검토', assignee: '이서연', date: localDate(1), completed: false },
  { id: 8, task: '사무용품 발주', assignee: '최유진', date: localDate(12), completed: false },
];

async function shoot(theme, width, file, { hoverRow = null, tab = null } = {}) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'task-manager-shot-'));
  await fs.writeFile(path.join(dataDir, 'tasks.json'), JSON.stringify(SAMPLE, null, 2));
  await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify({ theme }));

  const args = [ROOT];
  if (process.platform === 'linux' && process.getuid && process.getuid() === 0) args.push('--no-sandbox');
  const app = await electron.launch({ args, colorScheme: null, env: { ...process.env, TASK_MANAGER_DATA_DIR: dataDir } });
  const win = await app.firstWindow();
  await win.waitForSelector('.task-row');
  await app.evaluate(({ BrowserWindow }, w) => {
    const bw = BrowserWindow.getAllWindows()[0];
    bw.setMinimumSize(300, 300);
    bw.setContentSize(w, 820);
  }, width);
  await win.waitForFunction((w) => window.innerWidth === w, width);
  if (tab) await win.click(`#category-filter button[data-category="${tab}"]`);
  await win.evaluate(() => document.activeElement && document.activeElement.blur());
  if (hoverRow !== null) await win.locator('.task-row').nth(hoverRow).hover();
  else await win.mouse.move(1, 1);
  await win.waitForTimeout(300);
  await win.screenshot({ path: path.join(OUT, file) });
  await app.close();
  console.log('saved', file);
}

(async () => {
  await fs.mkdir(OUT, { recursive: true });
  await shoot('light', 900, 'light.png', { hoverRow: 1 });
  await shoot('light', 900, 'light-weekly.png', { tab: 'weekly' });
  await shoot('dark', 900, 'dark.png', { hoverRow: 1 });
  await shoot('light', 600, 'light-600.png');
  await shoot('dark', 600, 'dark-600.png');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
