/**
 * MCP Server Entry Point: LifePilot
 *
 * Supports two transports:
 * 1. Streamable HTTP (default) - for MCP hosts and Alexa+ integration
 * 2. stdio (--stdio flag) - for local development and Claude Desktop
 *
 * Usage:
 *   node dist/main.js               # Start Streamable HTTP on :3001
 *   node dist/main.js --stdio       # Connect via stdio
 *   PORT=3000 node dist/main.js     # Custom port
 */

import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createMcpExpressApp } from '@modelcontextprotocol/express';
import type { McpServer } from '@modelcontextprotocol/server';
import { NodeStreamableHTTPServerTransport } from '@modelcontextprotocol/node';
import cors from 'cors';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.js';
import { AIError, answerQuestion, generatePlan } from './ai.js';
import { taskStore, syncTaskChanges, taskChangesSchema } from './task-store.js';

/**
 * Start Streamable HTTP transport server (stateless, per-request)
 * This is the recommended transport for MCP hosts and hackathon use.
 */
async function startStreamableHTTPServer(createServerFn: () => McpServer): Promise<void> {
  const port = parseInt(process.env.PORT ?? '3001', 10);

  const app = createMcpExpressApp({ host: '0.0.0.0' });
  app.use(cors());

  const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  app.get('/', (_req: Request, res: Response) => res.sendFile(path.join(appRoot, 'index.html')));
  app.get('/index.html', (_req: Request, res: Response) => res.sendFile(path.join(appRoot, 'index.html')));
  app.get('/app.js', (_req: Request, res: Response) => res.sendFile(path.join(appRoot, 'app.js')));
  app.get('/styles.css', (_req: Request, res: Response) => res.sendFile(path.join(appRoot, 'styles.css')));

  for (const [route, field, generate] of [
    ['/api/ask', 'question', answerQuestion],
    ['/api/plan', 'request', generatePlan]
  ] as const) {
    app.post(route, express.json({ limit: '32kb' }), async (req: Request, res: Response) => {
      try {
        res.json(route === '/api/plan'
          ? await generatePlan(req.body?.request, req.body?.revision)
          : await generate(req.body?.[field]));
      } catch (error) {
        const failure = error instanceof AIError
          ? error : new AIError(502, 'The AI provider could not complete the request. Try again.');
        res.status(failure.status).json({ error: failure.message });
      }
    });
  }

  app.get('/api/tasks', (_req: Request, res: Response) => res.json({ tasks: taskStore }));
  app.post('/api/tasks/sync', express.json({ limit: '1mb' }), (req: Request, res: Response) => {
    if (!taskChangesSchema.safeParse(req.body).success) {
      res.status(400).json({ error: 'Invalid task changes.' }); return;
    }
    try { res.json({ tasks: syncTaskChanges(req.body) }); }
    catch { res.status(500).json({ error: 'Could not save tasks on the server. Your browser copy is kept.' }); }
  });

  // MCP endpoint: POST /mcp
  app.all('/mcp', async (req: Request, res: Response) => {
    const server = createServerFn();
    const transport = new NodeStreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on('close', () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('MCP error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null
        });
      }
    }
  });

  const httpServer = app.listen(port, (err) => {
    if (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
    console.log(`LifePilot MCP server listening on http://localhost:${port}/mcp`);
    console.log(`POST requests to /mcp will receive Streamable HTTP responses`);
  });

  const shutdown = () => {
    console.log('\nShutting down...');
    httpServer.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

/**
 * Start stdio transport server (for local development and Claude Desktop)
 */
async function startStdioServer(createServerFn: () => McpServer): Promise<void> {
  const server = createServerFn();
  await server.connect(new StdioServerTransport());
  console.log('LifePilot MCP server connected via stdio');
}

async function main(): Promise<void> {
  if (process.argv.includes('--stdio')) {
    await startStdioServer(createServer);
  } else {
    await startStreamableHTTPServer(createServer);
  }
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
