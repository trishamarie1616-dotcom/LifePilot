/**
 * MCP Server: LifePilot Planning Engine
 * 
 * This server exposes the LifePilot planning logic as an MCP tool and UI resource.
 * The planning engine (RequestAnalyzer, MockAIGenerator) is shared with the
 * standalone web app in app.js via CommonJS export patterns.
 * 
 * MCP Tool: "generate-plan"
 *   Input: { request: string }
 *   Output: { goal, context, tasks, nextSteps, followups, informationNeeded }
 *   UI Resource: ui://lifepilot/mcp-app.html (bundled HTML + MCP App SDK)
 */

import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE
} from '@modelcontextprotocol/ext-apps/server';
import {
  McpServer,
  type CallToolResult,
  type ReadResourceResult
} from '@modelcontextprotocol/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Determine dist directory (works from both source .ts and compiled .js)
const SERVER_FILE = fileURLToPath(import.meta.url);
const DIST_DIR = SERVER_FILE.endsWith('.ts')
  ? path.join(path.dirname(SERVER_FILE), 'dist')
  : path.dirname(SERVER_FILE);

// ============================================================================
// SHARED PLANNING ENGINE (imported from app.js as CommonJS)
// ============================================================================
// In a real deployment, this could import from a shared module.
// For now, we replicate the essential logic here to avoid circular dependencies.

interface PlanAnalysis {
  originalRequest: string;
  intent: string;
  context: string[];
  entities: Record<string, string>;
  missingInformation: string[];
}

interface Plan {
  goal: string;
  context: string;
  tasks: string[];
  nextSteps: string[];
  followups: string[];
  informationNeeded: string[];
}

