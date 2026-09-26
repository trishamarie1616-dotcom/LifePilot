// LifePilot Prototype - AI-Powered Personal Action Assistant
// 
// ARCHITECTURE NOTES FOR FUTURE INTEGRATION:
// - The RequestAnalyzer class is designed to be replaced with an MCP server
// - The PlanGenerator class can connect to AWS Bedrock, Claude, or OpenAI
// - The UI layer (renderPlan, renderSavedPlans) remains unchanged
// - LocalStorage can be replaced with a cloud backend (DynamoDB, etc.)
// - Alexa+ integration point: AppState and plan data structure

// ============================================
// APP STATE & STORAGE
// ============================================
const AppState = {
  plans: JSON.parse(localStorage.getItem('lifepilot-plans') || '[]'),
  currentPlan: null,
  currentPlanIndex: null
};

// Helper: Get element by ID
const $ = (id) => document.getElementById(id);

// Get input reference
const input = $('userInput');

// ============================================
// REQUEST ANALYZER - Recognizes user intent
// ============================================
// FUTURE: Replace this class with MCP/LLM call to analyze requests
const RequestAnalyzer = {
  analyze(request) {
    const text = request.toLowerCase();
    const analysis = {
      domain: 'general',
      keywords: [],
      details: {},
      confidence: 0.5
    };

    // Vehicle/Car domain detection
    if (text.match(/\b(car|vehicle|truck|bike|motorcycle|auto|engine|transmission|tire|brake|repair|fix|maintenance|diagnostic|code|p\d{4}|limp mode|warning light)\b/gi)) {
      analysis.domain = 'vehicle';
      analysis.confidence = 0.85;
      
      // Extract specific details
      const yearMatch = request.match(/\b(19|20)\d{2}\b/);
      if (yearMatch) analysis.details.year = yearMatch[0];
      
      const makeModelMatch = request.match(/\b(ford|chevy|chevrolet|toyota|honda|nissan|bmw|audi|volkswagen|hyundai|kia|jeep|dodge|ram|gmc|buick|cadillac|tesla|lexus|mazda|subaru|volvo|mercedes|porsche)\b/gi);
      if (makeModelMatch) analysis.details.make = makeModelMatch[0];
      
      const modelMatch = request.match(/\b(sentra|civic|accord|camry|corolla|f-150|silverado|ram|focus|escape|mustang)\b/gi);
      if (modelMatch) analysis.details.model = modelMatch[0];
      
      const codeMatch = request.match(/p\d{4}/gi);
      if (codeMatch) analysis.details.diagnosticCode = codeMatch[0].toUpperCase();
      
      analysis.keywords = ['repair', 'diagnosis', 'mechanic', 'estimate', 'timeline'];
    }
    
    // Job/Career domain detection
    else if (text.match(/\b(job|career|employment|resume|interview|salary|position|company|application|hiring|recruiter|linkedin|cover letter|interview prep|layoff|promotion|raise|skill)\b/gi)) {
      analysis.domain = 'career';
      analysis.confidence = 0.85;
      
      if (text.includes('overwhelm')) analysis.details.stateOfMind = 'overwhelmed';
      if (text.includes('stuck')) analysis.details.stateOfMind = 'stuck';
      if (text.includes('urgent') || text.includes('urgent')) analysis.details.urgency = 'high';
      
      analysis.keywords = ['targets', 'resume', 'applications', 'networking', 'interviews'];
    }
    
    // Medical/Health domain detection
    else if (text.match(/\b(doctor|medical|appointment|health|hospital|clinic|dentist|physician|check-up|diagnosis|prescription|symptom|illness)\b/gi)) {
      analysis.domain = 'medical';
      analysis.confidence = 0.85;
      
      analysis.keywords = ['insurance', 'records', 'provider', 'scheduling', 'preparation'];
    }
    
    // Travel/Planning domain detection
    else if (text.match(/\b(vacation|trip|travel|flight|hotel|booking|destination|itinerary|tour|getaway|holiday|weekend)\b/gi)) {
      analysis.domain = 'travel';
      analysis.confidence = 0.85;
      
      analysis.keywords = ['dates', 'budget', 'destination', 'accommodation', 'activities'];
    }
    
    // Home/Property domain detection
    else if (text.match(/\b(home|house|apartment|rent|mortgage|move|renovation|repair|plumbing|electrical|contractor)\b/gi)) {
      analysis.domain = 'home';
      analysis.confidence = 0.75;
      
      analysis.keywords = ['contractor', 'estimates', 'timeline', 'permits', 'inspections'];
    }
    
    // Finance domain detection
    else if (text.match(/\b(budget|debt|loan|credit|save|invest|financial|money|expense|income|bill|payment)\b/gi)) {
      analysis.domain = 'finance';
      analysis.confidence = 0.75;
      
      analysis.keywords = ['budget', 'tracking', 'payments', 'goals', 'resources'];
    }

    return analysis;
  }
};

