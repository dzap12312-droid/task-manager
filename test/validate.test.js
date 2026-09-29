'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeTasks, sanitizeCsv } = require('../src/validate.js');

test('sanitizeTasks: 정상 데이터와 추가 필드(completedAt)는 그대로 통과', () => {
  const tasks = [
    { id: 1, assignee: 'a', task: 'b', date: '2026-09-29', completed: false },
    { id: 2, assignee: 'a', task: 'c', date: '2026-09-29', completed: true, completedAt: '2026-09-30' },
  ];
  assert.deepEqual(sanitizeTasks(tasks), tasks);
});

test('sanitizeTasks: 배열이 아니거나 필수 필드가 잘못되면 저장을 거부', () => {
  assert.throws(() => sanitizeTasks({}));
  assert.throws(() => sanitizeTasks([null]));
  assert.throws(() => sanitizeTasks([{ id: 'x', assignee: 'a', task: 'b', date: '2026-09-29' }]));
  assert.throws(() => sanitizeTasks([{ id: 1, assignee: 'a', task: 5, date: '2026-09-29' }]));
  assert.throws(() => sanitizeTasks([{ id: 1, assignee: 'a', task: 'x'.repeat(5000), date: '2026-09-29' }]));
});

test('sanitizeTasks: 객체/함수 같은 값과 __proto__ 키는 버리고 completed는 불리언으로', () => {
  const input = JSON.parse('[{"id":1,"assignee":"a","task":"b","date":"2026-09-29","completed":"yes","nested":{"x":1},"__proto__":{"polluted":true}}]');
  const [out] = sanitizeTasks(input);
  assert.equal(out.completed, false);
  assert.equal('nested' in out, false);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
});

test('sanitizeCsv', () => {
  assert.equal(sanitizeCsv('﻿a,b'), '﻿a,b');
  assert.throws(() => sanitizeCsv(123));
});
