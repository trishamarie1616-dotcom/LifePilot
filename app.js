function parseStoredJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const AppState = {
  plans: parseStoredJSON('lifepilot-plans', []),
  tasks: parseStoredJSON('lifepilot-planner-tasks', []),
  currentPlan: parseStoredJSON('lifepilot-current-plan', null)
};

let lastAIQuestion = '';
let lastAIResponse = null;
let selectedAttachments = [];
let isReadingAttachments = false;
let isSubmittingQuestion = false;

const PRIORITY_RANK = {
  high: 0,
  medium: 1,
  low: 2
};

const $ = (id) => document.getElementById(id);
const input = $('userInput');

function renderPlan(plan) {
  if (!plan) return;

  const goalEl = $('planGoal');
  if (goalEl) {
    goalEl.textContent = plan.goal;
    $('planContext').textContent = plan.context;
  }

  const tasksEl = $('planTasks');
  if (tasksEl) {
    tasksEl.innerHTML = (plan.tasks || [])
      .map((task, index) => {
        const added = AppState.tasks.some(saved => normalizeTask(saved.title) === normalizeTask(task));
        return `<li><label><input type="checkbox" data-plan-task="${index}" ${added ? 'disabled' : 'checked'}><span>${escapeHTML(task)}${added ? ' <small>(already in planner)</small>' : ''}</span></label></li>`;
      })
      .join('');
  }

  const nextStepsEl = $('planNextSteps');
  if (nextStepsEl) {
    nextStepsEl.innerHTML = (plan.nextSteps || [])
      .map((step) => `<li>${escapeHTML(step)}</li>`)
      .join('');
  }

  const followUpsEl = $('planFollowups');
  if (followUpsEl) {
    followUpsEl.innerHTML = (plan.followups || [])
      .map((item) => `<li>${escapeHTML(item)}</li>`)
      .join('');
  }

  renderAIList($('planInformation'), plan.informationNeeded || []);
  $('informationSection').hidden = !(plan.informationNeeded || []).length;
  $('planUpdate').value = '';
  $('planNotice').textContent = '';
  renderDashboard();
  const container = $('currentPlanContainer');
  if (container) {
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderSavedPlans() {
  const countEl = $('planCount');
  const plansList = $('plansList');
  const savedPlansSection = $('savedPlansSection');

  if (!countEl || !plansList || !savedPlansSection) return;

  countEl.textContent = String(AppState.plans.length);

  if (!AppState.plans.length) {
    savedPlansSection.style.display = 'none';
    plansList.innerHTML = '';
    return;
  }

  savedPlansSection.style.display = 'block';

  plansList.innerHTML = AppState.plans
    .map((plan, index) => `
      <article class="saved-plan">
        <div>
          <h3>${escapeHTML(plan.title || 'Untitled plan')}</h3>
          <p>${escapeHTML(plan.goal || '')}</p>
        </div>
        <button class="view-plan-btn" data-plan-index="${index}">View</button>
      </article>
    `)
    .join('');
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

async function generatePlanFromRequest(revising = false) {
  const isRevision = revising === true;
  const request = isRevision ? $('planUpdate').value.trim() : input.value.trim();
  if (isRevision && !AppState.currentPlan) return;
  if (!request) {
    (isRevision ? $('planUpdate') : input).focus();
    return;
  }

  const button = $('submitBtn');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  $('revisePlanBtn').disabled = true;
  $('planError').hidden = true;
  const overlay = $('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'grid';
  }

  try {
    const response = await fetch('/api/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(35000), body: JSON.stringify({ request,
        ...(isRevision ? { revision: {
          originalRequest: AppState.currentPlan.originalRequest || AppState.currentPlan.title || '',
          plan: Object.fromEntries(['goal','context','tasks','nextSteps','followups','informationNeeded'].map(key => [key, AppState.currentPlan[key] || (['goal','context'].includes(key) ? '' : [])])),
          completedTasks: AppState.tasks.filter(task => task.completed && String(task.planId) === String(AppState.currentPlan.id)).map(task => task.title).slice(-100)
        } } : {})
      })
    });
    const plan = await response.json().catch(() => null);
    if (!response.ok) throw new Error(plan?.error || 'Open LifePilot from its running AI server to generate a plan.');
    if (!plan || typeof plan.goal !== 'string' || typeof plan.context !== 'string' ||
      !['tasks', 'nextSteps', 'followups', 'informationNeeded'].every(key =>
        Array.isArray(plan[key]) && plan[key].every(item => typeof item === 'string'))) {
      throw new Error('LifePilot received an invalid plan. Please try again.');
    }
    const previous = isRevision ? AppState.currentPlan : null;
    AppState.currentPlan = {
      ...previous, ...plan,
      id: previous?.id || crypto.randomUUID(),
      originalRequest: previous?.originalRequest || previous?.title || request,
      title: previous?.title || request,
      createdAt: previous?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('lifepilot-current-plan', JSON.stringify(AppState.currentPlan));
    if (previous && AppState.plans.some(saved => saved.id === previous.id)) {
      saveCurrentPlan();
    }

    renderPlan(AppState.currentPlan);

    const saveBtn = $('savePlanBtn');
    if (saveBtn) {
      saveBtn.textContent = 'Save plan';
    }
  } catch (error) {
    console.error('Error generating plan:', error);
    $('planError').textContent = error instanceof Error ? error.message : 'Could not generate a plan. Please try again.';
    $('planError').hidden = false;
    $('planError').scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    if (button) button.disabled = false;
    $('revisePlanBtn').disabled = false;
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

}

function saveCurrentPlan() {
  if (!AppState.currentPlan) return;

  try {
    if (!AppState.currentPlan.id) {
      AppState.currentPlan.id = crypto.randomUUID();
    }

    AppState.plans = AppState.plans.filter(plan => plan.id !== AppState.currentPlan.id);
    AppState.plans.unshift({ ...AppState.currentPlan });
    localStorage.setItem('lifepilot-current-plan', JSON.stringify(AppState.currentPlan));
    localStorage.setItem('lifepilot-plans', JSON.stringify(AppState.plans));
    renderSavedPlans();

    const saveBtn = $('savePlanBtn');
    if (saveBtn) {
      saveBtn.textContent = 'Plan saved';
    }
  } catch (error) {
    console.error('Error saving plan:', error);
    alert('There was an error saving your plan. Please try again.');
  }
}

let taskSnapshot = structuredClone(AppState.tasks);
let pendingTaskChanges = [];
let syncingTasks = false;

function toServerTask(task) {
  return { id: String(task.id), task: task.title, priority: task.priority || 'medium', dueDate: task.dueDate || null,
    completed: Boolean(task.completed), createdAt: new Date(task.createdAt || Date.now()).toISOString(), ...(task.planId ? { planId: String(task.planId) } : {}) };
}
function fromServerTask(task) {
  return { id: task.id, title: task.task, priority: task.priority, dueDate: task.dueDate || '',
    completed: task.completed, createdAt: Date.parse(task.createdAt), ...(task.planId ? { planId: task.planId } : {}) };
}
function saveTasks() {
  localStorage.setItem('lifepilot-planner-tasks', JSON.stringify(AppState.tasks));
  const before = new Map(taskSnapshot.map(task => [String(task.id), task]));
  const after = new Map(AppState.tasks.map(task => [String(task.id), task]));
  const added = [], updated = [], deleted = [];
  for (const [id, task] of after) {
    const old = before.get(id);
    if (!old) added.push(toServerTask(task));
    else {
      const changes = {};
      for (const [key, serverKey] of [['title','task'],['priority','priority'],['dueDate','dueDate'],['completed','completed']]) {
        if (task[key] !== old[key]) changes[serverKey] = key === 'dueDate' ? task[key] || null : task[key];
      }
      if (Object.keys(changes).length) updated.push({ id, changes });
    }
  }
  for (const id of before.keys()) if (!after.has(id)) deleted.push(id);
  taskSnapshot = structuredClone(AppState.tasks);
  if (added.length || updated.length || deleted.length) pendingTaskChanges.push({ added, updated, deleted });
  localStorage.setItem('lifepilot-pending-task-changes', JSON.stringify(pendingTaskChanges));
  syncTasks();
}

async function syncTasks() {
  if (syncingTasks || !pendingTaskChanges.length) return;
  syncingTasks = true;
  try {
    while (pendingTaskChanges.length) {
      const count = pendingTaskChanges.length;
      const batch = pendingTaskChanges.slice(0, count);
      const changes = { added: batch.flatMap(change => change.added), updated: batch.flatMap(change => change.updated), deleted: batch.flatMap(change => change.deleted) };
      const response = await fetch('/api/tasks/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000), body: JSON.stringify(changes) });
      if (!response.ok) throw new Error('Task sync unavailable');
      const result = await response.json();
      if (!Array.isArray(result.tasks)) throw new Error('Invalid task response');
      pendingTaskChanges.splice(0, count);
      localStorage.setItem('lifepilot-pending-task-changes', JSON.stringify(pendingTaskChanges));
      if (!pendingTaskChanges.length) acceptServerTasks(result.tasks);
    }
    $('taskSyncStatus').textContent = 'Tasks synced with your LifePilot server and MCP.';
  } catch {
    $('taskSyncStatus').textContent = 'Saved in this browser. Server sync unavailable; changes will retry when you return.';
  } finally { syncingTasks = false; }
}
function acceptServerTasks(tasks) {
  AppState.tasks = tasks.map(fromServerTask);
  taskSnapshot = structuredClone(AppState.tasks);
  localStorage.setItem('lifepilot-planner-tasks', JSON.stringify(AppState.tasks));
  renderPlannerTasks();
}
async function refreshServerTasks() {
  if (pendingTaskChanges.length || syncingTasks) { await syncTasks(); return; }
  try {
    const response = await fetch('/api/tasks', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Unavailable');
    const result = await response.json();
    if (!Array.isArray(result.tasks)) throw new Error('Invalid response');
    if (!pendingTaskChanges.length && !syncingTasks) acceptServerTasks(result.tasks);
    $('taskSyncStatus').textContent = 'Tasks synced with your LifePilot server and MCP.';
  } catch { $('taskSyncStatus').textContent = 'Tasks saved in this browser. Connect to your server to sync.'; }
}
function initializeTaskSync() {
  pendingTaskChanges = parseStoredJSON('lifepilot-pending-task-changes', []);
  if (!localStorage.getItem('lifepilot-task-migration') && AppState.tasks.length) {
    pendingTaskChanges.unshift({ added: AppState.tasks.map(toServerTask), updated: [], deleted: [] });
    localStorage.setItem('lifepilot-pending-task-changes', JSON.stringify(pendingTaskChanges));
  }
  localStorage.setItem('lifepilot-task-migration', '1');
  refreshServerTasks();
  window.addEventListener('focus', refreshServerTasks);
}

function getTaskTimestamp(value) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function formatDueDate(value) {
  const timestamp = getTaskTimestamp(value);
  return timestamp ? new Date(timestamp).toLocaleDateString() : 'No due date';
}

function sortTasks(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;

    const priorityDiff = (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);
    if (priorityDiff !== 0) return priorityDiff;

    const aDue = getTaskTimestamp(a.dueDate);
    const bDue = getTaskTimestamp(b.dueDate);

    if (aDue === null && bDue !== null) return 1;
    if (aDue !== null && bDue === null) return -1;
    if (aDue !== null && bDue !== null && aDue !== bDue) return aDue - bDue;

    return (a.createdAt || 0) - (b.createdAt || 0);
  });
}

function renderPlannerTasks() {
  const tasksList = $('tasksList');
  const taskCount = $('taskCount');
  if (!tasksList || !taskCount) return;

  renderDashboard();
  const sortedTasks = sortTasks(AppState.tasks);
  taskCount.textContent = String(sortedTasks.length);

  if (!sortedTasks.length) {
    tasksList.innerHTML = `
      <div class="empty-state">
        <p>Choose tasks from your plan, or add a small next step below.</p>
      </div>
    `;
    return;
  }

  tasksList.innerHTML = sortedTasks
    .map((task) => `
      <article class="task-item ${task.completed ? 'completed' : ''}" data-task-id="${escapeHTML(task.id)}">
        <input
          type="checkbox"
          class="task-checkbox"
          data-task-action="toggle"
          data-task-id="${escapeHTML(task.id)}"
          aria-label="Mark task complete"
          ${task.completed ? 'checked' : ''}
        />
        <div class="task-content">
          <p class="task-title">${escapeHTML(task.title)}</p>
          <div class="task-meta">
            <span class="task-priority ${escapeHTML(task.priority)}">${escapeHTML(task.priority)}</span>
            <span>Due: ${escapeHTML(formatDueDate(task.dueDate))}</span>
          </div>
        </div>
        <button
          class="task-delete"
          type="button"
          data-task-action="delete"
          data-task-id="${escapeHTML(task.id)}"
          aria-label="Delete task"
          title="Delete task"
        >✕</button>
      </article>
    `)
    .join('');
}

function addPlannerTask() {
  const taskInput = $('taskInput');
  const prioritySelect = $('prioritySelect');
  const dueDateInput = $('dueDateInput');
  if (!taskInput || !prioritySelect || !dueDateInput) return;

  const title = taskInput.value.trim();
  if (!title) {
    taskInput.focus();
    return;
  }

  AppState.tasks.push({
    id: crypto.randomUUID(),
    title,
    priority: prioritySelect.value || 'medium',
    dueDate: dueDateInput.value || '',
    completed: false,
    createdAt: Date.now()
  });

  saveTasks();
  renderPlannerTasks();

  taskInput.value = '';
  dueDateInput.value = '';
  prioritySelect.value = 'medium';
  taskInput.focus();
}

function updateTask(taskId, updater) {
  const index = AppState.tasks.findIndex((task) => task.id === taskId);
  if (index === -1) return;
  AppState.tasks[index] = updater(AppState.tasks[index]);
  saveTasks();
  renderPlannerTasks();
}

function deleteTask(taskId) {
  const nextTasks = AppState.tasks.filter((task) => task.id !== taskId);
  if (nextTasks.length === AppState.tasks.length) return;
  AppState.tasks = nextTasks;
  saveTasks();
  renderPlannerTasks();
}

function switchTab(tabName) {
  document.querySelectorAll('.tab-content').forEach((section) => {
    section.classList.toggle('tab-content-active', section.id === `${tabName}-tab`);
  });

  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.classList.toggle('nav-btn-active', button.dataset.tab === tabName);
  });
}