// ============================================
// PLAN GENERATOR - Creates structured plans
// ============================================
// FUTURE: Replace this with AWS Bedrock, Claude API, OpenAI, or MCP server
const PlanGenerator = {
  generate(request) {
    try {
      const analysis = RequestAnalyzer.analyze(request);
      
      // Route to domain-specific generator
      if (analysis.domain === 'vehicle') {
        return this.generateVehiclePlan(request, analysis);
      } else if (analysis.domain === 'career') {
        return this.generateCareerPlan(request, analysis);
      } else if (analysis.domain === 'medical') {
        return this.generateMedicalPlan(request, analysis);
      } else if (analysis.domain === 'travel') {
        return this.generateTravelPlan(request, analysis);
      } else if (analysis.domain === 'home') {
        return this.generateHomePlan(request, analysis);
      } else if (analysis.domain === 'finance') {
        return this.generateFinancePlan(request, analysis);
      } else {
        return this.generateGenericPlan(request, analysis);
      }
    } catch (error) {
      console.error('Error generating plan:', error);
      // Fallback to generic plan if anything goes wrong
      return this.generateGenericPlan(request, {});
    }
  },

  generateVehiclePlan(request, analysis) {
    const vehicleInfo = analysis.details.year && analysis.details.make
      ? `${analysis.details.year} ${analysis.details.make} ${analysis.details.model || ''}`
      : 'your vehicle';
    
    const hasDiagnosticCode = !!analysis.details.diagnosticCode;
    
    return {
      goal: `Diagnose and repair ${vehicleInfo} efficiently while managing costs and minimizing downtime.`,
      context: hasDiagnosticCode 
        ? `Diagnostic code ${analysis.details.diagnosticCode} indicates a specific issue that needs proper diagnosis and repair.`
        : 'The vehicle needs diagnostic evaluation to identify the root cause.',
      tasks: [
        'Document all symptoms: when they occur, frequency, and any warning lights.',
        hasDiagnosticCode ? `Research diagnostic code ${analysis.details.diagnosticCode} to understand potential causes.` : 'Request a diagnostic scan at a certified mechanic.',
        'Get written estimates from at least 2-3 trusted repair shops.',
        'Compare estimates on price, timeline, and warranty.',
        'Review the repair plan before authorizing work.'
      ],
      nextSteps: [
        'Call 2-3 local mechanics today to get diagnostic appointment times.',
        'Schedule the earliest available diagnostic appointment.',
        'Prepare a list of all symptoms to discuss with the mechanic.'
      ],
      followups: [
        'Follow up on diagnostic results within 24 hours.',
        'Review repair estimate before giving approval.',
        'Confirm completion date and get written warranty.',
        'Test drive after repair to verify the issue is resolved.'
      ],
      informationNeeded: [
        'Current mileage and service history',
        'Exact symptoms and when they started',
        'Any warning lights or error codes displayed'
      ]
    };
  },

  generateCareerPlan(request, analysis) {
    const stateOfMind = analysis.details.stateOfMind ? ` (${analysis.details.stateOfMind})` : '';
    return {
      goal: `Build a focused, actionable job search strategy${stateOfMind} to find the right opportunity.`,
      context: 'A structured approach reduces overwhelm and increases effectiveness. Breaking down the search into concrete steps makes progress measurable.',
      tasks: [
        'Define 2-3 target job titles or roles that align with your skills.',
        'Identify 10-15 companies you\'d genuinely want to work for.',
        'Update and tailor your resume for your target roles.',
        'Create or update your LinkedIn profile with a professional photo and headline.',
        'Set up an application tracking spreadsheet (Google Sheets is free).',
        'Draft 2-3 cover letter templates for different roles.',
        'Identify 5-10 professional contacts for networking.'
      ],
      nextSteps: [
        'Today: Define your top 3 target job titles.',
        'This week: Update your resume and LinkedIn profile.',
        'This week: Reach out to 2 professional contacts for coffee chats.',
        'Next week: Start applying to positions that match your targets.'
      ],
      followups: [
        'Track applications weekly (company, date, role, status).',
        'Follow up on applications after 1 week if no response.',
        'Conduct at least 2-3 informational interviews per month.',
        'Adjust strategy based on interview feedback.',
        'Update your resume with each new accomplishment.'
      ],
      informationNeeded: [
        'Your core skills and strengths',
        'Preferred salary range and benefits',
        'Geographic preferences (remote, relocation, local)',
        'Industry or company type preferences'
      ]
    };
  },

  generateMedicalPlan(request, analysis) {
    return {
      goal: 'Schedule and prepare for your medical appointment with complete information and follow-through.',
      context: 'Coming prepared with all relevant information helps your doctor make better recommendations and saves time.',
      tasks: [
        'Write down all symptoms with dates and frequency.',
        'List any medications you\'re currently taking.',
        'Note any allergies to medications or materials.',
        'Check your insurance coverage and preferred providers.',
        'Gather relevant medical records if this is a specialist visit.',
        'Make a list of questions you want to ask the doctor.',
        'Arrange transportation if needed.'
      ],
      nextSteps: [
        'Call your doctor\'s office today or use their online portal to schedule.',
        'Ask about estimated wait times and any required prep.',
        'Gather your insurance card and ID.',
        'Write down your main health concerns to discuss.'
      ],
      followups: [
        'Confirm your appointment 24 hours before.',
        'Follow any pre-visit instructions (fasting, lab work, etc.).',
        'After the visit: Record the doctor\'s recommendations.',
        'Fill any prescriptions within 24-48 hours.',
        'Schedule any recommended follow-up appointments before leaving.'
      ],
      informationNeeded: [
        'Your current symptoms and when they started',
        'Your medical history (previous diagnoses, surgeries)',
        'Your current medications and supplements',
        'Your insurance provider and plan details'
      ]
    };
  },

  generateTravelPlan(request, analysis) {
    return {
      goal: 'Plan a well-organized trip that balances activities, budget, and logistics.',
      context: 'A structured travel plan prevents last-minute stress and ensures you enjoy every part of your trip.',
      tasks: [
        'Decide on travel dates and duration.',
        'Set a total budget (flights, hotels, food, activities).',
        'Research and compare flights for your dates.',
        'Book accommodations that fit your budget and preferences.',
        'Create a rough itinerary of must-see attractions and activities.',
        'Check passport expiration and visa requirements if international.',
        'Book any major activities or tours in advance.'
      ],
      nextSteps: [
        'Confirm your travel dates today.',
        'Set a realistic total budget.',
        'Search for flights for your dates.',
        'Read reviews and book accommodations.'
      ],
      followups: [
        'Book flights and accommodations within one week.',
        'Confirm hotel reservations 1 week before travel.',
        'Check weather forecast 3 days before departure.',
        'Prepare packing list 1 week in advance.',
        'Share itinerary with a trusted contact before traveling.'
      ],
      informationNeeded: [
        'Your travel dates',
        'Number of travelers and their preferences',
        'Total budget',
        'Preferred activities and type of vacation',
        'Any travel restrictions or requirements'
      ]
    };
  },

  generateHomePlan(request, analysis) {
    return {
      goal: 'Organize your home project with clear scope, timeline, and contractor management.',
      context: 'Home projects are easier to manage with written specifications and multiple contractor estimates.',
      tasks: [
        'Define the exact scope of work needed.',
        'Take photos or videos of the area to be worked on.',
        'Get written estimates from 3+ qualified contractors.',
        'Check contractor licenses, insurance, and references.',
        'Review contracts carefully before signing.',
        'Agree on payment schedule (typically 1/3 upfront, 1/3 mid-project, 1/3 on completion).',
        'Schedule regular check-ins during the project.'
      ],
      nextSteps: [
        'Document the project scope in writing.',
        'Contact 3 contractors this week.',
        'Schedule in-home estimates.',
        'Compare quotes and references.'
      ],
      followups: [
        'Review estimate carefully and ask questions.',
        'Verify contractor insurance before starting.',
        'Do a walkthrough with contractor to confirm scope.',
        'Inspect work daily during the project.',
        'Do a final walkthrough before final payment.'
      ],
      informationNeeded: [
        'Scope of work and materials to be used',
        'Your budget and timeline',
        'Any specific brand or style preferences',
        'Existing issues to be addressed',
        'Permits or inspections required'
      ]
    };
  },

  generateFinancePlan(request, analysis) {
    return {
      goal: 'Create a clear financial plan to achieve your money goals.',
      context: 'Financial goals are more achievable when broken into concrete, measurable steps.',
      tasks: [
        'List all income sources and monthly amount.',
        'Track all monthly expenses for 2-3 months.',
        'Calculate your savings rate.',
        'Prioritize financial goals (debt payoff, savings, investing).',
        'Set up a simple budget spreadsheet or use a free app.',
        'Automate savings and debt payments.',
        'Create an emergency fund (3-6 months expenses).'
      ],
      nextSteps: [
        'Calculate your monthly income today.',
        'Track all expenses this week.',
        'List your top 3 financial priorities.',
        'Set up a free budgeting tool or spreadsheet.'
      ],
      followups: [
        'Review your budget weekly for the first month.',
        'Adjust as needed based on actual spending.',
        'Check progress on financial goals monthly.',
        'Increase savings rate as income grows.',
        'Review and rebalance quarterly.'
      ],
      informationNeeded: [
        'Your total monthly income',
        'Your current debt and obligations',
        'Your financial goals and timeline',
        'Your risk tolerance for investments',
        'Any major expenses expected this year'
      ]
    };
  },

  generateGenericPlan(request, analysis) {
    return {
      goal: `Turn "${request}" into a manageable sequence of concrete actions.`,
      context: 'Breaking down your goal into smaller steps makes progress measurable and keeps momentum.',
      tasks: [
        'Clarify exactly what success looks like for this goal.',
        'Break the goal into smaller, time-boxed milestones.',
        'Identify resources, people, or tools you\'ll need.',
        'List any obstacles or challenges to anticipate.',
        'Start with the smallest useful first step today.'
      ],
      nextSteps: [
        'Define what "done" looks like for this goal.',
        'Choose one small action you can do today.',
        'Schedule 30 minutes this week to plan the full approach.',
        'Identify 1-2 people who might help.'
      ],
      followups: [
        'Review progress after your first action.',
        'Adjust the plan based on what you learn.',
        'Check in with yourself weekly on momentum.',
        'Celebrate small wins along the way.'
      ],
      informationNeeded: [
        'What does success look like?',
        'What resources do you have available?',
        'What\'s your timeline?',
        'Who could help or support you?'
      ]
    };
  }
};

