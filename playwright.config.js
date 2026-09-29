'use strict';

// E2E 전용 설정: test/e2e.spec.js만 실행(_backup_v1.1 등 다른 폴더는 제외).
module.exports = {
  testDir: 'test',
  testMatch: 'e2e.spec.js',
  workers: 1,
  timeout: 60000,
  reporter: 'list',
};