function renderAIList(element, items) {
  element.replaceChildren(...items.map((item) => {
    const listItem = document.createElement('li');
    listItem.textContent = item;
    return listItem;
  }));
}

function renderAIResponse(response) {
  $('aiAnswer').textContent = response.answer;
  $('aiExplanation').textContent = response.explanation;
  renderAIList($('aiUncertainties'), response.uncertainties);
  renderAIList($('aiActions'), response.recommendedActions);
  renderAIList($('aiFollowups'), response.followUpQuestions);

  $('explanationSection').style.display = response.explanation ? '' : 'none';
  $('uncertaintiesSection').style.display = response.uncertainties.length ? '' : 'none';
  $('actionsSection').style.display = response.recommendedActions.length ? '' : 'none';
  $('followupsSection').style.display = response.followUpQuestions.length ? '' : 'none';
  $('aiResponseContainer').style.display = 'block';
  $('addActionsBtn').textContent = '+ Add Actions to My Planner';
}

function showAIError(message) {
  $('errorMessage').textContent = message;
  $('aiErrorContainer').style.display = 'block';
}

function renderAttachments() {
  const list = $('attachmentList');
  list.replaceChildren(...selectedAttachments.map((file, index) => {
    const item = document.createElement('li');
    if (file.mimeType.startsWith('image/')) {
      const image = document.createElement('img');
      image.src = file.dataUrl; image.alt = `Preview of ${file.name}`; item.append(image);
    }
    const name = document.createElement('span'); name.textContent = file.name; item.append(name);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'attachment-remove';
    remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.disabled = isReadingAttachments || isSubmittingQuestion;
    remove.addEventListener('click', () => { selectedAttachments.splice(index, 1); renderAttachments(); });
    item.append(remove); return item;
  }));
  $('fileUpload').disabled = isReadingAttachments || isSubmittingQuestion;
  $('askLifePilotBtn').disabled = isReadingAttachments || isSubmittingQuestion;
}

