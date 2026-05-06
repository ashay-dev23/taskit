// ── STATE ─────────────────────────────────────────────────
// We keep all tasks in memory so we don't have to refetch every time
let tasks = [];
let editingTaskId = null; // tracks which task we're editing (null = adding new)
let selectedColor = '#22c55e'; // default color

// ── DOM ELEMENTS ─────────────────────────────────────────
const modalOverlay  = document.getElementById('modalOverlay');
const modalTitle    = document.getElementById('modalTitle');
const modalError    = document.getElementById('modalError');
const addTaskBtn    = document.getElementById('addTaskBtn');
const saveTaskBtn   = document.getElementById('saveTaskBtn');
const cancelBtn     = document.getElementById('cancelBtn');
const modalClose    = document.getElementById('modalClose');
const todayTasks    = document.getElementById('todayTasks');
const upcomingTasks = document.getElementById('upcomingTasks');
const completedTasks= document.getElementById('completedTasks');
const todayEmpty    = document.getElementById('todayEmpty');
const upcomingEmpty = document.getElementById('upcomingEmpty');
const completedEmpty= document.getElementById('completedEmpty');
const todaySidebar  = document.getElementById('todaySidebar');

// ── DATE HELPERS ──────────────────────────────────────────
const TODAY = new Date().toISOString().split('T')[0]; // "2025-04-27"

function isToday(dateStr) {
  return dateStr === TODAY;
}

function isUpcoming(dateStr) {
  return dateStr && dateStr > TODAY;
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── SET SIDEBAR DATE ──────────────────────────────────────
function setSidebarDate() {
  const now = new Date();
  document.getElementById('sideDay').textContent = now.getDate();
  document.getElementById('sideFull').textContent = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', year: 'numeric'
  });
}

// ── RENDER ALL TASKS ──────────────────────────────────────
// This function takes our tasks array and builds the UI
// It groups tasks into Today, Upcoming, and Completed sections
function renderTasks() {
  // Clear all sections first
  todayTasks.innerHTML = '';
  upcomingTasks.innerHTML = '';
  completedTasks.innerHTML = '';
  todaySidebar.innerHTML = '';

  // Split tasks into groups
  const todayList     = tasks.filter(t => !t.completed && isToday(t.due_date));
  const upcomingList  = tasks.filter(t => !t.completed && isUpcoming(t.due_date));
  const noDateList    = tasks.filter(t => !t.completed && !t.due_date);
  const completedList = tasks.filter(t => t.completed);

  // Combine today + no-date tasks into the Today section
  const todayCombined = [...todayList, ...noDateList];

  // Show/hide empty messages
  todayEmpty.style.display     = todayCombined.length   ? 'none' : 'block';
  upcomingEmpty.style.display  = upcomingList.length    ? 'none' : 'block';
  completedEmpty.style.display = completedList.length   ? 'none' : 'block';

  // Render each group
  todayCombined.forEach(t  => todayTasks.appendChild(createTaskCard(t)));
  upcomingList.forEach(t   => upcomingTasks.appendChild(createTaskCard(t)));
  completedList.forEach(t  => completedTasks.appendChild(createTaskCard(t)));

  // Sidebar — show today's tasks only
  todayList.forEach(t => {
    const el = document.createElement('div');
    el.className = 'sidebar-task';
    el.style.borderLeftColor = t.color || '#22c55e';
    el.textContent = t.title;
    todaySidebar.appendChild(el);
  });
}

// ── CREATE TASK CARD ELEMENT ──────────────────────────────
// Builds a single task card DOM element
function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card' + (task.completed ? ' completed' : '');

  card.innerHTML = `
    <div class="task-color-bar" style="background: ${task.color || '#22c55e'}"></div>
    <div class="task-check ${task.completed ? 'checked' : ''}" data-id="${task.id}">
      ${task.completed ? '✓' : ''}
    </div>
    <div class="task-body">
      <p class="task-title ${task.completed ? 'done' : ''}">${task.title}</p>
      <div class="task-meta">
        ${task.due_date ? `<span class="task-date">📅 ${formatDisplayDate(task.due_date)}</span>` : ''}
        <span class="task-priority priority-${task.priority}">${task.priority}</span>
      </div>
    </div>
    <div class="task-actions">
      <button class="task-btn edit" data-id="${task.id}" title="Edit">✏️</button>
      <button class="task-btn delete" data-id="${task.id}" title="Delete">🗑️</button>
    </div>
  `;

  // Checkbox — toggle completion
  card.querySelector('.task-check').addEventListener('click', () => toggleComplete(task));

  // Edit button
  card.querySelector('.task-btn.edit').addEventListener('click', () => openEditModal(task));

  // Delete button
  card.querySelector('.task-btn.delete').addEventListener('click', () => deleteTask(task.id));

  return card;
}