// ============================================
// UI RENDERING FUNCTIONS
// ============================================
function renderPlan(plan) {
  try {
    $('planGoal').textContent = plan.goal || '';
    
    // Render context if it exists
    const contextSection = $('planContext');
    if (contextSection && plan.context) {
      contextSection.style.display = 'block';
      $('planContextText').textContent = plan.context;
    } else if (contextSection) {
      contextSection.style.display = 'none';
    }
    
    // Render action items
    $('planTasks').innerHTML = (plan.tasks || [])
      .map((task) => `<li>${escapeHTML(task)}</li>`)
      .join('');
    
    // Render next steps
    $('planNextSteps').innerHTML = (plan.nextSteps || [])
      .map((step) => `<li>${escapeHTML(step)}</li>`)
      .join('');
    
    // Render follow-ups
    $('planFollowups').innerHTML = (plan.followups || [])
      .map((item) => `<li>${escapeHTML(item)}</li>`)
      .join('');
    
    // Render information needed if it exists
    const infoSection = $('planInformationNeeded');
    if (infoSection && plan.informationNeeded) {
      infoSection.style.display = 'block';
      $('planInformationNeededList').innerHTML = (plan.informationNeeded || [])
        .map((info) => `<li>${escapeHTML(info)}</li>`)
        .join('');
    } else if (infoSection) {
      infoSection.style.display = 'none';
    }
    
    // Show the plan container
    $('currentPlanContainer').style.display = 'block';
    $('currentPlanContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    console.error('Error rendering plan:', error);
  }
}

function renderSavedPlans() {
  try {
    $('plansCount').textContent = AppState.plans.length;
    $('emptyState').style.display = AppState.plans.length ? 'none' : 'block';
    
    $('plansList').innerHTML = AppState.plans
      .map((plan, index) => `
        <article class="saved-plan">
          <div>
            <h3>${escapeHTML(plan.title)}</h3>
            <p>${escapeHTML(plan.goal)}</p>
          </div>
          <button class="view-plan-btn" data-plan-index="${index}">View</button>
        </article>
      `)
      .join('');
  } catch (error) {
    console.error('Error rendering saved plans:', error);
  }
}

function escapeHTML(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[char]));
}