async function readAttachments(event) {
  const files = [...event.target.files];
  const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
  isReadingAttachments = true; renderAttachments();
  $('attachmentStatus').textContent = 'Preparing attachments…';
  try {
    if (selectedAttachments.length + files.length > 3) throw new Error('Choose up to three files. Remove one before adding another.');
    let total = selectedAttachments.reduce((sum, file) => sum + file.size, 0);
    const additions = [];
    for (const file of files) {
      const mimeType = file.type || types[file.name.split('.').pop().toLowerCase()];
      if (!Object.values(types).includes(mimeType)) throw new Error('Choose JPG, PNG, WebP photos or PDFs. Export other documents as PDF first.');
      if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Each file must be nonempty and 5 MB or smaller.');
      if (file.name.length > 160) throw new Error('Shorten the filename to 160 characters or fewer.');
      total += file.size;
      if (total > 10 * 1024 * 1024) throw new Error('Keep the combined files under 10 MB.');
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Could not read that file. Please select it again.'));
        reader.readAsDataURL(file);
      });
      additions.push({ name: file.name, mimeType, dataUrl: `data:${mimeType};base64,${dataUrl.split(',')[1]}`, size: file.size });
    }
    selectedAttachments.push(...additions);
    $('attachmentStatus').textContent = 'Ready. Add a question, or ask LifePilot to explain the files.';
  } catch (error) {
    $('attachmentStatus').textContent = error instanceof Error ? error.message : 'Could not attach the files.';
  } finally {
    event.target.value = ''; isReadingAttachments = false; renderAttachments();
  }
}

