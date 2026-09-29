'use strict';

(function () {
  const L = window.Logic;

  const form = document.getElementById('add-form');
  const assigneeInput = document.getElementById('assignee-input');
  const taskInput = document.getElementById('task-input');
  const dateInput = document.getElementById('date-input');
  const assigneeList = document.getElementById('assignee-list');
  const statusFilterEl = document.getElementById('status-filter');
  const assigneeFilterEl = document.getElementById('assignee-filter');
  const searchInput = document.getElementById('search-input');
  const tableBody = document.getElementById('task-body');
  const emptyMessage = document.getElementById('empty-message');
  const table = document.getElementById('task-table');
  const dueSummary = document.getElementById('due-summary');
  const exportBtn = document.getElementById('export-csv');
  const restoreBtn = document.getElementById('restore-backup');
  const backupDialog = document.getElementById('backup-dialog');
  const backupListEl = document.getElementById('backup-list');
  const backupRestoreBtn = document.getElementById('backup-restore-btn');
  const backupOpenFolderBtn = document.getElementById('backup-open-folder');
  const toast = document.getElementById('toast');

  let tasks = [];
  let statusFilter = 'all';
  let assigneeFilter = 'all';
  let query = '';
  let toastTimer = null;

  const today = () => L.todayLocalDateString();

  function clearInvalid(el) {
    el.classList.remove('invalid');
  }

  function markInvalid(el) {
    el.classList.add('invalid');
    el.focus();
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

  function renderSummary() {
    const { today: todayCount, overdue } = L.countDue(tasks, today());
    dueSummary.textContent = `오늘 ${todayCount}건 / 지연 ${overdue}건`;
  }

  function renderAssigneeDatalist() {
    const names = L.getAssigneeList(tasks);
    const opts = names.map((name) => {
      const opt = document.createElement('option');
      opt.value = name;
      return opt;
    });
    assigneeList.replaceChildren(...opts);
  }

  function renderAssigneeFilterButtons() {
    const names = L.getAssigneeList(tasks);

    if (assigneeFilter !== 'all' && !names.includes(assigneeFilter)) {
      assigneeFilter = 'all';
    }

    const buttons = [];
    const allBtn = document.createElement('button');
    allBtn.type = 'button';
    allBtn.dataset.assignee = 'all';
    allBtn.textContent = '전체';
    if (assigneeFilter === 'all') allBtn.classList.add('active');
    buttons.push(allBtn);

    for (const name of names) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.dataset.assignee = name;
      btn.textContent = name;
      if (assigneeFilter === name) btn.classList.add('active');
      buttons.push(btn);
    }
    assigneeFilterEl.replaceChildren(...buttons);
  }

  function renderTable() {
    const filtered = visibleTasks();
    const todayStr = today();

    tableBody.replaceChildren();

    if (tasks.length === 0 || filtered.length === 0) {
      emptyMessage.textContent = tasks.length === 0 ? '등록된 업무가 없습니다' : '조건에 맞는 업무가 없습니다';
      emptyMessage.hidden = false;
      table.hidden = true;
      return;
    }

    emptyMessage.hidden = true;
    table.hidden = false;

    for (const t of filtered) {
      const due = L.dueStatus(t, todayStr);
      const tr = document.createElement('tr');
      tr.className = 'task-row' + (t.completed ? ' completed' : '') + (due === 'overdue' || due === 'today' ? ` due-${due}` : '');
      tr.dataset.id = String(t.id);

      const checkTd = document.createElement('td');
      checkTd.className = 'col-check';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = t.completed;
      checkbox.addEventListener('change', () => toggleCompleted(t.id));
      checkTd.appendChild(checkbox);

      const assigneeTd = document.createElement('td');
      assigneeTd.className = 'col-assignee';
      assigneeTd.textContent = t.assignee;

      const taskTd = document.createElement('td');
      taskTd.className = 'col-task';
      taskTd.textContent = t.task;

      const dateTd = document.createElement('td');
      dateTd.className = 'col-date';
      dateTd.textContent = t.date;

      const deleteTd = document.createElement('td');
      deleteTd.className = 'col-delete';
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'delete-btn';
      deleteBtn.textContent = '삭제';
      deleteBtn.addEventListener('click', () => deleteTask(t.id));
      deleteTd.appendChild(deleteBtn);

      tr.append(checkTd, assigneeTd, taskTd, dateTd, deleteTd);
      tableBody.appendChild(tr);
    }
  }

  function renderAll() {
    renderSummary();
    renderAssigneeDatalist();
    renderAssigneeFilterButtons();
    renderTable();
  }

  async function toggleCompleted(id) {
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.completed = !t.completed;
    if (t.completed) t.completedAt = today();
    else delete t.completedAt;
    await persist();
    renderSummary();
    renderTable();
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

  async function addTask(assignee, task, date) {
    const id = L.generateUniqueId(tasks.map((t) => t.id));
    tasks.push({ id, assignee, task, date, completed: false });
    await persist();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const assignee = assigneeInput.value.trim();
    const task = taskInput.value.trim();
    const date = dateInput.value || today();

    clearInvalid(assigneeInput);
    clearInvalid(taskInput);

    if (!task) {
      markInvalid(taskInput);
      return;
    }
    if (!assignee) {
      markInvalid(assigneeInput);
      return;
    }

    await addTask(assignee, task, date);

    taskInput.value = '';
    taskInput.focus();
    renderAll();
  });

  statusFilterEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    statusFilter = btn.dataset.status;
    for (const b of statusFilterEl.querySelectorAll('button')) {
      b.classList.toggle('active', b === btn);
    }
    renderTable();
  });

  assigneeFilterEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-assignee]');
    if (!btn) return;
    assigneeFilter = btn.dataset.assignee;
    renderAssigneeFilterButtons();
    renderTable();
  });

  searchInput.addEventListener('input', () => {
    query = searchInput.value;
    renderTable();
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
      const p = document.createElement('p');
      p.className = 'backup-empty';
      p.textContent = '아직 백업이 없습니다. 백업은 앱을 시작할 때 자동으로 만들어집니다.';
      nodes.push(p);
    }
    for (const item of items) {
      const label = document.createElement('label');
      label.className = 'backup-item';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'backup';
      radio.value = item.name;
      radio.disabled = item.count == null;
      const span = document.createElement('span');
      span.textContent = formatBackupLabel(item);
      label.append(radio, span);
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
    tasks = await window.api.loadTasks();
    renderAll();
    taskInput.focus();
  }

  init();
})();
