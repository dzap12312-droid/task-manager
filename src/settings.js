'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

// 화면 설정(테마). 업무 데이터(tasks.json)와 같은 데이터 폴더의 settings.json에 저장.

const THEMES = ['system', 'light', 'dark'];
const DEFAULTS = Object.freeze({ theme: 'system' });

function normalizeSettings(raw) {
  const out = { ...DEFAULTS };
  if (raw && typeof raw === 'object' && THEMES.includes(raw.theme)) out.theme = raw.theme;
  return out;
}

// 창을 만들기 전에 테마를 적용해야 깜빡임이 없으므로 동기 읽기.
function readSettingsSync(filePath) {
  try {
    return normalizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8').replace(/^﻿/, '')));
  } catch {
    return { ...DEFAULTS };
  }
}

async function writeSettings(filePath, settings) {
  const data = normalizeSettings(settings);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, filePath);
  return data;
}

module.exports = { THEMES, readSettingsSync, writeSettings, normalizeSettings };