async function submitAIQuestion(question = $('aiQuestion').value.trim()) {
  if (isReadingAttachments || isSubmittingQuestion) return;
  const cleanQuestion = question.trim() || (selectedAttachments.length ? 'Help me understand these attachments and recommend practical next steps.' : '');
  if (!cleanQuestion) {
    $('aiQuestion').focus();
    return;
  }

  lastAIQuestion = cleanQuestion;
  lastAIResponse = null;
  $('aiErrorContainer').style.display = 'none';
  $('aiResponseContainer').style.display = 'none';
  $('aiLoadingOverlay').style.display = 'grid';
  isSubmittingQuestion = true;
  renderAttachments();

  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(35000),
      body: JSON.stringify({ question: cleanQuestion, attachments: selectedAttachments.map(({name, mimeType, dataUrl}) => ({name, mimeType, dataUrl})) })
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result && typeof result.error === 'string'
        ? result.error
        : 'LifePilot could not answer your question. Please try again.');
    }
    if (
      !result ||
      typeof result.answer !== 'string' ||
      typeof result.explanation !== 'string' ||
      !Array.isArray(result.uncertainties) ||
      !Array.isArray(result.recommendedActions) ||
      !Array.isArray(result.followUpQuestions) ||
      !result.uncertainties.every((item) => typeof item === 'string') ||
      !result.recommendedActions.every((item) => typeof item === 'string') ||
      !result.followUpQuestions.every((item) => typeof item === 'string')
    ) {
      throw new Error('LifePilot received an unexpected response. Please try again.');
    }

    lastAIResponse = result;
    renderAIResponse(result);
  } catch (error) {
    showAIError(error instanceof Error ? error.message : 'LifePilot could not answer your question. Please try again.');
  } finally {
    $('aiLoadingOverlay').style.display = 'none';
    isSubmittingQuestion = false;
    renderAttachments();
  }
}