// ── FETCH ALL TASKS FROM BACKEND ──────────────────────────
async function fetchTasks() {
  const res = await fetch('/api/tasks');
  if (res.ok) {
    tasks = await res.json();
    renderTasks();
  }
}

// ── TOGGLE TASK COMPLETE ──────────────────────────────────
async function toggleComplete(task) {
  const res = await fetch(`/api/tasks/${task.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ completed: task.completed ? 0 : 1 })
  });
  if (res.ok) {
    const updated = await res.json();
    // Update the task in our local array without refetching everything
    tasks = tasks.map(t => t.id === updated.id ? updated : t);
    renderTasks();
  }
}

// ── DELETE TASK ───────────────────────────────────────────
async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  if (res.ok) {
    // Remove from local array and re-render
    tasks = tasks.filter(t => t.id !== id);
    renderTasks();
  }
}

// ── OPEN ADD MODAL ────────────────────────────────────────
function openAddModal() {
  editingTaskId = null;
  modalTitle.textContent = 'Add Task';
  document.getElementById('taskTitle').value    = '';
  document.getElementById('taskDate').value     = TODAY; // default to today
  document.getElementById('taskPriority').value = 'medium';
  setColor('#22c55e');
  modalError.textContent = '';
  modalOverlay.classList.remove('hidden');
  document.getElementById('taskTitle').focus();
}

// ── OPEN EDIT MODAL ───────────────────────────────────────
function openEditModal(task) {
  editingTaskId = task.id;
  modalTitle.textContent = 'Edit Task';
  document.getElementById('taskTitle').value    = task.title;
  document.getElementById('taskDate').value     = task.due_date || '';
  document.getElementById('taskPriority').value = task.priority;
  setColor(task.color || '#22c55e');
  modalError.textContent = '';
  modalOverlay.classList.remove('hidden');
  document.getElementById('taskTitle').focus();
}

// ── CLOSE MODAL ───────────────────────────────────────────
function closeModal() {
  modalOverlay.classList.add('hidden');
  editingTaskId = null;
}

// ── COLOR PICKER ──────────────────────────────────────────
function setColor(color) {
  selectedColor = color;
  document.querySelectorAll('.color-opt').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.color === color);
  });
}

document.getElementById('colorPicker').addEventListener('click', e => {
  const opt = e.target.closest('.color-opt');
  if (opt) setColor(opt.dataset.color);
});

// ── SAVE TASK ─────────────────────────────────────────────
saveTaskBtn.addEventListener('click', async () => {
  const title    = document.getElementById('taskTitle').value.trim();
  const due_date = document.getElementById('taskDate').value;
  const priority = document.getElementById('taskPriority').value;
  const color    = selectedColor;

  if (!title) { modalError.textContent = 'Please enter a task title.'; return; }

  const body = { title, due_date, priority, color };

  let res;
  if (editingTaskId) {
    // Updating existing task
    res = await fetch(`/api/tasks/${editingTaskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } else {
    // Creating new task
    res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  if (res.ok) {
    const task = await res.json();
    if (editingTaskId) {
      tasks = tasks.map(t => t.id === task.id ? task : t);
    } else {
      tasks.push(task);
    }
    renderTasks();
    closeModal();
  } else {
    const data = await res.json();
    modalError.textContent = data.error;
  }
});

// ── EVENT LISTENERS ───────────────────────────────────────
addTaskBtn.addEventListener('click', openAddModal);
cancelBtn.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeModal();
});

// ── INITIALIZE ────────────────────────────────────────────
setSidebarDate();
fetchTasks();