// ============================================
// EVENT HANDLERS
// ============================================

// Submit button - Generate plan from user request
$('submitBtn').addEventListener('click', () => {
  const request = input.value.trim();
  if (!request) {
    input.focus();
    return;
  }
  
  try {
    $('loadingOverlay').style.display = 'grid';
    
    // Simulate a brief processing delay for better UX
    setTimeout(() => {
      try {
        const plan = PlanGenerator.generate(request);
        AppState.currentPlan = { ...plan, title: request, createdAt: new Date().toISOString() };
        AppState.currentPlanIndex = null; // New plan, not from saved
        
        renderPlan(AppState.currentPlan);
        
        // Reset save button text
        $('savePlanBtn').textContent = '💾 Save This Plan';
        
        $('loadingOverlay').style.display = 'none';
      } catch (error) {
        console.error('Error generating plan:', error);
        $('loadingOverlay').style.display = 'none';
        alert('I\'m sorry, but there was an error generating your plan. Please try again.');
      }
    }, 500);
  } catch (error) {
    console.error('Error in submit handler:', error);
    $('loadingOverlay').style.display = 'none';
    alert('I\'m sorry, but there was an error. Please try again.');
  }
});

// Keyboard shortcut: Cmd/Ctrl + Enter to submit
input.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    $('submitBtn').click();
  }
});

