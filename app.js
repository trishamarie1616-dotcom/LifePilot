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
  currentPlan: null
};

let lastAIQuestion = '';
let lastAIResponse = null;

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
    const details = [plan.goal, plan.context].filter(Boolean).join(' ');
    goalEl.textContent = details;
  }

  const tasksEl = $('planTasks');
  if (tasksEl) {
    tasksEl.innerHTML = (plan.tasks || [])
      .map((task) => `<li>${escapeHTML(task)}</li>`)
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

async function generatePlanFromRequest() {
  const request = input.value.trim();
  if (!request) {
    input.focus();
    return;
  }

  const button = $('submitBtn');
  if (button?.disabled) return;
  if (button) button.disabled = true;
  const overlay = $('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'grid';
  }

  try {
    const response = await fetch('/api/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(35000), body: JSON.stringify({ request })
    });
    const plan = await response.json().catch(() => null);
    if (!response.ok) throw new Error(plan?.error || 'Open LifePilot from its running AI server to generate a plan.');
    if (!plan || typeof plan.goal !== 'string' || typeof plan.context !== 'string' ||
      !['tasks', 'nextSteps', 'followups', 'informationNeeded'].every(key =>
        Array.isArray(plan[key]) && plan[key].every(item => typeof item === 'string'))) {
      throw new Error('LifePilot received an invalid plan. Please try again.');
    }
    AppState.currentPlan = {
      ...plan,
      title: request,
      createdAt: new Date().toISOString()
    };

    renderPlan(AppState.currentPlan);

    const saveBtn = $('savePlanBtn');
    if (saveBtn) {
      saveBtn.textContent = '💾 Save This Plan';
    }
  } catch (error) {
    console.error('Error generating plan:', error);
    alert(error instanceof Error ? error.message : 'Could not generate a plan. Please try again.');
  } finally {
    if (button) button.disabled = false;
    if (overlay) {
      overlay.style.display = 'none';
    }
  }

}

function saveCurrentPlan() {
  if (!AppState.currentPlan) return;

  try {
    if (!AppState.currentPlan.id) {
      AppState.currentPlan.id = Date.now();
    }

    AppState.plans.unshift({ ...AppState.currentPlan });
    localStorage.setItem('lifepilot-plans', JSON.stringify(AppState.plans));
    renderSavedPlans();

    const saveBtn = $('savePlanBtn');
    if (saveBtn) {
      saveBtn.textContent = '✓ Plan Saved';
    }
  } catch (error) {
    console.error('Error saving plan:', error);
    alert('There was an error saving your plan. Please try again.');
  }
}

function saveTasks() {
  localStorage.setItem('lifepilot-planner-tasks', JSON.stringify(AppState.tasks));
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

    return (b.createdAt || 0) - (a.createdAt || 0);
  });
}

function renderPlannerTasks() {
  const tasksList = $('tasksList');
  const taskCount = $('taskCount');
  if (!tasksList || !taskCount) return;

  const sortedTasks = sortTasks(AppState.tasks);
  taskCount.textContent = String(sortedTasks.length);

  if (!sortedTasks.length) {
    tasksList.innerHTML = `
      <div class="empty-state">
        <p>No tasks yet. Add one to get started!</p>
      </div>
    `;
    return;
  }

  tasksList.innerHTML = sortedTasks
    .map((task) => `
      <article class="task-item ${task.completed ? 'completed' : ''}" data-task-id="${task.id}">
        <input
          type="checkbox"
          class="task-checkbox"
          data-task-action="toggle"
          data-task-id="${task.id}"
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
          data-task-id="${task.id}"
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
    id: Date.now().toString(),
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

async function submitAIQuestion(question = $('aiQuestion').value.trim()) {
  const cleanQuestion = question.trim();
  if (!cleanQuestion) {
    $('aiQuestion').focus();
    return;
  }

  lastAIQuestion = cleanQuestion;
  lastAIResponse = null;
  $('aiErrorContainer').style.display = 'none';
  $('aiResponseContainer').style.display = 'none';
  $('aiLoadingOverlay').style.display = 'grid';
  $('askLifePilotBtn').disabled = true;

  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(35000),
      body: JSON.stringify({ question: cleanQuestion })
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
    $('askLifePilotBtn').disabled = false;
  }
}

function addAIRecommendationsToPlanner() {
  if (!lastAIResponse || !lastAIResponse.recommendedActions.length) return;

  const createdAt = Date.now();
  AppState.tasks.push(...lastAIResponse.recommendedActions.map((title, index) => ({
    id: `${createdAt}-${index}`,
    title,
    priority: 'medium',
    dueDate: '',
    completed: false,
    createdAt
  })));

  saveTasks();
  renderPlannerTasks();
  $('addActionsBtn').textContent = '✓ Added to My Planner';
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
        renderPlan(AppState.currentPlan);

        const saveBtnAfterView = $('savePlanBtn');
        if (saveBtnAfterView) {
          saveBtnAfterView.textContent = '✓ Plan Saved';
        }
      }
    });
  }
}

// Initialize the web app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    attachEventHandlers();
    renderPlannerTasks();
    renderSavedPlans();
  });
} else {
  attachEventHandlers();
  renderPlannerTasks();
  renderSavedPlans();
}
