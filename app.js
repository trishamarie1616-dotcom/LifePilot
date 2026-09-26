// LifePilot Prototype - stable static version
// This file intentionally stays self-contained so it can run on GitHub Pages
// without a backend, API keys, or external services.
//
// Future AI/MCP integration point:
// - Replace MockAIGenerator.generate() with a call to an MCP server, AWS Bedrock,
//   or a hosted AI model while keeping the UI/render logic unchanged.
// - The AppState and LocalStorage structure can be adapted to a cloud backend later.

const AppState = {
  plans: JSON.parse(localStorage.getItem('lifepilot-plans') || '[]'),
  currentPlan: null
};

const $ = (id) => document.getElementById(id);
const input = $('userInput');

const MockAIGenerator = {
  generate(request) {
    const text = request.toLowerCase();

    if (/(2014|2015|2016|2017|2018|2019|2020|2021|2022|2023|2024|2025).*(nissan|sentra)|nissan.*sentra|sentra.*nissan|limp mode|p0965|diagnostic code|vehicle|car|repair/i.test(request)) {
      return {
        goal: 'Diagnose and repair the vehicle issue while keeping the cost and timeline under control.',
        context: 'The request includes a 2014 Nissan Sentra, limp mode, and diagnostic code P0965, which suggests a drivetrain or transmission related issue that needs focused diagnosis.',
        tasks: [
          'Gather the exact timing and trigger for the limp mode event.',
          'Check whether the code P0965 is active and note any other warning lights.',
          'Review recent maintenance or fluid changes that may affect transmission behavior.',
          'Get a diagnostic scan and written estimate from a trusted mechanic.',
          'Compare repair options and choose the most reliable fix.'
        ],
        nextSteps: [
          'Schedule a diagnostic inspection with a mechanic today.',
          'Document the exact symptoms and any warning lights before the appointment.',
          'Ask the shop to confirm whether the issue is transmission or control-related.'
        ],
        followups: [
          'Review the diagnostic estimate before approving any repair work.',
          'Ask for a written explanation of the root cause and required fix.',
          'Verify the vehicle stays out of limp mode after the repair.'
        ],
        informationNeeded: [
          'Current mileage and maintenance history',
          'Any other warning lights or codes present',
          'Whether the issue happens under acceleration, deceleration, or while idling'
        ]
      };
    }

    if (/(job|career|resume|interview|hiring|linkedin|cover letter|position|application|job search)/i.test(request)) {
      return {
        goal: 'Create a focused, workable plan to find the right job without getting overwhelmed.',
        context: 'The user is in a job-search situation and is feeling overwhelmed, so the plan should reduce complexity and make action easier to start.',
        tasks: [
          'Choose 2-3 target roles that match your background and interests.',
          'Update your resume for those roles and remove outdated or irrelevant details.',
          'Refresh your LinkedIn profile with a clear headline and summary.',
          'List 10 companies or roles you actually want to pursue.',
          'Create a simple tracker for applications and follow-ups.'
        ],
        nextSteps: [
          'Pick your top three target roles this week.',
          'Update your resume today and save it in a versioned folder.',
          'Apply to 3-5 jobs that match those targets.'
        ],
        followups: [
          'Track application dates and follow-up dates in one place.',
          'Follow up after one week if you have not heard back.',
          'Review interview feedback and adjust your strategy.'
        ],
        informationNeeded: [
          'Target role or roles',
          'Location preferences',
          'Desired salary range',
          'Availability and work schedule',
          'Years of experience and key skills'
        ]
      };
    }

    if (/(doctor|medical|appointment|symptom|checkup|health|clinic|dentist|physician)/i.test(request)) {
      return {
        goal: 'Prepare for the appointment so you can get the right care and ask the most important questions.',
        context: 'The user wants to schedule or prepare for a medical appointment and is unsure what is needed beforehand.',
        tasks: [
          'Write down symptoms, duration, and severity.',
          'List medications, allergies, and important health history.',
          'Check insurance and provider network before booking.',
          'Prepare questions for the doctor before the visit.',
          'Schedule date and time and consider any transportation needs.'
        ],
        nextSteps: [
          'Call the clinic or use the portal to book the appointment.',
          'Gather insurance details and your main questions.',
          'Create a short symptom summary for the doctor.'
        ],
        followups: [
          'Confirm the appointment 24 hours before.',
          'Bring medication list and questions to the visit.',
          'Write down follow-up instructions after the appointment.'
        ],
        informationNeeded: [
          'Type of appointment needed',
          'Symptoms and their timeline',
          'Insurance details',
          'Preferred doctor or clinic'
        ]
      };
    }

    if (/(vacation|travel|trip|flight|hotel|destination|itinerary|getaway|holiday)/i.test(request)) {
      return {
        goal: 'Plan a trip that fits your budget, preferences, and timing without overthinking the details.',
        context: 'The user wants a vacation but has not decided on a destination or trip details yet.',
        tasks: [
          'Choose a rough travel window and total budget.',
          'List your vacation preferences: beach, city, nature, budget, etc.',
          'Compare 2-3 destination options.',
          'Check flight and hotel prices for the chosen dates.',
          'Create a simple itinerary or shortlist of activities.'
        ],
        nextSteps: [
          'Set a realistic travel budget and preferred dates.',
          'Research 2-3 destination options.',
          'Pick one destination and start booking the essentials.'
        ],
        followups: [
          'Book flights and lodging before the trip.',
          'Check weather and travel requirements closer to departure.',
          'Prepare a packing list and itinerary.'
        ],
        informationNeeded: [
          'Travel dates',
          'Budget',
          'Destination preferences',
          'Number of travelers',
          'Trip length'
        ]
      };
    }

    return {
      goal: 'Break the request into a manageable plan and identify the next concrete actions.',
      context: 'The request is not specific enough to fully determine the exact environment, but it still contains a clear goal that can be broken into next actions.',
      tasks: [
        'Clarify what success looks like for this goal.',
        'List any tools, resources, or information you need.',
        'Break the goal into smaller milestones.',
        'Choose the first action you can complete this week.'
      ],
      nextSteps: [
        'Define the goal in one sentence.',
        'Decide on the first step you can complete within 30 minutes.',
        'Schedule a time to take that action.'
      ],
      followups: [
        'Review progress after the first milestone.',
        'Adjust the plan if requirements change.',
        'Check in again after a few days.'
      ],
      informationNeeded: [
        'Desired end result',
        'Timeline',
        'Budget or constraints',
        'Resources or support needed'
      ]
    };
  }
};

