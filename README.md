# LifePilot

LifePilot turns an overwhelming situation into a practical plan, a small next action, and a task list you can follow through on. It includes a browser dashboard and an MCP server for assistant-driven planning and task management.

## What works

- Real server-side OpenAI answers and structured plans.
- In Ask LifePilot, attach JPG, PNG, WebP photos or PDFs for analysis. Up to three files, 5 MB each and 10 MB combined. Attachments are sent to OpenAI only when you submit, kept in memory rather than stored by LifePilot, and can be removed before sending. Export Word documents as PDF first.
- Select individual plan tasks to add to your planner.
- Answer missing-detail questions or revise a plan when your budget, schedule, or circumstances change.
- Revisions include your original goal, previous plan, and completed tasks associated with that plan.
- Completed tasks remain complete when a plan changes; new tasks are added only when you select them.
- Duplicate prevention when adding the same task or saving the same plan again.
- A next-action dashboard and completion progress.
- Browser and MCP task tools share one disk-backed task store.
- Existing browser tasks migrate to the connected server. Pending edits stay in the browser when sync is unavailable and retry on return.
- Responsive layout with keyboard focus states and explicit error messages.

## Run locally or in Codespaces

Requires Node.js 20+ and npm.

```bash
npm ci
npm test
npm run mcp:start
```

Open `http://localhost:3001`. In Codespaces, open port 3001 from the Ports panel and keep its visibility **Private**.

Set `OPENAI_API_KEY` in the **server environment** before starting. For Codespaces, use a GitHub Codespaces secret with repository access; restart the Codespace after changing secrets. Do not put the key in source files, browser scripts, commits, or chat. `OPENAI_MODEL` is optional; the existing default is `gpt-4.1-mini`. OpenAI usage requires available API quota.

No key is required for `npm test`: provider responses are mocked in these deterministic tests. A missing server key causes an explicit AI configuration error rather than a canned plan.

## Demo story

1. Enter: “My car broke down. I have $300 and need to get to work Monday.”
2. Review the plan and the specific questions it asks. Advice is provisional where information is missing; LifePilot does not diagnose a vehicle.
3. Select useful tasks and add them to the planner.
4. Complete a task; watch the next action and progress update.
5. Enter an update such as “My budget is now $100. My commute is five miles.” The plan is revised with its earlier context and completed work.
6. Use MCP `list-tasks` to show the same tasks. Complete a task through MCP, then return to the browser or reload to see the updated progress.
7. Restart the server and show that tasks survive. Saved plans are retained in the same browser.

This is a self-hosted MCP experience intended for the Alexa+ hackathon track. It is not a claim of a live Amazon Alexa+ add-on registration or access to Amazon's gated preview tools. Demo the actual running server and its tools in an MCP-compatible host.

## MCP

Streamable HTTP endpoint: `http://localhost:3001/mcp`.

```bash
npm run mcp:stdio
```

Tools:

- `generate-plan`: `{ request }`; optional `revision: { originalRequest, plan, completedTasks }` to revise an existing plan. Returns `goal`, `context`, `tasks`, `nextSteps`, `followups`, and `informationNeeded`, plus an MCP App resource and text fallback.
- `add-task`: `{ task, priority?, dueDate? }`.
- `list-tasks`: `{}`.
- `complete-task`: `{ task }`, matching an id or exact task text.

The UI resource is `ui://lifepilot/mcp-app.html`, bundled by Vite. `mcp-app.ts` renders the tool's structured plan inside an MCP-compatible host.

## Storage and boundaries

Plans and the current plan are saved in browser localStorage. Tasks persist to `data/tasks.json` by default; set `LIFEPILOT_TASK_FILE` for another writable path. The browser's task cache is kept for recovery. Browser changes sync as additions, changed fields, and deletions so an unrelated MCP task is not replaced. MCP changes become visible when the browser regains focus or reloads.

This is a **single-user local/private demo**, with one task store per server and no account isolation. Do not expose it publicly with an API key until authentication, access controls, usage limits, and user-separated storage are added. Use only one server process for the JSON task file. Hosting with an ephemeral filesystem will need a persistent disk or database.

The AI has no browsing, booking, purchasing, messaging, or reminder tools. It suggests tasks; it does not perform real-world actions. Confirm important advice and current facts independently.

The existing GitHub Pages workflow serves static files only. It cannot run `/api/ask`, `/api/plan`, or task synchronization. Use the Node server for the complete experience.

## Verification

```bash
npm test
```

Compiles TypeScript, builds the MCP App, and tests provider schemas/errors, revision context, and task-store behavior. GitHub Actions also installs Playwright, exercises the browser-to-plan-to-task-to-revision workflow, tests persistence and MCP synchronization, and captures desktop/mobile screenshots as `lifepilot-ui-preview` artifacts. Browser AI responses in that test are mocked, so it does not spend API credits.

To run the browser check locally after installing Playwright and Chromium:

```bash
npm run build
node tests/browser-smoke.mjs
```

## Main files

- `index.html`, `styles.css`, `app.js`: browser dashboard and interaction flow.
- `ai.ts`: provider requests, structured schemas, validation, and contextual revisions.
- `task-store.ts`: shared persistent task storage.
- `main.ts`: HTTP app, AI APIs, task APIs, and MCP transport.
- `server.ts`: MCP tools and UI resource.
- `mcp-app.ts`, `mcp-app.html`: MCP App interface.
- `tests/`: deterministic contract tests and browser integration check.

## License

MIT. See `LICENSE`.