function addAIRecommendationsToPlanner() {
  if (!lastAIResponse || !lastAIResponse.recommendedActions.length) return;

  const added = addTitlesToPlanner(lastAIResponse.recommendedActions);
  $('addActionsBtn').textContent = added ? `${added} added to your planner` : 'Already in your planner';

}

function attachPlannerEventHandlers() {
  const addTaskBtn = $('addTaskBtn');
  const taskInput = $('taskInput');
  const tasksList = $('tasksList');

  if (addTaskBtn) {
    addTaskBtn.addEventListener('click', addPlannerTask);
  }

  if (taskInput) {
    taskInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addPlannerTask();
      }
    });
  }

  if (tasksList) {
    tasksList.addEventListener('click', (event) => {
      const target = event.target.closest('[data-task-action]');
      if (!target) return;

      const { taskAction, taskId } = target.dataset;
      if (!taskId) return;

      if (taskAction === 'delete') {
        deleteTask(taskId);
      }
    });

    tasksList.addEventListener('change', (event) => {
      const target = event.target.closest('[data-task-action="toggle"]');
      if (!target) return;

      const { taskId } = target.dataset;
      if (!taskId) return;

      updateTask(taskId, (task) => ({
        ...task,
        completed: Boolean(target.checked)
      }));
    });
  }
}

function attachTabNavigationHandlers() {
  document.querySelectorAll('.nav-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const tabName = button.dataset.tab;
      if (!tabName) return;
      switchTab(tabName);
    });
  });
}