function renderPlan(plan) {
  if (!plan) return;

  if ($('planGoal')) {
    $('planGoal').textContent = plan.goal || '';
  }

  if ($('planTasks')) {
    $('planTasks').innerHTML = (plan.tasks || [])
      .map((task) => `<li>${escapeHTML(task)}</li>`)
      .join('');
  }

  if ($('planNextSteps')) {
    $('planNextSteps').innerHTML = (plan.nextSteps || [])
      .map((step) => `<li>${escapeHTML(step)}</li>`)
      .join('');
  }

  if ($('planFollowups')) {
    $('planFollowups').innerHTML = (plan.followups || [])
      .map((item) => `<li>${escapeHTML(item)}</li>`)
      .join('');
  }

  if ($('currentPlanContainer')) {
    $('currentPlanContainer').style.display = 'block';
    $('currentPlanContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderSavedPlans() {
  const countEl = $('plansCount');
  const emptyState = $('emptyState');
  const listEl = $('plansList');

  if (!countEl || !emptyState || !listEl) return;

  countEl.textContent = AppState.plans.length;
  emptyState.style.display = AppState.plans.length ? 'none' : 'block';

  listEl.innerHTML = AppState.plans
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

  if ($('loadingOverlay')) {
    $('loadingOverlay').style.display = 'grid';
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

      if ($('savePlanBtn')) {
        $('savePlanBtn').textContent = '💾 Save This Plan';
      }

      if ($('loadingOverlay')) {
        $('loadingOverlay').style.display = 'none';
      }
    } catch (error) {
      console.error('Error generating plan:', error);
      if ($('loadingOverlay')) {
        $('loadingOverlay').style.display = 'none';
      }
      alert('I\'m sorry, but there was an error. Please try again.');
    }
  }, 400);
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

    if ($('savePlanBtn')) {
      $('savePlanBtn').textContent = '✓ Plan Saved';
    }
  } catch (error) {
    console.error('Error saving plan:', error);
    alert('There was an error saving your plan. Please try again.');
  }
}

function attachEventHandlers() {
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
        input.value = button.dataset.example;
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
        if ($('savePlanBtn')) {
          $('savePlanBtn').textContent = '✓ Plan Saved';
        }
      }
    });
  }
}

attachEventHandlers();
renderSavedPlans();
