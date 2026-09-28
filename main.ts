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
import { createAIService } from './ai-service.js';
import { getFrontendApiBaseFromEnv, normalizeAskRequest } from './api.js';
import { createServer } from './server.js';

/**
 * Start Streamable HTTP transport server (stateless, per-request)
 * This is the recommended transport for MCP hosts and hackathon use.
 */
async function startStreamableHTTPServer(createServerFn: () => McpServer): Promise<void> {
  const port = parseInt(process.env.PORT ?? '3001', 10);
  const aiService = createAIService();
  const frontendApiBase = getFrontendApiBaseFromEnv();

  const app = createMcpExpressApp({ host: '0.0.0.0' });
  app.use(express.json({ limit: '12mb' }));
  app.use(cors());

  app.get('/api/config', (_req: Request, res: Response) => {
    res.json({
      apiBaseUrl: frontendApiBase
    });
  });

  app.post('/api/ask', async (req: Request, res: Response) => {
    try {
      const askRequest = normalizeAskRequest(req.body);
      const result = await aiService.answer(askRequest);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(400).json({
        message
      });
    }
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
