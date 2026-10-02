// LifePilot prototype: static, self-contained planning app for GitHub Pages.
// This file is designed to remain compatible with normal static hosting and
// later replacement by a real AI/agent layer without redesigning the UI.
//
// SHARED PLANNING ENGINE: RequestAnalyzer and MockAIGenerator are used by both
// the standalone web app AND the MCP server (via server.ts import).
// Do not modify the structure without testing both interfaces.

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

// ============================================================================
// SHARED PLANNING ENGINE (used by both web app and MCP server)
// ============================================================================

const RequestAnalyzer = {
  extract(request) {
    const cleanRequest = String(request || '').trim();
    const lowerRequest = cleanRequest.toLowerCase();

    const details = {
      originalRequest: cleanRequest,
      intent: 'general',
      context: [],
      entities: {},
      missingInformation: []
    };

    // Extract year
    const yearMatch = cleanRequest.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) details.entities.year = yearMatch[0];

    // Extract vehicle make
    const makeMatch = cleanRequest.match(/\b(ford|chevy|chevrolet|toyota|honda|nissan|bmw|audi|volkswagen|hyundai|kia|jeep|dodge|ram|gmc|buick|cadillac|tesla|lexus|mazda|subaru|volvo|mercedes|porsche)\b/gi);
    if (makeMatch) details.entities.make = makeMatch[0];

    // Extract vehicle model
    const modelMatch = cleanRequest.match(/\b(sentra|civic|accord|camry|corolla|f-150|silverado|focus|escape|mustang|cr-v|rav4|altima)\b/gi);
    if (modelMatch) details.entities.model = modelMatch[0];

    // Extract diagnostic code (e.g., P0965)
    const codeMatch = cleanRequest.match(/p\d{4}/gi);
    if (codeMatch) {
      details.entities.diagnosticCode = codeMatch[0].toUpperCase();
    }

    // Extract vehicle symptoms mentioned by the user
    const vehicleSymptoms = [];

    if (/limp mode/i.test(cleanRequest)) {
      vehicleSymptoms.push('enters limp mode');
    }

    if (/won'?t shift|not shift|doesn'?t shift|does not shift/i.test(cleanRequest)) {
      vehicleSymptoms.push('does not shift normally');
    }

    if (/restart|shut.*off.*turn.*back on|turn.*off.*back on/i.test(cleanRequest)) {
      vehicleSymptoms.push('temporarily improves after restarting');
    }

    if (/jerk|jerking|shudder|shuddering/i.test(cleanRequest)) {
      vehicleSymptoms.push('jerking or shuddering');
    }

    if (/slip|slipping/i.test(cleanRequest)) {
      vehicleSymptoms.push('possible slipping');
    }

    if (vehicleSymptoms.length) {
      details.entities.symptoms = vehicleSymptoms.join(', ');
      details.context.push(`Reported symptoms: ${vehicleSymptoms.join(', ')}`);
    }

    // Detect vehicle repair intent
    if (/(limp mode|warning light|transmission|engine|diagnostic code|vehicle|car|repair|mechanic|check engine)/i.test(cleanRequest)) {
      details.intent = 'vehicle_repair';
      details.context.push('Vehicle repair/diagnostic scenario');
    }

    // Detect job search intent
    if (/(job|career|resume|interview|hiring|linkedin|application|job search|cover letter|recruiter)/i.test(cleanRequest)) {
      details.intent = 'job_search';
      details.context.push('Job-search or career-transition scenario');
    }

    // Detect medical/doctor intent
    if (/(doctor|medical|appointment|health|clinic|dentist|physician|symptom|checkup|prescription)/i.test(cleanRequest)) {
      details.intent = 'doctor_appointment';
      details.context.push('Medical preparation or scheduling scenario');
    }

    // Detect travel intent
    if (/(vacation|trip|travel|flight|hotel|destination|getaway|holiday|itinerary)/i.test(cleanRequest)) {
      details.intent = 'travel_planning';
      details.context.push('Travel or vacation planning scenario');
    }

    // Detect user overwhelm signal
    if (/overwhelmed|dont know where to start|not sure where to start|stuck|confused/i.test(cleanRequest)) {
      details.context.push('User is overwhelmed or unsure where to start');
    }

    // Populate missing information by intent
    if (details.intent === 'vehicle_repair') {
      details.missingInformation = [
        'Current mileage and maintenance history',
        ...(details.entities.symptoms ? [] : ['Exact symptoms and when they started']),
        ...(details.entities.diagnosticCode
          ? ['Whether there are any additional codes or warning lights']
          : ['Whether there are any diagnostic codes or warning lights']),
        'Whether the issue happens while idling, accelerating, or under load'
      ];
    }

    if (details.intent === 'job_search') {
      details.missingInformation = [
        'Target role or roles',
        'Location preference',
        'Desired salary range',
        'Timeline you need to start working',
        'Your experience and strongest skills'
      ];
    }

    if (details.intent === 'doctor_appointment') {
      details.missingInformation = [
        'Type of appointment needed',
        'Symptoms and how long they have been happening',
        'Insurance information',
        'Preferred doctor or clinic'
      ];
    }

    if (details.intent === 'travel_planning') {
      details.missingInformation = [
        'Travel dates',
        'Budget',
        'Destination preferences',
        'Number of travelers',
        'Trip length'
      ];
    }

    if (details.intent === 'general' && !details.context.length) {
      details.missingInformation = [
        'What success looks like',
        'Your timeline',
        'Any realistic constraints or budget',
        'What support or resources you already have'
      ];
    }

    return details;
  }
};

