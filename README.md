# LifePilot

**LifePilot** turns messy requests into structured, actionable plans. It breaks down overwhelming goals into clear tasks, next steps, and follow-ups.

## Overview

LifePilot consists of three integrated components:

1. **Standalone Web App** – A static GitHub Pages application with localStorage
2. **AI Assistant Backend** – Optional secure Bedrock-backed `/api/ask` endpoint with demo fallback
3. **MCP Server** – Exposes LifePilot planning as an MCP tool with Streamable HTTP support
4. **MCP App UI** – An interactive UI resource that renders plans in MCP-compatible hosts

## Standalone Web App

The original LifePilot application runs as a static web app on GitHub Pages. No backend required.

**Usage:**
- Open `index.html` in a browser
- Enter a request (e.g., "My 2014 Nissan Sentra keeps going into limp mode and I'm getting code P0965")
- Click "Generate Plan" or press Ctrl+Enter
- Plans are saved to browser localStorage

**Features:**
- Four-tab dashboard: My Planner, Documents, My Goals, AI Assistant
- Vehicle repair scenario detection and planning
- Job search planning
- Medical appointment preparation
- Travel planning
- General goal breakdown
- Plan persistence via localStorage
- Ask LifePilot assistant with JPG/PNG/WEBP/PDF/DOCX uploads
- Demo mode fallback when Bedrock is unavailable

**Files:**
- `index.html` – Main page (GitHub Pages compatible)
- `app.js` – Planning engine (RequestAnalyzer, MockAIGenerator, UI handlers)
- `styles.css` – Styling

## MCP Apps Integration

LifePilot is also available as an MCP App, allowing integration with MCP-compatible hosts (Claude Desktop, Cursor, Cline, and future Alexa+ integration).

### MCP Server

The server exposes the planning engine via the **Model Context Protocol** using Streamable HTTP transport (recommended for hackathons and MCP hosts).

**MCP Tool:** `generate-plan`
- **Input:** `{ request: string }`
- **Output:** `{ goal, context, tasks, nextSteps, followups, informationNeeded }`
- **UI Resource:** `ui://lifepilot/mcp-app.html` (bundled with MCP App SDK)

**Features:**
- Stateless Streamable HTTP transport (per-request architecture)
- Optional stdio transport for local Claude Desktop testing
- Text fallback for non-UI clients
- Structured content for MCP App UI rendering
- CORS-enabled (safe for cross-origin integration)

### MCP App UI

When invoked through an MCP host that supports MCP Apps, the tool automatically renders an interactive UI displaying:
- Goal and context
- Task list
- Next steps
- Follow-ups
- Information needed

The UI uses the official MCP Apps SDK (`@modelcontextprotocol/ext-apps`) with PostMessageTransport for secure iframe communication.

## Getting Started

### Prerequisites
- Node.js 20+
- npm or similar package manager

### Install Dependencies

```bash
npm install
```

### Build MCP Server

```bash
npm run build
```

This produces:
- `dist/server.js` – Compiled MCP server
- `dist/main.js` – Compiled server entry point
- `dist/mcp-app.html` – Bundled MCP App UI (single HTML file with CSS and JS)

### Run MCP Server

#### Streamable HTTP (default, hackathon-ready)

```bash
npm run mcp:start
```

Starts the server on `http://localhost:3001/mcp` using Streamable HTTP transport. This is the recommended mode for MCP hosts.

The same server also serves the standalone web app and the AI Assistant endpoint at:

- `http://localhost:3001/`
- `POST http://localhost:3001/api/ask`

**Custom port:**
```bash
PORT=3000 npm run mcp:start
```

#### stdio (local development, Claude Desktop)

```bash
npm run mcp:stdio
```

Connects via stdio. Useful for testing with Claude Desktop locally.

#### Development with Hot Reload

```bash
npm run mcp:dev
```

Rebuilds and restarts the server on file changes (requires `NODE_ENV=development`).

## MCP Configuration

