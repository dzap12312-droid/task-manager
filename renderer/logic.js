'use strict';

// 순수 함수 모음: 정렬, 필터, 날짜, id 생성, 마감 판정, 업무 구분(반복), CSV.
// main/renderer 양쪽에서 재사용 + node --test로 단위 테스트.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// 업무 구분. category 필드가 없는 기존 데이터(v1.1/v1.2)는 모두 'once'(비정기업무).
// - daily  : 매일 반복. 완료 체크는 그날만 유효(completedPeriod = 그날 날짜)
// - weekly : 매주 weekday(1=월 … 7=일). 완료 체크는 그 주(월~일)만 유효(completedPeriod = 그 주 월요일)
// - monthly: 매월 monthDay(1~31, 없는 날은 그달 말일). 완료 체크는 그 달만 유효(completedPeriod = YYYY-MM)
// - once   : 지정한 날짜(date) 한 번. 기존 방식 그대로(completed 불리언)
const CATEGORIES = ['daily', 'weekly', 'monthly', 'once'];
const CATEGORY_LABEL = { daily: '일일업무', weekly: '주간업무', monthly: '월간업무', once: '비정기업무' };
const WEEKDAY_LABEL = ['', '월', '화', '수', '목', '금', '토', '일'];

function todayLocalDateString(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function generateUniqueId(existingIds) {
  let id = Date.now();
  const idSet = existingIds instanceof Set ? existingIds : new Set(existingIds);
  while (idSet.has(id)) {
    id += 1;
  }
  return id;
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return fallback;
  return n;
}

// 파일에서 읽은 값을 화면에서 안전하게 쓸 수 있도록 정리한다(추가 필드는 그대로 유지).
function normalizeTasks(raw) {
  if (!Array.isArray(raw)) return [];
  const used = new Set();
  const out = [];
  for (const t of raw) {
    if (t === null || typeof t !== 'object' || Array.isArray(t)) continue;
    const task = { ...t };
    let id = typeof task.id === 'string' && task.id.trim() !== '' ? Number(task.id) : task.id;
    if (typeof id !== 'number' || !Number.isFinite(id) || used.has(id)) {
      id = generateUniqueId(used);
    }
    used.add(id);
    task.id = id;
    task.assignee = task.assignee == null ? '' : String(task.assignee);
    task.task = task.task == null ? '' : String(task.task);
    task.date = typeof task.date === 'string' ? task.date : '';
    task.completed = task.completed === true;
    if ('category' in task && !CATEGORIES.includes(task.category)) task.category = 'once';
    if (task.category === 'weekly') task.weekday = clampInt(task.weekday, 1, 7, 1);
    if (task.category === 'monthly') task.monthDay = clampInt(task.monthDay, 1, 31, 1);
    out.push(task);
  }
  return out;
}

// 정렬: 1) 미완료 먼저 2) 날짜 오름차순 3) id 오름차순
function compareTasks(a, b) {
  if (a.completed !== b.completed) {
    return a.completed ? 1 : -1;
  }
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  return a.id - b.id;
}

function sortTasks(tasks) {
  return [...tasks].sort(compareTasks);
}

function normalizeQuery(q) {
  return String(q || '').trim().toLowerCase();
}

// status: 'all' | 'incomplete' | 'completed', assignee: 'all' | 이름, query: 업무명·담당자 검색어,
// category: 'all' | 'daily' | 'weekly' | 'monthly' | 'once'
function filterTasks(tasks, { status = 'all', assignee = 'all', query = '', category = 'all' } = {}) {
  const q = normalizeQuery(query);
  return tasks.filter((t) => {
    if (category !== 'all' && taskCategory(t) !== category) return false;
    if (status === 'incomplete' && t.completed) return false;
    if (status === 'completed' && !t.completed) return false;
    if (assignee !== 'all' && t.assignee !== assignee) return false;
    if (q) {
      const hay = `${t.task || ''}\n${t.assignee || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function getAssigneeList(tasks) {
  const set = new Set(tasks.map((t) => t.assignee));
  return [...set].sort((a, b) => a.localeCompare(b, 'ko'));
}

// ---- 날짜/마감 ----

function dayNumber(dateStr) {
  const m = DATE_RE.exec(dateStr || '');
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  // 2026-13-45 같은 값은 Date가 자동으로 넘겨 버리므로 되돌려 비교해 걸러낸다.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return Math.round(dt.getTime() / 86400000);
}

// 'overdue'(지연) | 'today'(오늘 마감) | 'upcoming'(남음) | 'done'(완료) | 'none'(날짜 없음)
function dueStatus(task, today) {
  if (task.completed) return 'done';
  const d = dayNumber(task.date);
  const t = dayNumber(today);
  if (d === null || t === null) return 'none';
  if (d < t) return 'overdue';
  if (d === t) return 'today';
  return 'upcoming';
}

function countDue(tasks, today) {
  let todayCount = 0;
  let overdue = 0;
  for (const t of tasks) {
    const s = dueStatus(t, today);
    if (s === 'today') todayCount += 1;
    else if (s === 'overdue') overdue += 1;
  }
  return { today: todayCount, overdue };
}

function formatShortDate(dateStr, today) {
  const m = DATE_RE.exec(dateStr || '');
  if (!m) return dateStr || '';
  const sameYear = today && today.slice(0, 4) === m[1];
  const md = `${Number(m[2])}월 ${Number(m[3])}일`;
  return sameYear ? md : `${m[1]}년 ${md}`;
}

// "오늘" / "내일" / "3일 지남" / "4일 후" / "10월 5일"
function relativeDateLabel(dateStr, today, { completed = false } = {}) {
  const d = dayNumber(dateStr);
  const t = dayNumber(today);
  if (d === null || t === null) return dateStr || '';
  if (completed) return formatShortDate(dateStr, today);
  const diff = d - t;
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff < 0) return `${-diff}일 지남`;
  if (diff < 7) return `${diff}일 후`;
  return formatShortDate(dateStr, today);
}

// ---- 업무 구분(반복) ----

function taskCategory(t) {
  return t && CATEGORIES.includes(t.category) ? t.category : 'once';
}

function dateFromDayNumber(n) {
  const dt = new Date(n * 86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

// 1=월 … 7=일
function isoWeekday(dateStr) {
  const n = dayNumber(dateStr);
  if (n === null) return null;
  return ((n + 3) % 7 + 7) % 7 + 1; // 1970-01-01(목) 기준
}

function weekStart(dateStr) {
  const n = dayNumber(dateStr);
  if (n === null) return null;
  return dateFromDayNumber(n - (isoWeekday(dateStr) - 1));
}

function lastDayOfMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// 완료 체크가 유효한 기간의 키. once는 기간 개념이 없어 null
function periodKey(t, today) {
  switch (taskCategory(t)) {
    case 'daily':
      return today;
    case 'weekly':
      return weekStart(today);
    case 'monthly':
      return String(today).slice(0, 7);
    default:
      return null;
  }
}

// 이번 기간의 마감일(once는 지정한 날짜 그대로)
function currentDueDate(t, today) {
  switch (taskCategory(t)) {
    case 'daily':
      return today;
    case 'weekly': {
      const start = dayNumber(weekStart(today));
      if (start === null) return '';
      return dateFromDayNumber(start + clampInt(t.weekday, 1, 7, 1) - 1);
    }
    case 'monthly': {
      const m = DATE_RE.exec(today || '');
      if (!m) return '';
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Math.min(clampInt(t.monthDay, 1, 31, 1), lastDayOfMonth(y, mo));
      return `${m[1]}-${m[2]}-${String(d).padStart(2, '0')}`;
    }
    default:
      return t.date;
  }
}

function isCompletedNow(t, today) {
  if (taskCategory(t) === 'once') return t.completed === true;
  return t.completed === true && t.completedPeriod === periodKey(t, today);
}

// 화면·정렬·필터·CSV용: 반복 업무는 이번 기간의 마감일과 완료 여부로 바꿔서 보여 준다(저장값은 그대로).
function toViewTasks(tasks, today) {
  return tasks.map((t) => ({
    ...t,
    category: taskCategory(t),
    date: currentDueDate(t, today),
    completed: isCompletedNow(t, today),
  }));
}

// 완료 체크/해제 결과를 저장용 객체로 반환
function setCompleted(t, done, today) {
  const next = { ...t, completed: done };
  if (done) next.completedAt = today;
  else delete next.completedAt;
  if (taskCategory(t) !== 'once') {
    if (done) next.completedPeriod = periodKey(t, today);
    else delete next.completedPeriod;
  }
  return next;
}

function recurrenceLabel(t) {
  switch (taskCategory(t)) {
    case 'daily':
      return '매일';
    case 'weekly':
      return `매주 ${WEEKDAY_LABEL[clampInt(t.weekday, 1, 7, 1)]}요일`;
    case 'monthly': {
      const d = clampInt(t.monthDay, 1, 31, 1);
      return d === 31 ? '매월 말일' : `매월 ${d}일`;
    }
    default:
      return '';
  }
}

// 완료한 반복 업무의 날짜 자리 표시("오늘 완료" 등). 비정기는 null
function periodDoneLabel(t) {
  return { daily: '오늘 완료', weekly: '이번 주 완료', monthly: '이번 달 완료' }[taskCategory(t)] || null;
}

// 구분별 미완료 건수 (viewTasks 기준)
function countOpenByCategory(viewTasks) {
  const counts = { all: 0, daily: 0, weekly: 0, monthly: 0, once: 0 };
  for (const t of viewTasks) {
    if (t.completed) continue;
    counts.all += 1;
    counts[taskCategory(t)] += 1;
  }
  return counts;
}

function buildDueNotification({ today = 0, overdue = 0 } = {}) {
  if (!today && !overdue) return null;
  const parts = [];
  if (today) parts.push(`오늘 마감 ${today}건`);
  if (overdue) parts.push(`지연 ${overdue}건`);
  return { title: '업무관리', body: `${parts.join(', ')}이 있습니다.` };
}

// ---- 담당자 뱃지 ----

function assigneeInitial(name) {
  const s = String(name || '').trim();
  if (!s) return '?';
  const words = s.split(/\s+/);
  if (/^[A-Za-z]/.test(s) && words.length > 1) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return Array.from(s)[0].toUpperCase();
}

function assigneeColorIndex(name, paletteSize = 8) {
  let h = 0;
  for (const ch of String(name || '')) {
    h = (h * 31 + ch.codePointAt(0)) >>> 0;
  }
  return h % paletteSize;
}

// ---- CSV ----

const CSV_HEADER = ['업무', '담당자', '날짜', '완료여부', '완료일', '구분'];

function csvCell(value) {
  let s = value == null ? '' : String(value);
  // 엑셀 수식 실행 방지(CSV injection): =, +, -, @, 탭, CR로 시작하면 앞에 ' 를 붙인다.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// UTF-8 BOM 포함(엑셀에서 한글이 깨지지 않음), 줄바꿈 CRLF
function toCsv(tasks) {
  const lines = [CSV_HEADER.map(csvCell).join(',')];
  for (const t of tasks) {
    lines.push(
      [
        t.task,
        t.assignee,
        t.date,
        t.completed ? '완료' : '미완료',
        t.completed ? t.completedAt || '' : '',
        CATEGORY_LABEL[taskCategory(t)] + (recurrenceLabel(t) ? `(${recurrenceLabel(t)})` : ''),
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return `﻿${lines.join('\r\n')}\r\n`;
}

function csvFileName(today) {
  return `업무목록-${String(today || '').replace(/-/g, '')}.csv`;
}

const Logic = {
  todayLocalDateString,
  generateUniqueId,
  normalizeTasks,
  compareTasks,
  sortTasks,
  filterTasks,
  getAssigneeList,
  dueStatus,
  countDue,
  relativeDateLabel,
  formatShortDate,
  buildDueNotification,
  assigneeInitial,
  assigneeColorIndex,
  CATEGORIES,
  CATEGORY_LABEL,
  WEEKDAY_LABEL,
  taskCategory,
  isoWeekday,
  weekStart,
  periodKey,
  currentDueDate,
  isCompletedNow,
  toViewTasks,
  setCompleted,
  recurrenceLabel,
  periodDoneLabel,
  countOpenByCategory,
  CSV_HEADER,
  toCsv,
  csvFileName,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Logic;
} else {
  window.Logic = Logic;
}
