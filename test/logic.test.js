'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  todayLocalDateString,
  generateUniqueId,
  sortTasks,
  filterTasks,
  getAssigneeList,
} = require('../renderer/logic.js');

test('todayLocalDateString은 로컬 연월일을 사용한다 (UTC 변환 없음)', () => {
  // UTC 기준 2026-09-24 23:30 == 베트남(UTC+7) 기준 2026-09-25 06:30
  const localMidnightNext = new Date(2026, 8, 25, 6, 30, 0);
  assert.equal(todayLocalDateString(localMidnightNext), '2026-09-25');

  const localBeforeMidnight = new Date(2026, 8, 24, 23, 59, 0);
  assert.equal(todayLocalDateString(localBeforeMidnight), '2026-09-24');
});

test('generateUniqueId는 충돌 시 다음 값으로 증가한다', () => {
  const existing = new Set([100, 101, 102]);
  const id = (() => {
    const before = Date.now;
    Date.now = () => 100;
    try {
      return generateUniqueId(existing);
    } finally {
      Date.now = before;
    }
  })();
  assert.equal(id, 103);
});

test('sortTasks: 미완료 먼저, 날짜 오름차순, 같은 날짜면 id 오름차순', () => {
  const tasks = [
    { id: 3, date: '2026-09-25', completed: false },
    { id: 1, date: '2026-09-24', completed: true },
    { id: 2, date: '2026-09-24', completed: false },
    { id: 4, date: '2026-09-24', completed: false },
  ];
  const sorted = sortTasks(tasks).map((t) => t.id);
  assert.deepEqual(sorted, [2, 4, 3, 1]);
});

test('sortTasks는 원본 배열을 변경하지 않는다', () => {
  const tasks = [
    { id: 2, date: '2026-09-24', completed: false },
    { id: 1, date: '2026-09-23', completed: false },
  ];
  const original = [...tasks];
  sortTasks(tasks);
  assert.deepEqual(tasks, original);
});

test('filterTasks: 상태 필터', () => {
  const tasks = [
    { id: 1, assignee: 'a', completed: true },
    { id: 2, assignee: 'a', completed: false },
  ];
  assert.equal(filterTasks(tasks, { status: 'completed' }).length, 1);
  assert.equal(filterTasks(tasks, { status: 'incomplete' }).length, 1);
  assert.equal(filterTasks(tasks, { status: 'all' }).length, 2);
});

test('filterTasks: 담당자 필터', () => {
  const tasks = [
    { id: 1, assignee: '김민수', completed: false },
    { id: 2, assignee: '홍길동', completed: false },
  ];
  assert.equal(filterTasks(tasks, { assignee: '김민수' }).length, 1);
});

test('filterTasks: 상태 x 담당자 AND 조합', () => {
  const tasks = [
    { id: 1, assignee: '김민수', completed: true },
    { id: 2, assignee: '김민수', completed: false },
    { id: 3, assignee: '홍길동', completed: false },
  ];
  const result = filterTasks(tasks, { status: 'incomplete', assignee: '김민수' });
  assert.deepEqual(result.map((t) => t.id), [2]);
});

test('getAssigneeList: 중복 제거 후 가나다순', () => {
  const tasks = [
    { id: 1, assignee: '홍길동' },
    { id: 2, assignee: '김철수' },
    { id: 3, assignee: '홍길동' },
  ];
  assert.deepEqual(getAssigneeList(tasks), ['김철수', '홍길동']);
});

test('filterTasks: 검색어는 업무명·담당자를 대소문자 무시로 찾는다', () => {
  const tasks = [
    { id: 1, assignee: '김민수', task: '주간 보고서 작성', completed: false },
    { id: 2, assignee: 'Alex Kim', task: '견적 요청', completed: false },
    { id: 3, assignee: '홍길동', task: '회의록 정리', completed: true },
  ];
  assert.deepEqual(filterTasks(tasks, { query: '보고서' }).map((t) => t.id), [1]);
  assert.deepEqual(filterTasks(tasks, { query: 'alex' }).map((t) => t.id), [2]);
  assert.deepEqual(filterTasks(tasks, { query: '  홍길동 ' }).map((t) => t.id), [3]);
  assert.deepEqual(filterTasks(tasks, { query: '홍길동', status: 'incomplete' }).map((t) => t.id), []);
  assert.equal(filterTasks(tasks, { query: '' }).length, 3);
});

test('normalizeTasks: v1.1 데이터를 그대로 읽고, 추가 필드는 보존한다', () => {
  const { normalizeTasks } = require('../renderer/logic.js');
  const v11 = [{ id: 1727136000000, assignee: '김민수', task: '보고서', date: '2026-09-24', completed: true }];
  assert.deepEqual(normalizeTasks(v11), v11);

  const withExtra = [{ id: 1, assignee: 'a', task: 'b', date: '2026-09-24', completed: true, completedAt: '2026-09-25', memo: 'x' }];
  assert.deepEqual(normalizeTasks(withExtra), withExtra);
});

test('normalizeTasks: 이상한 항목은 건너뛰고 형식을 맞춘다', () => {
  const { normalizeTasks } = require('../renderer/logic.js');
  const out = normalizeTasks([null, 'x', [], { id: '5', task: 1, completed: 'yes' }, { id: 5, task: 'dup' }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].id, 5);
  assert.equal(out[0].task, '1');
  assert.equal(out[0].assignee, '');
  assert.equal(out[0].date, '');
  assert.equal(out[0].completed, false);
  assert.notEqual(out[1].id, 5); // 중복 id는 새 id로
  assert.deepEqual(normalizeTasks({ not: 'array' }), []);
});

test('assigneeInitial: 한글은 첫 글자, 영문 두 단어는 머리글자 2개', () => {
  const { assigneeInitial } = require('../renderer/logic.js');
  assert.equal(assigneeInitial('김민수'), '김');
  assert.equal(assigneeInitial('alex kim'), 'AK');
  assert.equal(assigneeInitial('Alex'), 'A');
  assert.equal(assigneeInitial('  '), '?');
  assert.equal(assigneeInitial(undefined), '?');
});

test('assigneeColorIndex: 같은 이름은 항상 같은 색, 0~7 범위', () => {
  const { assigneeColorIndex } = require('../renderer/logic.js');
  const names = ['김민수', '홍길동', '이영희', '박지성', 'Alex Kim', '최', ''];
  for (const n of names) {
    const i = assigneeColorIndex(n);
    assert.ok(Number.isInteger(i) && i >= 0 && i < 8);
    assert.equal(assigneeColorIndex(n), i);
  }
  assert.ok(new Set(names.map((n) => assigneeColorIndex(n))).size > 1);
});