### For Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lifepilot": {
      "command": "node",
      "args": ["/path/to/LifePilot/dist/main.js", "--stdio"]
    }
  }
}
```

### For Other MCP Hosts (HTTP)

Use the Streamable HTTP endpoint:

```
POST http://localhost:3001/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "generate-plan",
    "arguments": {
      "request": "I need to find a new job but I'm overwhelmed and don't know where to start."
    }
  }
}
```

## Example Requests

### Vehicle Repair (Nissan P0965)
```
My 2014 Nissan Sentra keeps going into limp mode and I'm getting code P0965.
```

**Plan includes:**
- Diagnostics and code analysis
- What to check before visiting a mechanic
- What to ask the repair shop
- Preventive follow-ups

### Job Search
```
I need to find a new job but I'm overwhelmed and don't know where to start.
```

**Plan includes:**
- Target role selection
- Resume and LinkedIn updates
- Application strategy
- Interview prep follow-ups

### Other Scenarios
- Medical appointment preparation
- Travel planning
- General goal breakdown

## Architecture

### Shared Planning Engine

The core planning logic (`RequestAnalyzer`, `MockAIGenerator`) is implemented in:
- `app.js` – Used by the standalone web app
- `server.ts` – Replicated for MCP server (same logic, no dependencies)

Both implementations produce identical plans from the same request.

### MCP App Communication

The MCP App UI communicates with the MCP host via:
- **PostMessageTransport** – Secure iframe-to-parent communication using `window.postMessage`
- **structuredContent** – Typed plan data (JSON) for UI rendering
- **text fallback** – Plain text rendering for non-UI MCP clients

## What's Implemented

✅ Standalone GitHub Pages web app
✅ MCP server with `generate-plan` tool
✅ MCP App UI resource (bundled HTML + PostMessageTransport)
✅ Streamable HTTP transport (hackathon-ready)
✅ stdio transport (local development)
✅ Vehicle repair scenario (Nissan P0965 test case)
✅ Job search scenario
✅ Medical appointment scenario
✅ Travel planning scenario
✅ Structured content + text fallback
✅ CORS support
✅ TypeScript compilation
✅ Vite bundling (UI as single HTML file)
✅ Four-tab dashboard with AI Assistant
✅ Secure backend interface for Bedrock with demo mode fallback
✅ Attachment validation for JPG/PNG/WEBP/PDF/DOCX uploads
✅ Add AI-recommended actions to My Planner

## What's NOT Implemented Yet

❌ Alexa+ skill (standalone)
❌ Persistent database for saved plans (MCP version)
❌ Voice input/output
❌ Multi-turn conversation in MCP context

## AWS Bedrock Configuration

To enable live AI responses instead of demo mode, set:

```bash
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=anthropic.claude-3-5-sonnet-20241022-v2:0
```

You also need valid AWS credentials through the normal AWS SDK credential chain (environment variables, profile, or attached role). No AWS secrets are exposed in the frontend.

## Dependencies

**Runtime:**
- `@modelcontextprotocol/client`: 2.0.0
- `@modelcontextprotocol/express`: 2.0.0
- `@modelcontextprotocol/ext-apps`: ^2.0.0
- `@modelcontextprotocol/node`: 2.0.0
- `@modelcontextprotocol/server`: 2.0.0
- `cors`: ^2.8.5
- `express`: ^5.1.0
- `zod`: ^4.2.0

**Development:**
- `typescript`: ^5.9.3
- `vite`: ^6.0.0
- `vite-plugin-singlefile`: ^2.3.0

## File Structure

```
LifePilot/
├── index.html                # Standalone web app page
├── app.js                    # Planning engine + web app UI (GitHub Pages)
├── styles.css                # Styling
├── server.ts                 # MCP server (tool + resource registration)
├── main.ts                   # Server entry point (Streamable HTTP + stdio)
├── mcp-app.html              # MCP App UI (HTML template)
├── mcp-app.ts                # MCP App client-side (PostMessageTransport)
├── package.json              # Dependencies + build scripts
├── tsconfig.json             # TypeScript config for UI
├── tsconfig.server.json      # TypeScript config for server
├── vite.config.ts            # Vite config (bundle UI into single HTML)
├── .gitignore
├── LICENSE                   # MIT
└── README.md                 # This file
```

## Deployment

### GitHub Pages (Standalone App)

The standalone app is deployable as-is to GitHub Pages:

```bash
git push origin main
```

Then enable GitHub Pages in repository settings. The app will be available at `https://username.github.io/LifePilot/`.

**Note:** The GitHub Pages version does NOT require Node.js or the MCP server to function.

### MCP Server (Streamable HTTP)

Deploy the MCP server to a Node.js host (Heroku, Railway, AWS Lambda, etc.):

```bash
npm install
npm run build
PORT=3000 npm run mcp:start
```

Then configure MCP hosts to use `http://<your-server>/mcp` as the Streamable HTTP endpoint.

## Testing

### Test Nissan P0965 (Vehicle Repair)

1. Standalone app:
   - Open `index.html` in browser
   - Paste: "My 2014 Nissan Sentra keeps going into limp mode and I'm getting code P0965."
   - Verify plan includes diagnostic code P0965 and limp mode context

2. MCP server (HTTP):
   ```bash
   npm run build
   npm run mcp:start
   
   # In another terminal:
   curl -X POST http://localhost:3001/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"generate-plan","arguments":{"request":"My 2014 Nissan Sentra keeps going into limp mode and I'\''m getting code P0965."}}}'
   ```
   Verify response includes structured content with vehicle details and code

### Test Job Search (Overwhelm Scenario)

1. Standalone app:
   - Paste: "I need to find a new job but I'm overwhelmed and don't know where to start."
   - Verify plan includes immediate actionable steps

2. MCP server:
   - Use same test as above, substituting the job search request

## License

MIT

## Future Integration Points

- **AWS Bedrock:** Replace `MockAIGenerator.generate()` with real AI model calls
- **Alexa+ Skill:** Register LifePilot as a native Alexa skill
- **Multi-turn Conversation:** Support follow-up refinements within MCP context
- **Database:** Persistent plan storage (instead of localStorage)
- **Voice Input/Output:** Alexa voice integration for verbal planning

---

**Built for the Amazon Alexa+ Hackathon**

LifePilot demonstrates MCP Apps integration with Streamable HTTP transport, providing a portable planning engine across multiple platforms.