// Example prompt buttons
document.querySelectorAll('.example-btn').forEach((button) => {
  button.addEventListener('click', () => {
    input.value = button.dataset.example;
    input.focus();
  });
});

// Close plan button
if ($('closePlanBtn')) {
  $('closePlanBtn').addEventListener('click', () => {
    $('currentPlanContainer').style.display = 'none';
  });
}

// Save plan button
$('savePlanBtn').addEventListener('click', () => {
  if (!AppState.currentPlan) return;
  
  try {
    // Add unique ID if not already present
    if (!AppState.currentPlan.id) {
      AppState.currentPlan.id = Date.now();
    }
    
    // Add to beginning of plans array
    AppState.plans.unshift({ ...AppState.currentPlan });
    
    // Persist to localStorage
    localStorage.setItem('lifepilot-plans', JSON.stringify(AppState.plans));
    
    // Re-render the saved plans list
    renderSavedPlans();
    
    // Update button text
    $('savePlanBtn').textContent = '✓ Plan Saved';
  } catch (error) {
    console.error('Error saving plan:', error);
    alert('There was an error saving your plan. Please try again.');
  }
});

// View saved plan
$('plansList').addEventListener('click', (event) => {
  const button = event.target.closest('.view-plan-btn');
  if (button) {
    const index = parseInt(button.dataset.planIndex);
    if (AppState.plans[index]) {
      AppState.currentPlan = AppState.plans[index];
      AppState.currentPlanIndex = index;
      renderPlan(AppState.currentPlan);
      $('savePlanBtn').textContent = '✓ Plan Saved';
    }
  }
});

// ============================================
// INITIALIZATION
// ============================================
// Render existing saved plans on page load
renderSavedPlans();
