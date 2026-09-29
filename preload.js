'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadTasks: () => ipcRenderer.invoke('tasks:load'),
  saveTasks: (tasks) => ipcRenderer.invoke('tasks:save', tasks),
  listBackups: () => ipcRenderer.invoke('backups:list'),
  restoreBackup: (name) => ipcRenderer.invoke('backups:restore', name),
  openBackupFolder: () => ipcRenderer.invoke('backups:openFolder'),
  saveCsv: (content, suggestedName) => ipcRenderer.invoke('csv:save', content, suggestedName),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setTheme: (theme) => ipcRenderer.invoke('settings:setTheme', theme),
});
