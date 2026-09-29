'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { toCsv, csvFileName, CSV_HEADER, filterTasks, sortTasks } = require('../renderer/logic.js');

test('toCsv: UTF-8 BOM으로 시작하고 열 순서가 업무/담당자/날짜/완료여부/완료일', () => {
  const csv = toCsv([]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(csv, '﻿업무,담당자,날짜,완료여부,완료일\r\n');
  assert.deepEqual(CSV_HEADER, ['업무', '담당자', '날짜', '완료여부', '완료일']);
});

test('toCsv: 완료여부와 완료일', () => {
  const csv = toCsv([
    { id: 1, task: '보고서', assignee: '김민수', date: '2026-09-29', completed: true, completedAt: '2026-09-30' },
    { id: 2, task: '견적', assignee: '홍길동', date: '2026-10-01', completed: false, completedAt: '2026-09-01' },
    { id: 3, task: '옛 데이터', assignee: '홍길동', date: '2026-09-01', completed: true },
  ]);
  const lines = csv.slice(1).split('\r\n');
  assert.equal(lines[1], '보고서,김민수,2026-09-29,완료,2026-09-30');
  assert.equal(lines[2], '견적,홍길동,2026-10-01,미완료,');
  assert.equal(lines[3], '옛 데이터,홍길동,2026-09-01,완료,');
  assert.equal(lines[4], '');
});

test('toCsv: 쉼표·따옴표·줄바꿈은 따옴표로 감싸고 따옴표는 두 번 쓴다', () => {
  const csv = toCsv([{ id: 1, task: 'A, "B"\n다음 줄', assignee: '김', date: '2026-09-29', completed: false }]);
  const body = csv.slice(1).split('\r\n').slice(1).join('\r\n');
  assert.equal(body, '"A, ""B""\n다음 줄",김,2026-09-29,미완료,\r\n');
});

test('toCsv: 엑셀 수식으로 해석될 값은 앞에 작은따옴표를 붙인다', () => {
  const csv = toCsv([{ id: 1, task: '=HYPERLINK("x")', assignee: '+82', date: '2026-09-29', completed: false }]);
  const line = csv.slice(1).split('\r\n')[1];
  assert.equal(line, `"'=HYPERLINK(""x"")",'+82,2026-09-29,미완료,`);
});

test('CSV 내보내기는 현재 필터가 적용된 목록(정렬 포함)을 그대로 쓴다', () => {
  const tasks = [
    { id: 1, task: 'a', assignee: '김민수', date: '2026-09-30', completed: false },
    { id: 2, task: 'b', assignee: '홍길동', date: '2026-09-29', completed: false },
    { id: 3, task: 'c', assignee: '김민수', date: '2026-09-28', completed: true },
  ];
  const visible = filterTasks(sortTasks(tasks), { status: 'all', assignee: '김민수', query: '' });
  const rows = toCsv(visible).slice(1).trim().split('\r\n').slice(1);
  assert.deepEqual(rows.map((r) => r.split(',')[0]), ['a', 'c']);
});

test('csvFileName', () => {
  assert.equal(csvFileName('2026-09-29'), '업무목록-20260929.csv');
});
