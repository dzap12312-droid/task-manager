'use strict';

// renderer에서 넘어온 값을 그대로 디스크에 쓰지 않도록 main 프로세스에서 검사한다.
// 기존 필드(id, assignee, task, date, completed)는 형식을 강제하고,
// v1.2 completedAt, v1.3 category/weekday/monthDay/completedPeriod 및 앞으로 추가될 필드는 문자열/숫자/불리언/null만 통과시킨다.

const { CATEGORIES } = require('../renderer/logic');

const MAX_TASKS = 20000;
const MAX_TEXT = 2000;
const MAX_CSV_BYTES = 20 * 1024 * 1024;

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function isIntIn(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

function isPrimitive(v) {
  return v === null || ['string', 'number', 'boolean'].includes(typeof v);
}

function sanitizeTasks(input) {
  if (!Array.isArray(input)) throw new TypeError('tasks must be an array');
  if (input.length > MAX_TASKS) throw new RangeError('too many tasks');

  return input.map((t, i) => {
    if (!isPlainObject(t)) throw new TypeError(`task[${i}] is not an object`);
    if (typeof t.id !== 'number' || !Number.isFinite(t.id)) throw new TypeError(`task[${i}].id is invalid`);
    if (typeof t.task !== 'string' || t.task.length > MAX_TEXT) throw new TypeError(`task[${i}].task is invalid`);
    if (typeof t.assignee !== 'string' || t.assignee.length > MAX_TEXT) throw new TypeError(`task[${i}].assignee is invalid`);
    if (typeof t.date !== 'string' || t.date.length > 40) throw new TypeError(`task[${i}].date is invalid`);
    if ('category' in t && !CATEGORIES.includes(t.category)) throw new TypeError(`task[${i}].category is invalid`);
    if (t.category === 'weekly' && !isIntIn(t.weekday, 1, 7)) throw new TypeError(`task[${i}].weekday is invalid`);
    if (t.category === 'monthly' && !isIntIn(t.monthDay, 1, 31)) throw new TypeError(`task[${i}].monthDay is invalid`);

    const out = {};
    for (const [key, value] of Object.entries(t)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (!isPrimitive(value)) continue;
      if (typeof value === 'string' && value.length > MAX_TEXT) continue;
      out[key] = value;
    }
    out.completed = t.completed === true;
    return out;
  });
}

function sanitizeCsv(content) {
  if (typeof content !== 'string') throw new TypeError('csv must be a string');
  if (Buffer.byteLength(content, 'utf8') > MAX_CSV_BYTES) throw new RangeError('csv too large');
  return content;
}

module.exports = { sanitizeTasks, sanitizeCsv, MAX_TASKS };
