/**
 * MCP Server: LifePilot Planning Engine
 * 
 * This server exposes the LifePilot planning logic as an MCP tool and UI resource.
 * Real AI planning is shared with the web API through ai.ts.
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
import { generatePlan, planSchema } from './ai.js';

// Determine dist directory (works from both source .ts and compiled .js)
const SERVER_FILE = fileURLToPath(import.meta.url);
const DIST_DIR = SERVER_FILE.endsWith('.ts')
  ? path.join(path.dirname(SERVER_FILE), 'dist')
  : path.dirname(SERVER_FILE);

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
        request: z.string().trim().min(1).max(1000).describe('The user request or goal to plan for')
      }),
      outputSchema: planSchema,
      _meta: { ui: { resourceUri } } // Link tool to UI resource
    },
    async ({ request }): Promise<CallToolResult> => {
      try {
        const plan = await generatePlan(request);

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
