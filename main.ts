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
import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { createServer } from './server.js';

const CURRENT_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.basename(CURRENT_DIR) === 'dist' ? path.resolve(CURRENT_DIR, '..') : CURRENT_DIR;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_TOTAL_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const STANDALONE_ASSET_PATHS = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/app.js', 'app.js'],
  ['/styles.css', 'styles.css']
]);
const SUPPORTED_ATTACHMENT_TYPES = new Map([
  ['image/jpeg', { kind: 'image', format: 'jpeg' }],
  ['image/png', { kind: 'image', format: 'png' }],
  ['image/webp', { kind: 'image', format: 'webp' }],
  ['application/pdf', { kind: 'document', format: 'pdf' }],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', { kind: 'document', format: 'docx' }]
]);

const askRequestSchema = z.object({
  question: z.string().trim().min(1).max(1000),
  attachments: z.array(z.object({
    name: z.string().trim().min(1).max(120),
    type: z.string().trim().min(1),
    size: z.number().int().nonnegative(),
    base64: z.string().trim().min(1)
  })).default([])
});

type AskRequest = z.infer<typeof askRequestSchema>;
type SupportedAttachmentType = NonNullable<ReturnType<typeof SUPPORTED_ATTACHMENT_TYPES.get>>;
type PreparedAttachment = AskRequest['attachments'][number] & {
  bytes: Uint8Array<ArrayBuffer>;
  supportedType: SupportedAttachmentType;
};

type AssistantResponsePayload = {
  mode: 'ai' | 'demo';
  answer: string;
  explanation: string;
  uncertainties: string[];
  actions: string[];
  followUpQuestions: string[];
};

function sanitizeAttachmentName(name: string): string {
  const sanitized = path.basename(name).replace(/[^\w.\- ]+/g, '_').slice(0, 80).trim();
  return sanitized || 'attachment';
}

function decodeBase64Attachment(base64: string): Uint8Array | null {
  const normalized = base64.replace(/\s+/g, '');

  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    return null;
  }

  const decoded = Buffer.from(normalized, 'base64');
  if (decoded.toString('base64') !== normalized) {
    return null;
  }

  return Uint8Array.from(decoded);
}

function hasBedrockConfiguration(): boolean {
  return Boolean(process.env.AWS_REGION && process.env.BEDROCK_MODEL_ID);
}

function prepareAttachments(attachments: AskRequest['attachments']): { attachments: PreparedAttachment[]; error?: string } {
  const preparedAttachments: PreparedAttachment[] = [];
  let totalSize = 0;

  for (const attachment of attachments) {
    const supportedType = SUPPORTED_ATTACHMENT_TYPES.get(attachment.type);
    if (!supportedType) {
      return {
        attachments: [],
        error: `Unsupported file type: ${attachment.name}. Supported files are JPG, PNG, WEBP, PDF, and DOCX.`
      };
    }

    const bytes = decodeBase64Attachment(attachment.base64);
    if (!bytes) {
      return {
        attachments: [],
        error: `${attachment.name} contained invalid file data. Please re-upload the file and try again.`
      };
    }

    if (bytes.byteLength > MAX_ATTACHMENT_SIZE) {
      return {
        attachments: [],
        error: `${attachment.name} exceeds the 10MB file limit.`
      };
    }

    if (attachment.size !== bytes.byteLength) {
      return {
        attachments: [],
        error: `${attachment.name} could not be verified because the uploaded file size did not match the payload.`
      };
    }

    totalSize += bytes.byteLength;
    if (totalSize > MAX_TOTAL_ATTACHMENT_SIZE) {
      return {
        attachments: [],
        error: 'Attachments exceed the 20MB total limit.'
      };
    }

    preparedAttachments.push({
      ...attachment,
      bytes,
      supportedType
    });
  }

  return { attachments: preparedAttachments };
}

function createDemoResponse(question: string, attachments: Array<{ name: string }>, reason?: string): AssistantResponsePayload {
  const attachmentNames = attachments.map((attachment) => attachment.name).join(', ');
  const reasonText = reason ? ` ${reason}` : '';

  return {
    mode: 'demo',
    answer: attachmentNames
      ? `Demo Mode is active, so I could not run a live Bedrock analysis on ${attachmentNames}.${reasonText} Based on your question, start by identifying the most important facts in those files and the outcome you want next.`
      : `Demo Mode is active, so I could not run a live Bedrock analysis.${reasonText} I can still provide a structured prototype response for your question.`,
    explanation: `Question received: "${question}". This fallback keeps the AI Assistant, upload flow, and Add to My Planner experience testable without exposing AWS credentials in the frontend.`,
    uncertainties: [
      attachmentNames ? 'Uploaded files were not inspected by a live model in demo mode.' : 'No live model was available to verify the answer.',
      'Enable AWS_REGION and BEDROCK_MODEL_ID with valid Bedrock credentials to switch from demo mode to AI-powered responses.'
    ],
    actions: [
      'Write down the exact result you need from this question.',
      attachmentNames ? 'Review the uploaded files and highlight the details that matter most.' : 'Gather any screenshots, PDFs, or notes that would help answer the question.',
      'Turn the first concrete next step into a planner task.'
    ],
    followUpQuestions: [
      'What would a successful outcome look like for you?',
      'Is there a deadline or urgent blocker involved?'
    ]
  };
}

