// LifePilot prototype: mock planning logic is intentionally isolated so it can later
// be replaced by an MCP/AWS/LLM adapter without changing the UI.
const AppState = {
  plans: JSON.parse(localStorage.getItem('lifepilot-plans') || '[]'),
  currentPlan: null
};

const $ = (id) => document.getElementById(id);
const input = $('userInput');

const MockAIGenerator = {
  generate(request) {
    const text = request.toLowerCase();
    if (text.includes('car') || text.includes('vehicle')) return {
      goal: 'Get your car evaluated, repaired, and safely back on the road with a clear plan for cost and timing.',
      tasks: ['Write down the symptoms, warning lights, and when they started.', 'Compare two or three trusted repair shops.', 'Ask for a written estimate and expected completion date.', 'Set aside a budget for the repair and possible follow-up work.'],
      nextSteps: ['Call one repair shop today to describe the issue.', 'Book a diagnostic appointment that fits your schedule.'],
      followups: ['Check the estimate before approving work.', 'Follow up after the repair to confirm the issue is resolved.']
    };
    if (text.includes('job') || text.includes('career')) return {
      goal: 'Create a focused job search routine that helps you find, tailor, and track promising opportunities.',
      tasks: ['Choose two target roles and refresh your resume for them.', 'Make a short list of companies you would be excited to join.', 'Set up a simple application tracker.', 'Reach out to two people in your network for conversations.'],
      nextSteps: ['Pick one role to prioritize this week.', 'Schedule a 45-minute application session.'],
      followups: ['Review applications every Friday.', 'Send a polite follow-up one week after applying.']
    };
    if (text.includes('doctor') || text.includes('appointment')) return {
      goal: 'Prepare for and schedule a doctor appointment with the right information and follow-through.',
      tasks: ['Write down symptoms, questions, and how long they have been present.', 'Check your insurance and preferred providers.', 'Call or book online for the earliest suitable appointment.', 'Gather medications and relevant medical history.'],
      nextSteps: ['Choose a provider and contact their office.', 'Add the appointment and preparation time to your calendar.'],
      followups: ['Confirm the appointment 24 hours beforehand.', 'Record the doctor’s recommendations and next actions.']
    };
    return {
      goal: `Turn “${request}” into a manageable sequence of actions and keep momentum with thoughtful follow-ups.`,
      tasks: ['Clarify what a successful outcome looks like.', 'Break the goal into smaller, time-boxed actions.', 'Gather any information, tools, or people you need.', 'Complete the first task before adding more scope.'],
      nextSteps: ['Choose the smallest useful first step.', 'Put a time on your calendar to begin.'],
      followups: ['Review progress in three days.', 'Adjust the plan after your first action.']
    };
  }
};

function renderPlan(plan) {
  $('planGoal').textContent = plan.goal;
  $('planTasks').innerHTML = plan.tasks.map((task) => `<li>${escapeHTML(task)}</li>`).join('');
  $('planNextSteps').innerHTML = plan.nextSteps.map((step) => `<li>${escapeHTML(step)}</li>`).join('');
  $('planFollowups').innerHTML = plan.followups.map((item) => `<li>${escapeHTML(item)}</li>`).join('');
  $('currentPlanContainer').style.display = 'block';
  $('currentPlanContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSavedPlans() {
  $('plansCount').textContent = AppState.plans.length;
  $('emptyState').style.display = AppState.plans.length ? 'none' : 'block';
  $('plansList').innerHTML = AppState.plans.map((plan, index) => `<article class="saved-plan"><div><h3>${escapeHTML(plan.title)}</h3><p>${escapeHTML(plan.goal)}</p></div><button data-plan-index="${index}">View</button></article>`).join('');
}

function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

$('submitBtn').addEventListener('click', () => {
  const request = input.value.trim();
  if (!request) { input.focus(); return; }
  $('loadingOverlay').style.display = 'grid';
  setTimeout(() => {
    AppState.currentPlan = { ...MockAIGenerator.generate(request), title: request };
    renderPlan(AppState.currentPlan);
    $('loadingOverlay').style.display = 'none';
  }, 500);
});

input.addEventListener('keydown', (event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') $('submitBtn').click(); });
document.querySelectorAll('.example-btn').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.example; input.focus(); }));
$('closePlanBtn').addEventListener('click', () => { $('currentPlanContainer').style.display = 'none'; });
$('savePlanBtn').addEventListener('click', () => {
  if (!AppState.currentPlan) return;
  AppState.plans.unshift({ ...AppState.currentPlan, id: Date.now() });
  localStorage.setItem('lifepilot-plans', JSON.stringify(AppState.plans));
  renderSavedPlans();
  $('savePlanBtn').textContent = '✓ Plan Saved';
});
$('plansList').addEventListener('click', (event) => { const button = event.target.closest('[data-plan-index]'); if (button) { AppState.currentPlan = AppState.plans[button.dataset.planIndex]; renderPlan(AppState.currentPlan); } });
renderSavedPlans();
