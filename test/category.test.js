'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../renderer/logic.js');

// 2026-09-29 = 화요일, 그 주 월요일 = 2026-09-28
const TUE = '2026-09-29';

test('기존 데이터(category 없음)는 비정기업무로 취급하고 동작이 그대로다', () => {
  const t = { id: 1, task: 'a', assignee: 'b', date: '2026-09-20', completed: false };
  assert.equal(L.taskCategory(t), 'once');
  const [v] = L.toViewTasks([t], TUE);
  assert.equal(v.date, '2026-09-20');
  assert.equal(v.completed, false);
  assert.equal(L.dueStatus(v, TUE), 'overdue');
  assert.equal(L.recurrenceLabel(t), '');
  // 저장값을 바꾸지 않는다
  assert.deepEqual(t, { id: 1, task: 'a', assignee: 'b', date: '2026-09-20', completed: false });
});

test('요일 계산: 1=월 … 7=일, 주 시작은 월요일', () => {
  assert.equal(L.isoWeekday('2026-09-28'), 1);
  assert.equal(L.isoWeekday('2026-09-29'), 2);
  assert.equal(L.isoWeekday('2026-10-04'), 7);
  assert.equal(L.weekStart('2026-10-04'), '2026-09-28');
  assert.equal(L.weekStart('2026-10-05'), '2026-10-05');
  assert.equal(L.weekStart('2027-01-01'), '2026-12-28'); // 연도 경계
});

test('일일업무: 매일 오늘 마감, 완료는 그날만 유지', () => {
  const t = { id: 1, task: '메일 확인', assignee: 'a', date: '', completed: false, category: 'daily' };
  let [v] = L.toViewTasks([t], TUE);
  assert.equal(v.date, TUE);
  assert.equal(L.dueStatus(v, TUE), 'today');

  const done = L.setCompleted(t, true, TUE);
  assert.equal(done.completedPeriod, TUE);
  assert.equal(done.completedAt, TUE);
  assert.equal(L.isCompletedNow(done, TUE), true);
  assert.equal(L.isCompletedNow(done, '2026-09-30'), false); // 다음 날 다시 미완료

  const undone = L.setCompleted(done, false, TUE);
  assert.equal('completedPeriod' in undone, false);
  assert.equal('completedAt' in undone, false);
  assert.equal(undone.completed, false);
});

test('주간업무: 이번 주 지정 요일이 마감, 완료는 그 주만 유지', () => {
  const mon = { id: 1, category: 'weekly', weekday: 1, completed: false };
  const fri = { id: 2, category: 'weekly', weekday: 5, completed: false };
  const [vMon, vFri] = L.toViewTasks([mon, fri], TUE);
  assert.equal(vMon.date, '2026-09-28');
  assert.equal(L.dueStatus(vMon, TUE), 'overdue'); // 월요일이 지났는데 미완료
  assert.equal(vFri.date, '2026-10-02');
  assert.equal(L.dueStatus(vFri, TUE), 'upcoming');

  const done = L.setCompleted(fri, true, TUE);
  assert.equal(done.completedPeriod, '2026-09-28');
  assert.equal(L.isCompletedNow(done, '2026-10-04'), true); // 같은 주 일요일
  assert.equal(L.isCompletedNow(done, '2026-10-05'), false); // 다음 주 월요일
  assert.equal(L.recurrenceLabel(fri), '매주 금요일');
});

test('월간업무: 이번 달 지정일이 마감(없는 날은 말일), 완료는 그 달만 유지', () => {
  const d31 = { id: 1, category: 'monthly', monthDay: 31, completed: false };
  const d15 = { id: 2, category: 'monthly', monthDay: 15, completed: false };
  assert.equal(L.currentDueDate(d31, '2026-02-10'), '2026-02-28');
  assert.equal(L.currentDueDate(d31, '2028-02-10'), '2028-02-29'); // 윤년
  assert.equal(L.currentDueDate(d31, TUE), '2026-09-30');
  assert.equal(L.currentDueDate(d15, TUE), '2026-09-15');
  assert.equal(L.dueStatus(L.toViewTasks([d15], TUE)[0], TUE), 'overdue');

  const done = L.setCompleted(d15, true, TUE);
  assert.equal(done.completedPeriod, '2026-09');
  assert.equal(L.isCompletedNow(done, '2026-09-30'), true);
  assert.equal(L.isCompletedNow(done, '2026-10-01'), false);
  assert.equal(L.recurrenceLabel(d31), '매월 말일');
  assert.equal(L.recurrenceLabel(d15), '매월 15일');
});