const MockAIGenerator = {
  generate(request) {
    const analysis = RequestAnalyzer.extract(request);

    if (analysis.intent === 'vehicle_repair') {
      const vehicleLabel = [analysis.entities.year, analysis.entities.make, analysis.entities.model].filter(Boolean).join(' ');
      const vehicleText = vehicleLabel || 'your vehicle';
      const codeText = analysis.entities.diagnosticCode
        ? ` ${analysis.entities.diagnosticCode}`
        : '';

      return {
        goal: analysis.entities.diagnosticCode
          ? `Diagnose the cause of${codeText} and the reported issues affecting ${vehicleText}, then identify the appropriate repair.`
          : `Diagnose the reported issues affecting ${vehicleText} without guessing at the root cause.`,
        context: [
          `Request includes: ${vehicleText}`,
          analysis.entities.diagnosticCode ? `Diagnostic code identified: ${analysis.entities.diagnosticCode}` : 'No diagnostic code was explicitly provided',
          analysis.entities.symptoms
            ? `Reported symptoms: ${analysis.entities.symptoms}.`
            : 'The request indicates a vehicle issue that needs targeted diagnosis.'
        ].join(' '),
        tasks: [
          'Document exactly when the limp mode appears and under what conditions.',
          'Check whether there are any other warning lights or fault codes beyond the current one.',
          'Review recent service history and any recent repairs or maintenance.',
          'Schedule a diagnostic inspection with a trusted mechanic or repair shop.',
          'Ask for a written estimate and explanation of the likely root cause before approving work.'
        ],
        nextSteps: [
          'Call a repair shop today to schedule a diagnostic appointment.',
          'Bring a list of symptoms, timing, and the code to the appointment.',
          'Avoid driving aggressively until the issue is diagnosed.'
        ],
        followups: [
          'Check the mechanic\'s diagnosis and estimate before approving repairs.',
          'Confirm any transmission or control-module issues are clearly explained in writing.',
          'Verify the vehicle stays out of limp mode after the repair.'
        ],
        informationNeeded: analysis.missingInformation
      };
    }

    if (analysis.intent === 'job_search') {
      return {
        goal: 'Build a focused plan to find work and reduce the overwhelm while keeping momentum.',
        context: [
          'The request shows a job-search intent.',
          /overwhelmed|dont know where to start|not sure where to start|stuck/i.test(request) ? 'The user is feeling overwhelmed, so the plan should simplify the process and create immediate steps.' : 'The user needs a structured approach to job search.'
        ].join(' '),
        tasks: [
          'Choose 2-3 target roles that match your background and interests.',
          'Update your resume for those specific roles and remove outdated details.',
          'Refresh your LinkedIn profile and a brief professional summary.',
          'Create a simple application tracker with dates and follow-up reminders.',
          'Identify a short list of employers you want to target.'
        ],
        nextSteps: [
          'Pick your top three target roles today.',
          'Update your resume and LinkedIn profile this week.',
          'Apply to a small batch of jobs that line up with your targets.'
        ],
        followups: [
          'Track applications and follow-up dates in one place.',
          'Review interview feedback and adjust your approach weekly.',
          'Check in on your momentum and avoid applying randomly.'
        ],
        informationNeeded: analysis.missingInformation
      };
    }

    if (analysis.intent === 'doctor_appointment') {
      return {
        goal: 'Prepare for a medical appointment and make the visit useful and efficient.',
        context: 'The user wants to schedule or prepare for a doctor visit but is unsure what to gather beforehand.',
        tasks: [
          'Write down the symptoms, their severity, and how long they have been happening.',
          'List any medications, allergies, and medical history you want to share.',
          'Check insurance details and confirm the clinic or doctor accepts your plan.',
          'Prepare 2-3 questions for the appointment in advance.',
          'Book the appointment and note any required preparation such as fasting.'
        ],
        nextSteps: [
          'Call or book the appointment today.',
          'Gather your insurance card and symptom notes.',
          'Write down the questions you want answered.'
        ],
        followups: [
          'Confirm the appointment 24 hours before it happens.',
          'After the visit, write down any new instructions or prescriptions.',
          'Schedule any recommended follow-up appointment before leaving.'
        ],
        informationNeeded: analysis.missingInformation
      };
    }

    if (analysis.intent === 'travel_planning') {
      return {
        goal: 'Choose a vacation direction and build a usable plan around budget, timing, and preferences.',
        context: 'The user wants to take a trip but has not decided where to go or what trip details matter most yet.',
        tasks: [
          'Set your travel dates and overall budget.',
          'List the type of trip you want: beach, city, nature, family, adventure, etc.',
          'Compare 2-3 destination options that fit the budget and time available.',
          'Check flight and hotel pricing for the target dates.',
          'Create a simple shortlist of must-do activities.'
        ],
        nextSteps: [
          'Pick a realistic travel window and price range.',
          'Research two or three destinations that fit your preferences.',
          'Choose one destination and book essentials.'
        ],
        followups: [
          'Book flights and lodging before finalizing the itinerary.',
          'Check travel requirements, weather, and packing list closer to departure.',
          'Confirm transportation and key reservations before the trip.'
        ],
        informationNeeded: analysis.missingInformation
      };
    }

    return {
      goal: 'Break the request into manageable actions and identify the next concrete step.',
      context: 'The request is not specific enough to determine a perfect plan, but it still contains a clear intention that can be broken down into actionable steps.',
      tasks: [
        'Clarify exactly what success looks like for this goal.',
        'List the resources, constraints, and information you already have.',
        'Break the result into smaller milestones or time blocks.',
        'Choose the smallest clear action you can complete now.'
      ],
      nextSteps: [
        'State the goal in one sentence.',
        'Pick one immediate action you can finish this week.',
        'Schedule a short time block to complete it.'
      ],
      followups: [
        'Review progress after the first step.',
        'Adjust the plan if conditions or constraints change.',
        'Check in on the goal again after a few days.'
      ],
      informationNeeded: analysis.missingInformation
    };
  }
};

// ============================================================================
// WEB APP UI LAYER (GitHub Pages standalone app)
// ============================================================================

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

function generatePlanFromRequest() {
  const request = input.value.trim();
  if (!request) {
    input.focus();
    return;
  }

  const overlay = $('loadingOverlay');
  if (overlay) {
    overlay.style.display = 'grid';
  }

  setTimeout(() => {
    try {
      const plan = MockAIGenerator.generate(request);
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
      alert('I\'m sorry, but there was an error. Please try again.');
    } finally {
      if (overlay) {
        overlay.style.display = 'none';
      }
    }
  }, 350);
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