const RequestAnalyzer = {
  extract(request: string): PlanAnalysis {
    const cleanRequest = String(request || '').trim();
    





    const details: PlanAnalysis = {
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
    const makeMatch = cleanRequest.match(
      /\b(ford|chevy|chevrolet|toyota|honda|nissan|bmw|audi|volkswagen|hyundai|kia|jeep|dodge|ram|gmc|buick|cadillac|tesla|lexus|mazda|subaru|volvo|mercedes|porsche)\b/gi
    );
    if (makeMatch) details.entities.make = makeMatch[0];

    // Extract vehicle model
    const modelMatch = cleanRequest.match(
      /\b(sentra|civic|accord|camry|corolla|f-150|silverado|focus|escape|mustang|cr-v|rav4|altima)\b/gi
    );
    if (modelMatch) details.entities.model = modelMatch[0];

    // Extract diagnostic code
    const codeMatch = cleanRequest.match(/p\d{4}/gi);
    if (codeMatch) {
      details.entities.diagnosticCode = codeMatch[0].toUpperCase();
    }

    // Detect vehicle repair intent
    if (
      /(limp mode|warning light|transmission|engine|diagnostic code|vehicle|car|repair|mechanic|check engine)/i.test(
        cleanRequest
      )
    ) {
      details.intent = 'vehicle_repair';
      details.context.push('Vehicle repair/diagnostic scenario');
    }

    // Detect job search intent
    if (
      /(job|career|resume|interview|hiring|linkedin|application|job search|cover letter|recruiter)/i.test(
        cleanRequest
      )
    ) {
      details.intent = 'job_search';
      details.context.push('Job-search or career-transition scenario');
    }

    // Detect medical intent
    if (
      /(doctor|medical|appointment|health|clinic|dentist|physician|symptom|checkup|prescription)/i.test(
        cleanRequest
      )
    ) {
      details.intent = 'doctor_appointment';
      details.context.push('Medical preparation or scheduling scenario');
    }

    // Detect travel intent
    if (/(vacation|trip|travel|flight|hotel|destination|getaway|holiday|itinerary)/i.test(cleanRequest)) {
      details.intent = 'travel_planning';
      details.context.push('Travel or vacation planning scenario');
    }

    // Detect overwhelm signal
    if (/overwhelmed|dont know where to start|not sure where to start|stuck|confused/i.test(cleanRequest)) {
      details.context.push('User is overwhelmed or unsure where to start');
    }

    // Populate missing information by intent
    if (details.intent === 'vehicle_repair') {
      details.missingInformation = [
        'Current mileage and maintenance history',
        'Exact symptoms and when they started',
        'Whether there are any additional codes or warning lights',
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
  generate(request: string): Plan {
    const analysis = RequestAnalyzer.extract(request);

    if (analysis.intent === 'vehicle_repair') {
      const vehicleLabel = [analysis.entities.year, analysis.entities.make, analysis.entities.model]
        .filter(Boolean)
        .join(' ');
      const vehicleText = vehicleLabel || 'your vehicle';
      const codeText = analysis.entities.diagnosticCode
        ? ` and diagnostic code ${analysis.entities.diagnosticCode}`
        : '';

      return {
        goal: `Diagnose and address the issue affecting ${vehicleText} without guessing at the root cause.${codeText}`,
        context: [
          `Request includes: ${vehicleText}`,
          analysis.entities.diagnosticCode
            ? `Diagnostic code identified: ${analysis.entities.diagnosticCode}`
            : 'No diagnostic code was explicitly provided',
          /limp mode/i.test(request)
            ? 'Vehicle is entering limp mode, which indicates a drivetrain or transmission-related concern.'
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
          "Check the mechanic's diagnosis and estimate before approving repairs.",
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
          /overwhelmed|dont know where to start|not sure where to start|stuck/i.test(request)
            ? 'The user is feeling overwhelmed, so the plan should simplify the process and create immediate steps.'
            : 'The user needs a structured approach to job search.'
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
        context:
          'The user wants to take a trip but has not decided where to go or what trip details matter most yet.',
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
      context:
        'The request is not specific enough to determine a perfect plan, but it still contains a clear intention that can be broken down into actionable steps.',
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
// SERVER-SIDE TASK STORE (for MCP tools)
// ============================================================================
// NOTE: The standalone web Planner persists tasks in the *browser's*
// localStorage (key "lifepilot-planner-tasks"), which is only reachable from
// client-side JavaScript. Server-side MCP tools (used by Alexa+ and other MCP
// hosts) cannot read or write browser localStorage. To give Alexa+ a working
// task list without pretending otherwise, we keep a small in-memory task
// store here that mirrors the same task shape used by the web Planner
// (text, priority, dueDate, completed). This store is intentionally separate
// from browser localStorage and is scoped to the running server process; it
// resets on restart and is not currently synced with the web UI.
type TaskPriority = 'low' | 'medium' | 'high';

interface StoredTask {
  id: string;
  task: string;
  priority: TaskPriority;
  dueDate: string | null;
  completed: boolean;
  createdAt: string;
}

const taskStore: StoredTask[] = [];
let nextTaskId = 1;

function createTaskId(): string {
  return `task-${nextTaskId++}`;
}

// ============================================================================
// MCP SERVER CREATION
// ============================================================================

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'LifePilot Planning Engine',
    version: '1.0.0'
  });

  const resourceUri = 'ui://lifepilot/mcp-app.html';

  // Register the "generate-plan" tool with UI metadata
  registerAppTool(
    server,
    'generate-plan',
    {
      title: 'Generate Plan',
      description: 'Turn a request into a structured plan with tasks, next steps, and follow-ups.',
      inputSchema: z.object({
        request: z.string().min(1).describe('The user request or goal to plan for')
      }),
      outputSchema: z.object({
        goal: z.string(),
        context: z.string(),
        tasks: z.array(z.string()),
        nextSteps: z.array(z.string()),
        followups: z.array(z.string()),
        informationNeeded: z.array(z.string())
      }),
      _meta: { ui: { resourceUri } } // Link tool to UI resource
    },
    async ({ request }): Promise<CallToolResult> => {
      try {
        const plan = MockAIGenerator.generate(request);

        // Text fallback for non-UI clients
        const textFallback = `
PLAN: ${plan.goal}

CONTEXT:
${plan.context}

TASKS:
${plan.tasks.map((t) => `- ${t}`).join('\n')}

NEXT STEPS:
${plan.nextSteps.map((s) => `- ${s}`).join('\n')}

FOLLOW-UPS:
${plan.followups.map((f) => `- ${f}`).join('\n')}

INFORMATION NEEDED:
${plan.informationNeeded.map((i) => `- ${i}`).join('\n')}
        `.trim();

        return {
          content: [
            {
              type: 'text',
              text: textFallback
            }
          ],
          // Structured content for MCP App UI to render
          structuredContent: plan
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error generating plan: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Register the UI resource
  registerAppResource(
    server,
    resourceUri,
    resourceUri,
    { mimeType: RESOURCE_MIME_TYPE },
    async (): Promise<ReadResourceResult> => {
      try {
        const html = await fs.readFile(path.join(DIST_DIR, 'mcp-app.html'), 'utf-8');
        return {
          contents: [
            {
              uri: resourceUri,
              mimeType: RESOURCE_MIME_TYPE,
              text: html
            }
          ]
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          contents: [
            {
              uri: resourceUri,
              mimeType: RESOURCE_MIME_TYPE,
              text: `<h1>Error loading resource</h1><p>${errorMessage}</p>`
            }
          ]
        };
      }
    }
  );

  // Register the "add-task" tool (Alexa+/agent-friendly task capture)
  server.registerTool(
    'add-task',
    {
      title: 'Add LifePilot Task',
      description:
        'Add a task to LifePilot (e.g. from Alexa+ or another agent). Stores the task in the server-side task list used by MCP tools.',
      inputSchema: z.object({
        task: z.string().min(1).describe('The task text to add'),
        priority: z
          .enum(['low', 'medium', 'high'])
          .optional()
          .describe('Optional priority for the task (defaults to "medium")'),
        dueDate: z.string().optional().describe('Optional due date for the task, as free-form text')
      }),
      outputSchema: z.object({
        added: z.boolean(),
        task: z.object({
          id: z.string(),
          task: z.string(),
          priority: z.enum(['low', 'medium', 'high']),
          dueDate: z.string().nullable(),
          completed: z.boolean()
        })
      })
    },
    async ({ task, priority, dueDate }): Promise<CallToolResult> => {
      try {
        const stored: StoredTask = {
          id: createTaskId(),
          task: task.trim(),
          priority: priority ?? 'medium',
          dueDate: dueDate?.trim() || null,
          completed: false,
          createdAt: new Date().toISOString()
        };
        taskStore.push(stored);

        const output = {
          added: true,
          task: {
            id: stored.id,
            task: stored.task,
            priority: stored.priority,
            dueDate: stored.dueDate,
            completed: stored.completed
          }
        };

        return {
          content: [
            {
              type: 'text',
              text: `Added task "${stored.task}" (priority: ${stored.priority}${stored.dueDate ? `, due: ${stored.dueDate}` : ''}).`
            }
          ],
          structuredContent: output
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error adding task: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Register the "list-tasks" tool (Alexa+/agent-friendly task retrieval)
  server.registerTool(
    'list-tasks',
    {
      title: 'List LifePilot Tasks',
      description:
        'Return the current LifePilot task list from the server-side task store used by MCP tools (e.g. for Alexa+).',
      inputSchema: z.object({}),
      outputSchema: z.object({
        tasks: z.array(
          z.object({
            id: z.string(),
            task: z.string(),
            priority: z.enum(['low', 'medium', 'high']),
            dueDate: z.string().nullable(),
            completed: z.boolean()
          })
        )
      })
    },
    async (): Promise<CallToolResult> => {
      try {
        const tasks = taskStore.map((t) => ({
          id: t.id,
          task: t.task,
          priority: t.priority,
          dueDate: t.dueDate,
          completed: t.completed
        }));

        const textFallback =
          tasks.length === 0
            ? 'No tasks found.'
            : tasks
                .map((t) => `- [${t.completed ? 'x' : ' '}] ${t.task} (priority: ${t.priority})`)
                .join('\n');

        return {
          content: [
            {
              type: 'text',
              text: textFallback
            }
          ],
          structuredContent: { tasks }
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error listing tasks: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  // Register the "complete-task" tool (Alexa+/agent-friendly task completion)
  server.registerTool(
    'complete-task',
    {
      title: 'Complete LifePilot Task',
      description:
        'Mark a LifePilot task complete by its id or by matching its task text (e.g. from Alexa+).',
      inputSchema: z.object({
        task: z.string().min(1).describe('The task id or task text identifying the task to complete')
      }),
      outputSchema: z.object({
        completed: z.boolean(),
        task: z
          .object({
            id: z.string(),
            task: z.string(),
            priority: z.enum(['low', 'medium', 'high']),
            dueDate: z.string().nullable(),
            completed: z.boolean()
          })
          .nullable(),
        message: z.string()
      })
    },
    async ({ task }): Promise<CallToolResult> => {
      try {
        const identifier = task.trim().toLowerCase();
        const found = taskStore.find(
          (t) => t.id.toLowerCase() === identifier || t.task.toLowerCase() === identifier
        );

        if (!found) {
          const output = { completed: false, task: null, message: `No matching task found for "${task}".` };
          return {
            content: [{ type: 'text', text: output.message }],
            structuredContent: output
          };
        }

        found.completed = true;
        const output = {
          completed: true,
          task: {
            id: found.id,
            task: found.task,
            priority: found.priority,
            dueDate: found.dueDate,
            completed: found.completed
          },
          message: `Marked "${found.task}" complete.`
        };

        return {
          content: [{ type: 'text', text: output.message }],
          structuredContent: output
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        return {
          content: [
            {
              type: 'text',
              text: `Error completing task: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    }
  );

  return server;
}
