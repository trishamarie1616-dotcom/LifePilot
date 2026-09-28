export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const ALLOWED_ATTACHMENT_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);

export interface AskAttachment {
  name: string;
  type: string;
  size: number;
  base64: string;
}

export interface AskRequest {
  question: string;
  attachments: AskAttachment[];
}

export interface StructuredAskResponse {
  directAnswer: string;
  explanation: string;
  uncertainties: string[];
  recommendedActions: string[];
  followUpQuestions: string[];
}

export interface AskResponse {
  mode: 'demo' | 'ai';
  badgeLabel: string;
  response: StructuredAskResponse;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeAskRequest(payload: unknown): AskRequest {
  if (!isRecord(payload)) {
    throw new Error('Request body must be a JSON object.');
  }

  const question = String(payload.question ?? '').trim();
  if (!question) {
    throw new Error('Question is required.');
  }

  const attachmentsRaw = Array.isArray(payload.attachments) ? payload.attachments : [];
  const attachments: AskAttachment[] = attachmentsRaw.map((attachment, index) => {
    if (!isRecord(attachment)) {
      throw new Error(`Attachment #${index + 1} is invalid.`);
    }

    const name = String(attachment.name ?? '').trim();
    const type = String(attachment.type ?? '').trim().toLowerCase();
    const size = Number(attachment.size ?? 0);
    const base64 = String(attachment.base64 ?? '').trim();

    if (!name || !type || !base64 || Number.isNaN(size) || size <= 0) {
      throw new Error(`Attachment #${index + 1} is incomplete.`);
    }

    if (size > MAX_ATTACHMENT_SIZE_BYTES) {
      throw new Error(`Attachment "${name}" exceeds the 10MB limit.`);
    }

    if (!ALLOWED_ATTACHMENT_TYPES.has(type)) {
      throw new Error(`Attachment "${name}" has unsupported type "${type}".`);
    }

    return { name, type, size, base64 };
  });

  return { question, attachments };
}
