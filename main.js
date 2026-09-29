'use strict';

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { loadTasks, saveTasks } = require('./src/store');

const isDev = !app.isPackaged;
const tasksFilePath = path.join(app.getPath('userData'), 'tasks.json');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    ipcMain.handle('tasks:load', async () => {
      const result = await loadTasks(tasksFilePath);
      if (result.broken) {
        dialog.showMessageBoxSync({
          type: 'warning',
          title: '데이터 파일 손상',
          message:
            '기존 업무 데이터 파일이 손상되어 있어 새 파일로 시작합니다.\n' +
            `손상된 파일은 보존되었습니다:\n${result.brokenPath}`,
        });
      }
      return result.tasks;
    });

    ipcMain.handle('tasks:save', async (_event, tasks) => {
      await saveTasks(tasksFilePath, tasks);
      return true;
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