test('비정기업무 완료는 기간과 무관하게 유지', () => {
  const t = { id: 1, date: '2026-09-20', completed: false };
  const done = L.setCompleted(t, true, TUE);
  assert.equal('completedPeriod' in done, false);
  assert.equal(L.isCompletedNow(done, '2027-01-01'), true);
});

test('filterTasks: 구분 필터와 다른 조건의 AND 조합', () => {
  const tasks = L.toViewTasks(
    [
      { id: 1, task: 'a', assignee: '김', date: '2026-09-30', completed: false },
      { id: 2, task: 'b', assignee: '김', date: '', completed: false, category: 'daily' },
      { id: 3, task: 'c', assignee: '홍', date: '', completed: false, category: 'daily' },
      { id: 4, task: 'd', assignee: '김', date: '', completed: false, category: 'weekly', weekday: 3 },
    ],
    TUE,
  );
  assert.deepEqual(L.filterTasks(tasks, { category: 'daily' }).map((t) => t.id), [2, 3]);
  assert.deepEqual(L.filterTasks(tasks, { category: 'daily', assignee: '김' }).map((t) => t.id), [2]);
  assert.deepEqual(L.filterTasks(tasks, { category: 'once' }).map((t) => t.id), [1]);
  assert.equal(L.filterTasks(tasks, { category: 'all' }).length, 4);
});

test('countOpenByCategory: 구분별 미완료 건수', () => {
  const view = L.toViewTasks(
    [
      { id: 1, date: '2026-09-30', completed: false },
      { id: 2, date: '', completed: false, category: 'daily' },
      L.setCompleted({ id: 3, date: '', completed: false, category: 'daily' }, true, TUE),
      { id: 4, date: '', completed: false, category: 'monthly', monthDay: 1 },
    ],
    TUE,
  );
  assert.deepEqual(L.countOpenByCategory(view), { all: 3, daily: 1, weekly: 0, monthly: 1, once: 1 });
});

test('countDue: 오늘 할 일일업무·지난 주간업무도 요약에 포함', () => {
  const view = L.toViewTasks(
    [
      { id: 1, date: '', completed: false, category: 'daily' },
      { id: 2, date: '', completed: false, category: 'weekly', weekday: 1 },
      { id: 3, date: '2026-10-10', completed: false },
    ],
    TUE,
  );
  assert.deepEqual(L.countDue(view, TUE), { today: 1, overdue: 1 });
});

test('normalizeTasks: 잘못된 구분/요일/날짜 값 보정', () => {
  const out = L.normalizeTasks([
    { id: 1, task: 'a', category: 'yearly' },
    { id: 2, task: 'b', category: 'weekly', weekday: 9 },
    { id: 3, task: 'c', category: 'monthly', monthDay: '15' },
    { id: 4, task: 'd' },
  ]);
  assert.equal(out[0].category, 'once');
  assert.equal(out[1].weekday, 1);
  assert.equal(out[2].monthDay, 15);
  assert.equal('category' in out[3], false); // 기존 데이터에 필드를 억지로 추가하지 않음
});

test('periodDoneLabel: 완료한 반복 업무 표시', () => {
  assert.equal(L.periodDoneLabel({ category: 'daily' }), '오늘 완료');
  assert.equal(L.periodDoneLabel({ category: 'weekly' }), '이번 주 완료');
  assert.equal(L.periodDoneLabel({ category: 'monthly' }), '이번 달 완료');
  assert.equal(L.periodDoneLabel({}), null);
});
