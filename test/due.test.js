'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { dueStatus, countDue, relativeDateLabel, buildDueNotification } = require('../renderer/logic.js');

const TODAY = '2026-09-29';

test('dueStatus: 지연/오늘/남음/완료/날짜없음', () => {
  assert.equal(dueStatus({ date: '2026-09-28', completed: false }, TODAY), 'overdue');
  assert.equal(dueStatus({ date: '2026-09-29', completed: false }, TODAY), 'today');
  assert.equal(dueStatus({ date: '2026-09-30', completed: false }, TODAY), 'upcoming');
  assert.equal(dueStatus({ date: '2026-09-01', completed: true }, TODAY), 'done');
  assert.equal(dueStatus({ date: '', completed: false }, TODAY), 'none');
  assert.equal(dueStatus({ date: '2026-13-45', completed: false }, TODAY), 'none');
});

test('dueStatus: 월/연도 경계와 서머타임 없이 날짜 단위로 비교한다', () => {
  assert.equal(dueStatus({ date: '2025-12-31', completed: false }, '2026-01-01'), 'overdue');
  assert.equal(dueStatus({ date: '2026-03-01', completed: false }, '2026-02-28'), 'upcoming');
});

test('countDue: 완료 항목은 세지 않는다', () => {
  const tasks = [
    { date: '2026-09-29', completed: false },
    { date: '2026-09-29', completed: true },
    { date: '2026-09-20', completed: false },
    { date: '2026-09-21', completed: false },
    { date: '2026-10-05', completed: false },
  ];
  assert.deepEqual(countDue(tasks, TODAY), { today: 1, overdue: 2 });
  assert.deepEqual(countDue([], TODAY), { today: 0, overdue: 0 });
});

test('relativeDateLabel: 오늘/내일/N일 지남/N일 후/날짜', () => {
  assert.equal(relativeDateLabel('2026-09-29', TODAY), '오늘');
  assert.equal(relativeDateLabel('2026-09-30', TODAY), '내일');
  assert.equal(relativeDateLabel('2026-09-26', TODAY), '3일 지남');
  assert.equal(relativeDateLabel('2026-09-28', TODAY), '1일 지남');
  assert.equal(relativeDateLabel('2026-10-02', TODAY), '3일 후');
  assert.equal(relativeDateLabel('2026-10-15', TODAY), '10월 15일');
  assert.equal(relativeDateLabel('2027-01-05', TODAY), '2027년 1월 5일');
  assert.equal(relativeDateLabel('2026-09-20', TODAY, { completed: true }), '9월 20일');
  assert.equal(relativeDateLabel('', TODAY), '');
});

test('buildDueNotification: 알림 문구', () => {
  assert.equal(buildDueNotification({ today: 0, overdue: 0 }), null);
  assert.deepEqual(buildDueNotification({ today: 2, overdue: 1 }), {
    title: '업무관리',
    body: '오늘 마감 2건, 지연 1건이 있습니다.',
  });
  assert.equal(buildDueNotification({ today: 0, overdue: 3 }).body, '지연 3건이 있습니다.');
  assert.equal(buildDueNotification({ today: 1, overdue: 0 }).body, '오늘 마감 1건이 있습니다.');
});
