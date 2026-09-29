'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { readSettingsSync, writeSettings, normalizeSettings } = require('../src/settings.js');

test('settings: 없거나 깨진 파일이면 system 테마', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tm-settings-'));
  const file = path.join(dir, 'settings.json');
  assert.deepEqual(readSettingsSync(file), { theme: 'system' });
  await fs.writeFile(file, '{oops', 'utf8');
  assert.deepEqual(readSettingsSync(file), { theme: 'system' });
});

test('settings: 선택한 테마를 저장하고 다시 읽는다, 이상한 값은 무시', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tm-settings-'));
  const file = path.join(dir, 'settings.json');
  await writeSettings(file, { theme: 'dark' });
  assert.deepEqual(readSettingsSync(file), { theme: 'dark' });
  assert.deepEqual(normalizeSettings({ theme: 'neon' }), { theme: 'system' });
});
