'use strict';

(function () {
  const L = window.Logic;
  const $ = (id) => document.getElementById(id);

  const form = $('add-form');
  const taskInput = $('task-input');
  const assigneeInput = $('assignee-input');
  const dateInput = $('date-input');
  const assigneeList = $('assignee-list');
  const statusFilterEl = $('status-filter');
  const assigneeFilterEl = $('assignee-filter');
  const searchInput = $('search-input');
  const listEl = $('task-list');
  const emptyMessage = $('empty-message');
  const dueSummary = $('due-summary');
  const exportBtn = $('export-csv');
  const restoreBtn = $('restore-backup');
  const themeBtn = $('theme-toggle');
  const backupDialog = $('backup-dialog');
  const backupListEl = $('backup-list');
  const backupRestoreBtn = $('backup-restore-btn');
  const backupOpenFolderBtn = $('backup-open-folder');
  const toast = $('toast');

  const THEME_ORDER = ['system', 'light', 'dark'];
  const THEME_LABEL = { system: '시스템', light: '라이트', dark: '다크' };
  const TRANSITION_MS = 150;

  let tasks = [];
  let statusFilter = 'all';
  let assigneeFilter = 'all';
  let query = '';
  let theme = 'system';
  let toastTimer = null;

  const today = () => L.todayLocalDateString();

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function clearInvalid(...inputs) {
    for (const input of inputs) input.classList.remove('invalid');
  }

  function markInvalid(input) {
    input.classList.add('invalid');
    input.focus();
  }

  function showToast(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 4000);
  }

  async function persist() {
    try {
      await window.api.saveTasks(tasks);
    } catch (err) {
      console.error(err);
      window.alert('저장하지 못했습니다. 디스크 공간이나 폴더 권한을 확인해 주세요.');
    }
  }

  function visibleTasks() {
    return L.filterTasks(L.sortTasks(tasks), { status: statusFilter, assignee: assigneeFilter, query });
  }

  // ---- 렌더링 ----

  function renderSummary() {
    const { today: todayCount, overdue } = L.countDue(tasks, today());
    const t = el('span', 'sum-today' + (todayCount ? ' has' : ''), `오늘 ${todayCount}건`);
    const o = el('span', 'sum-overdue' + (overdue ? ' has' : ''), `지연 ${overdue}건`);
    dueSummary.replaceChildren(t, el('span', 'sum-sep', ' / '), o);
  }

  function renderAssignees() {
    const names = L.getAssigneeList(tasks).filter((n) => n !== '');
    assigneeList.replaceChildren(
      ...names.map((name) => {
        const opt = el('option');
        opt.value = name;
        return opt;
      }),
    );

    if (assigneeFilter !== 'all' && !names.includes(assigneeFilter)) assigneeFilter = 'all';
    const all = el('option', '', '전체 담당자');
    all.value = 'all';
    assigneeFilterEl.replaceChildren(
      all,
      ...names.map((name) => {
        const opt = el('option', '', name);
        opt.value = name;
        return opt;
      }),
    );
    assigneeFilterEl.value = assigneeFilter;
  }

  function buildRow(t, todayStr) {
    const due = L.dueStatus(t, todayStr);
    const li = el('li', 'task-row');
    if (t.completed) li.classList.add('completed');
    if (due === 'overdue' || due === 'today') li.classList.add(`due-${due}`);
    li.dataset.id = String(t.id);

    const check = el('input', 'task-check');
    check.type = 'checkbox';
    check.checked = t.completed;
    check.setAttribute('aria-label', `완료 표시: ${t.task}`);
    check.addEventListener('change', () => toggleCompleted(t.id, li));

    const main = el('div', 'task-main');
    const title = el('div', 'task-title', t.task);
    const meta = el('div', 'task-meta');
    const avatar = el('span', `avatar c${L.assigneeColorIndex(t.assignee)}`, L.assigneeInitial(t.assignee));
    avatar.title = t.assignee;
    avatar.setAttribute('aria-hidden', 'true');
    meta.append(avatar, el('span', 'assignee-name', t.assignee));
    main.append(title, meta);

    const dueLabel = el('span', 'due-label', L.relativeDateLabel(t.date, todayStr, { completed: t.completed }));
    dueLabel.title = t.completed && t.completedAt ? `마감 ${t.date} · 완료 ${t.completedAt}` : `마감 ${t.date}`;

    const del = el('button', 'delete-btn', '삭제');
    del.type = 'button';
    del.setAttribute('aria-label', `삭제: ${t.task}`);
    del.addEventListener('click', () => deleteTask(t.id));

    li.append(check, main, dueLabel, del);
    return li;
  }

  function renderList() {
    const filtered = visibleTasks();
    const todayStr = today();

    if (filtered.length === 0) {
      listEl.replaceChildren();
      listEl.hidden = true;
      emptyMessage.textContent = tasks.length === 0 ? '업무를 입력하고 Enter를 누르세요' : '조건에 맞는 업무가 없습니다';
      emptyMessage.hidden = false;
      return;
    }

    emptyMessage.hidden = true;
    listEl.hidden = false;
    listEl.replaceChildren(...filtered.map((t) => buildRow(t, todayStr)));
  }

  function renderAll() {
    renderSummary();
    renderAssignees();
    renderList();
  }

  // ---- 동작 ----

  async function toggleCompleted(id, row) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.completed = !t.completed;
    if (t.completed) t.completedAt = today();
    else delete t.completedAt;

    // 먼저 현재 행에서 흐려짐/취소선 전환(0.15초)을 보여 준 뒤 정렬을 다시 한다.
    if (row) {
      row.classList.toggle('completed', t.completed);
      row.classList.remove('due-overdue', 'due-today');
    }
    renderSummary();
    await persist();
    setTimeout(renderList, TRANSITION_MS);
  }

  async function deleteTask(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    const ok = window.confirm(`이 업무를 삭제할까요?\n${t.task}`);
    if (!ok) return;
    tasks = tasks.filter((x) => x.id !== id);
    await persist();
    renderAll();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const task = taskInput.value.trim();
    const assignee = assigneeInput.value.trim();
    const date = dateInput.value || today();

    clearInvalid(taskInput, assigneeInput);
    if (!task) {
      markInvalid(taskInput);
      return;
    }
    if (!assignee) {
      markInvalid(assigneeInput);
      return;
    }

    const id = L.generateUniqueId(tasks.map((x) => x.id));
    tasks.push({ id, assignee, task, date, completed: false });
    await persist();

    taskInput.value = '';
    taskInput.focus();
    renderAll();
  });

  for (const input of [taskInput, assigneeInput]) {
    input.addEventListener('input', () => clearInvalid(input));
  }

  statusFilterEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    statusFilter = btn.dataset.status;
    for (const b of statusFilterEl.querySelectorAll('button')) {
      const active = b === btn;
      b.classList.toggle('active', active);
      b.setAttribute('aria-pressed', String(active));
    }
    renderList();
  });

  assigneeFilterEl.addEventListener('change', () => {
    assigneeFilter = assigneeFilterEl.value;
    renderList();
  });

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderList();
  });

  // ---- 단축키: Enter 추가(폼 기본 동작), Ctrl+F 검색, Esc 입력 취소 ----
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
      return;
    }
    if (e.key !== 'Escape' || backupDialog.open) return;
    const active = document.activeElement;
    if (active === searchInput) {
      if (searchInput.value) {
        searchInput.value = '';
        query = '';
        renderList();
      } else {
        searchInput.blur();
      }
      e.preventDefault();
    } else if (active === taskInput || active === assigneeInput || active === dateInput) {
      e.preventDefault();
      if (active === dateInput) dateInput.value = today();
      else active.value = '';
      clearInvalid(taskInput, assigneeInput);
    }
  });

  // ---- 테마 ----
  function renderThemeButton() {
    themeBtn.textContent = `테마: ${THEME_LABEL[theme]}`;
    themeBtn.setAttribute('aria-label', `테마 전환 (현재 ${THEME_LABEL[theme]})`);
  }

  themeBtn.addEventListener('click', async () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    try {
      theme = await window.api.setTheme(next);
    } catch (err) {
      console.error(err);
      theme = next;
    }
    renderThemeButton();
  });

  // ---- CSV 내보내기 (현재 화면에 보이는 목록 그대로) ----
  exportBtn.addEventListener('click', async () => {
    const list = visibleTasks();
    try {
      const res = await window.api.saveCsv(L.toCsv(list), L.csvFileName(today()));
      if (res && res.saved) showToast(`${list.length}건을 CSV로 저장했습니다.`);
    } catch (err) {
      console.error(err);
      window.alert('CSV 파일을 저장하지 못했습니다.');
    }
  });

  // ---- 백업 복원 ----
  function formatBackupLabel(item) {
    const d = new Date(item.createdAt.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z'));
    const when = Number.isNaN(d.getTime())
      ? item.name
      : `${L.todayLocalDateString(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const count = item.count == null ? '읽을 수 없음' : `${item.count}건`;
    return `${when} · ${count}${item.beforeRestore ? ' · 복원 직전 자동 저장' : ''}`;
  }

  async function openBackupDialog() {
    let items = [];
    try {
      items = await window.api.listBackups();
    } catch (err) {
      console.error(err);
    }
    const nodes = [];
    if (items.length === 0) {
      nodes.push(el('p', 'backup-empty', '아직 백업이 없습니다. 백업은 앱을 시작할 때 자동으로 만들어집니다.'));
    }
    for (const item of items) {
      const label = el('label', 'backup-item');
      const radio = el('input');
      radio.type = 'radio';
      radio.name = 'backup';
      radio.value = item.name;
      radio.disabled = item.count == null;
      label.append(radio, el('span', '', formatBackupLabel(item)));
      nodes.push(label);
    }
    backupListEl.replaceChildren(...nodes);
    backupRestoreBtn.disabled = true;
    backupDialog.showModal();
  }

  backupListEl.addEventListener('change', () => {
    backupRestoreBtn.disabled = !backupListEl.querySelector('input[name="backup"]:checked');
  });

  backupRestoreBtn.addEventListener('click', async () => {
    const checked = backupListEl.querySelector('input[name="backup"]:checked');
    if (!checked) return;
    const ok = window.confirm('선택한 백업으로 복원할까요?\n현재 데이터는 복원 직전에 자동으로 백업됩니다.');
    if (!ok) return;
    try {
      const res = await window.api.restoreBackup(checked.value);
      tasks = res.tasks;
      backupDialog.close();
      renderAll();
      showToast(`복원했습니다 (${tasks.length}건). 복원 전 데이터는 백업 목록에 남아 있습니다.`);
    } catch (err) {
      console.error(err);
      window.alert('복원하지 못했습니다. 백업 파일이 손상되었을 수 있습니다.');
    }
  });

  backupOpenFolderBtn.addEventListener('click', () => {
    window.api.openBackupFolder();
  });

  restoreBtn.addEventListener('click', openBackupDialog);

  async function init() {
    dateInput.value = today();
    try {
      const settings = await window.api.getSettings();
      if (THEME_ORDER.includes(settings.theme)) theme = settings.theme;
    } catch (err) {
      console.error(err);
    }
    renderThemeButton();
    tasks = await window.api.loadTasks();
    renderAll();
    taskInput.focus();
  }

  init();
})();