function extractJsonObject(rawText: string): string {
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  return firstBrace >= 0 && lastBrace > firstBrace ? rawText.slice(firstBrace, lastBrace + 1) : rawText;
}

function normalizeAssistantResponse(payload: unknown, mode: AssistantResponsePayload['mode']): AssistantResponsePayload {
  const data = typeof payload === 'object' && payload ? payload as Record<string, unknown> : {};

  const normalizeList = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

  return {
    mode,
    answer: String(data.answer || '').trim() || 'No answer was returned.',
    explanation: String(data.explanation || '').trim() || 'No explanation was returned.',
    uncertainties: normalizeList(data.uncertainties),
    actions: normalizeList(data.actions),
    followUpQuestions: normalizeList(data.followUpQuestions)
  };
}

async function askBedrock(question: string, attachments: PreparedAttachment[]): Promise<AssistantResponsePayload> {
  if (!hasBedrockConfiguration()) {
    return createDemoResponse(question, attachments, 'Missing AWS configuration for Bedrock.');
  }

  const client = new BedrockRuntimeClient({
    region: process.env.AWS_REGION
  });

  const attachmentSummary = attachments.length
    ? attachments.map((attachment) => `- ${attachment.name} (${attachment.type}, ${Math.round(attachment.size / 1024)} KB)`).join('\n')
    : 'No attachments provided.';

  const contentBlocks: unknown[] = [
    {
      text: [
        'Question:',
        question,
        '',
        'Attachments:',
        attachmentSummary,
        '',
        'Return valid JSON only with these keys: answer, explanation, uncertainties, actions, followUpQuestions.',
        'Keep uncertainties and followUpQuestions as arrays, and make actions concrete enough to add to a planner.'
      ].join('\n')
    }
  ];

  for (const attachment of attachments) {
    if (attachment.supportedType.kind === 'image') {
      contentBlocks.push({
        image: {
          format: attachment.supportedType.format,
          source: { bytes: attachment.bytes }
        }
      });
    } else {
      contentBlocks.push({
        document: {
          format: attachment.supportedType.format,
          name: sanitizeAttachmentName(attachment.name),
          source: { bytes: attachment.bytes }
        }
      });
    }
  }

  try {
    const response = await client.send(
      new ConverseCommand({
        modelId: process.env.BEDROCK_MODEL_ID,
        system: [
          {
            text: [
              'You are LifePilot, a practical AI assistant.',
              'Answer the user question directly before suggesting actions.',
              'Use the attachments if they are relevant.',
              'Return valid JSON only with keys: answer, explanation, uncertainties, actions, followUpQuestions.',
              'uncertainties, actions, and followUpQuestions must be arrays of strings.'
            ].join(' ')
          }
        ],
        messages: [
          {
            role: 'user',
            content: contentBlocks as never
          }
        ],
        inferenceConfig: {
          temperature: 0.3,
          maxTokens: 900
        }
      })
    );

    const textResponse = (response.output?.message?.content || [])
      .map((item) => item.text || '')
      .join('\n')
      .trim();

    const parsed = JSON.parse(extractJsonObject(textResponse));
    return normalizeAssistantResponse(parsed, 'ai');
  } catch (error) {
    console.error('Bedrock request failed:', error);
    return createDemoResponse(question, attachments, 'The Bedrock request failed, so a clearly labeled fallback response was used.');
  }
}

/**
 * Start Streamable HTTP transport server (stateless, per-request)
 * This is the recommended transport for MCP hosts and hackathon use.
 */
async function startStreamableHTTPServer(createServerFn: () => McpServer): Promise<void> {
  const port = parseInt(process.env.PORT ?? '3001', 10);

  const app = createMcpExpressApp({ host: '0.0.0.0' });
  app.use(cors());
  app.use(express.json({ limit: '32mb' }));

  app.post('/api/ask', async (req: Request, res: Response) => {
    const parsed = askRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request payload. Provide a question and optional attachments.'
      });
      return;
    }

    const prepared = prepareAttachments(parsed.data.attachments);
    if (prepared.error) {
      res.status(400).json({ error: prepared.error });
      return;
    }

    const response = await askBedrock(parsed.data.question, prepared.attachments);
    res.json(response);
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

  for (const [routePath, fileName] of STANDALONE_ASSET_PATHS.entries()) {
    app.get(routePath, (_req: Request, res: Response) => {
      res.sendFile(path.join(APP_ROOT, fileName));
    });
  }

  app.use((error: Error & { type?: string }, req: Request, res: Response, next: (error?: Error) => void) => {
    if (error.type === 'entity.too.large') {
      const message = 'Attachments exceed the maximum supported upload size.';
      if (req.path.startsWith('/api/')) {
        res.status(413).json({ error: message });
      } else {
        res.status(413).send(message);
      }
      return;
    }

    next(error);
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
