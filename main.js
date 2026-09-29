'use strict';

const { app, BrowserWindow, ipcMain, dialog, Notification, nativeTheme, shell, session } = require('electron');
const fs = require('fs/promises');
const path = require('path');
const { loadTasks, saveTasks } = require('./src/store');
const { resolveDataDir, migrateLegacyData } = require('./src/paths');
const { createBackup, listBackups, restoreBackup } = require('./src/backup');
const { sanitizeTasks, sanitizeCsv } = require('./src/validate');
const { readSettingsSync, writeSettings, THEMES } = require('./src/settings');
const Logic = require('./renderer/logic');

const APP_ID = 'com.taeyeon.taskmanager'; // package.json build.appId와 동일(변경 금지: 설치 정보/알림 식별자)
const openDevTools = process.argv.includes('--devtools');

// 포터블 exe면 <exe 폴더>\data, 설치형은 %APPDATA%\업무관리
const legacyDir = app.getPath('userData');
const dataInfo = resolveDataDir({ env: process.env, userDataPath: legacyDir });
const dataDir = dataInfo.dir;
const tasksFilePath = path.join(dataDir, 'tasks.json');
const backupDir = path.join(dataDir, 'backups');
const settingsPath = path.join(dataDir, 'settings.json');

let settings = readSettingsSync(settingsPath);
let mainWindow = null;
let startupDone = false;

function applyTheme(theme) {
  nativeTheme.themeSource = THEMES.includes(theme) ? theme : 'system';
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 420,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181c' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  // 외부 페이지로 이동/새 창 열기 차단
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (openDevTools) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

// 앱 시작 시 1회: 오늘 마감/지연이 있으면 Windows 알림
function notifyDueOnce(tasks) {
  const info = Logic.buildDueNotification(Logic.countDue(tasks, Logic.todayLocalDateString()));
  if (!info || !Notification.isSupported()) return;
  const n = new Notification({ title: info.title, body: info.body, silent: false });
  n.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  n.show();
}

function registerIpc() {
  ipcMain.handle('tasks:load', async () => {
    const result = await loadTasks(tasksFilePath);
    if (result.broken) {
      dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        title: '데이터 파일 손상',
        message:
          '기존 업무 데이터 파일이 손상되어 있어 새 파일로 시작합니다.\n' +
          `손상된 파일은 보존되었습니다:\n${result.brokenPath}\n\n` +
          '[백업 복원] 버튼으로 이전 백업을 되살릴 수 있습니다.',
      });
    }
    const tasks = Logic.normalizeTasks(result.tasks);
    if (!startupDone) {
      startupDone = true;
      notifyDueOnce(tasks);
    }
    return tasks;
  });

  ipcMain.handle('tasks:save', async (_event, tasks) => {
    await saveTasks(tasksFilePath, sanitizeTasks(tasks));
    return true;
  });

  ipcMain.handle('backups:list', async () => listBackups(backupDir));

  ipcMain.handle('backups:restore', async (_event, name) => {
    const { tasks, safetyName } = await restoreBackup(tasksFilePath, backupDir, name);
    return { tasks: Logic.normalizeTasks(tasks), safetyName };
  });

  ipcMain.handle('backups:openFolder', async () => {
    await fs.mkdir(backupDir, { recursive: true });
    const err = await shell.openPath(backupDir);
    return err === '';
  });

  ipcMain.handle('csv:save', async (_event, content, suggestedName) => {
    const csv = sanitizeCsv(content);
    const baseName = path.basename(String(suggestedName || 'tasks.csv')).replace(/[\\/:*?"<>|]/g, '_');
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
      title: 'CSV로 내보내기',
      defaultPath: path.join(app.getPath('documents'), baseName.endsWith('.csv') ? baseName : `${baseName}.csv`),
      filters: [{ name: 'CSV (엑셀)', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return { saved: false };
    await fs.writeFile(filePath, csv, 'utf8');
    return { saved: true, filePath };
  });

  ipcMain.handle('settings:get', async () => ({ ...settings, portable: dataInfo.portable }));

  ipcMain.handle('settings:setTheme', async (_event, theme) => {
    settings = await writeSettings(settingsPath, { ...settings, theme });
    applyTheme(settings.theme);
    return settings.theme;
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  if (process.platform === 'win32') app.setAppUserModelId(APP_ID);
  applyTheme(settings.theme);

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // 렌더러의 권한 요청(카메라, 위치 등)은 모두 거부
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

    if (dataInfo.portable) {
      try {
        await migrateLegacyData(legacyDir, dataDir);
      } catch (err) {
        console.error('legacy data migration failed:', err);
      }
    }
    try {
      await createBackup(tasksFilePath, backupDir);
    } catch (err) {
      console.error('startup backup failed:', err);
    }

    registerIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