function attachEventHandlers() {
  attachPlannerEventHandlers();
  attachTabNavigationHandlers();
  $('fileUpload').addEventListener('change', readAttachments);
  $('addPlanTasksBtn').addEventListener('click', addSelectedPlanTasks);
  $('revisePlanBtn').addEventListener('click', () => generatePlanFromRequest(true));

  const askButton = $('askLifePilotBtn');
  if (askButton) {
    askButton.addEventListener('click', () => submitAIQuestion());
  }

  const questionInput = $('aiQuestion');
  if (questionInput) {
    questionInput.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        submitAIQuestion();
      }
    });
  }

  const retryButton = $('retryBtn');
  if (retryButton) {
    retryButton.addEventListener('click', () => submitAIQuestion(lastAIQuestion));
  }

  const closeErrorButton = $('closeErrorBtn');
  if (closeErrorButton) {
    closeErrorButton.addEventListener('click', () => {
      $('aiErrorContainer').style.display = 'none';
    });
  }

  const closeResponseButton = $('closeResponseBtn');
  if (closeResponseButton) {
    closeResponseButton.addEventListener('click', () => {
      $('aiResponseContainer').style.display = 'none';
    });
  }

  const addActionsButton = $('addActionsBtn');
  if (addActionsButton) {
    addActionsButton.addEventListener('click', addAIRecommendationsToPlanner);
  }

  const submitBtn = $('submitBtn');
  if (submitBtn) {
    submitBtn.addEventListener('click', generatePlanFromRequest);
  }

  if (input) {
    input.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        generatePlanFromRequest();
      }
    });
  }

  document.querySelectorAll('.example-btn').forEach((button) => {
    button.addEventListener('click', () => {
      if (input) {
        input.value = button.dataset.example || '';
        input.focus();
      }
    });
  });

  const closeBtn = $('closePlanBtn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      const container = $('currentPlanContainer');
      if (container) {
        container.style.display = 'none';
      }
    });
  }

  const saveBtn = $('savePlanBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveCurrentPlan);
  }

  const plansList = $('plansList');
  if (plansList) {
    plansList.addEventListener('click', (event) => {
      const button = event.target.closest('.view-plan-btn');
      if (!button) return;

      const index = Number(button.dataset.planIndex);
      if (AppState.plans[index]) {
        AppState.currentPlan = AppState.plans[index];
        localStorage.setItem('lifepilot-current-plan', JSON.stringify(AppState.currentPlan));
        renderPlan(AppState.currentPlan);

        const saveBtnAfterView = $('savePlanBtn');
        if (saveBtnAfterView) {
          saveBtnAfterView.textContent = 'Plan saved';
        }
      }
    });
  }
}

function normalizeTask(title) {
  return String(title).trim().toLocaleLowerCase();
}

function addTitlesToPlanner(titles, planId) {
  const existing = new Set(AppState.tasks.map(task => normalizeTask(task.title)));
  const additions = [];
  for (const title of titles) {
    const key = normalizeTask(title);
    if (!key || existing.has(key)) continue;
    existing.add(key);
    additions.push({ id: crypto.randomUUID(), title: title.trim(), priority: 'medium', dueDate: '', completed: false, createdAt: Date.now(), ...(planId ? { planId } : {}) });
  }
  AppState.tasks.push(...additions);
  saveTasks();
  renderPlannerTasks();
  return additions.length;
}

function addSelectedPlanTasks() {
  if (!AppState.currentPlan) return;
  const selected = [...document.querySelectorAll('[data-plan-task]:checked')]
    .map(box => AppState.currentPlan.tasks[Number(box.dataset.planTask)]).filter(Boolean);
  const added = addTitlesToPlanner(selected, AppState.currentPlan.id);
  renderPlan(AppState.currentPlan);
  $('planNotice').textContent = added ? `${added} task${added === 1 ? '' : 's'} added. Your next step is ready.` : 'Select a new task to add. Existing tasks are kept.';
}

function renderDashboard() {
  const tasks = AppState.tasks;
  const done = tasks.filter(task => task.completed).length;
  const next = sortTasks(tasks).find(task => !task.completed);
  $('progressCount').textContent = `${done} of ${tasks.length} completed`;
  $('taskProgress').max = Math.max(1, tasks.length);
  $('taskProgress').value = done;
  $('nextAction').textContent = next?.title || (tasks.length ? 'You’ve completed your tasks. Take a moment to enjoy it.' : AppState.currentPlan?.nextSteps?.[0] || 'Start with what’s on your mind.');
  $('progressLabel').textContent = next ? 'One manageable action. Check it off when you’re done.' : tasks.length ? 'Ready for more? Choose another task or update your plan.' : AppState.currentPlan ? 'Choose tasks from your plan to start tracking progress.' : 'Your plan and progress will appear here.';
}

// Initialize the web app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    attachEventHandlers();
    renderPlannerTasks();
    renderSavedPlans();
    initializeTaskSync();
    if (AppState.currentPlan) renderPlan(AppState.currentPlan);
  });
} else {
  attachEventHandlers();
  renderPlannerTasks();
  renderSavedPlans();
  initializeTaskSync();
  if (AppState.currentPlan) renderPlan(AppState.currentPlan);
}
