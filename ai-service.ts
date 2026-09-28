import type { AskRequest, AskResponse, StructuredAskResponse } from './api.js';

interface AIService {
  answer(request: AskRequest): Promise<AskResponse>;
}

interface ServiceConfig {
  forceDemoMode: boolean;
  bedrockModelId: string;
  awsRegion: string;
}

function createStructuredResponse(question: string, attachmentCount: number): StructuredAskResponse {
  return {
    directAnswer: `Here is a practical answer to your question: "${question}". Start with the smallest step you can complete today, then build momentum with one focused task at a time.`,
    explanation:
      attachmentCount > 0
        ? `I also reviewed ${attachmentCount} attachment${attachmentCount === 1 ? '' : 's'} in demo mode. In production, Bedrock analysis should be used to extract image/document details and tailor this response further.`
        : 'This response is based on your text prompt. In production, Bedrock can enrich this with multimodal analysis.',
    uncertainties: [
      'Demo mode does not perform real OCR, visual analysis, or document parsing.',
      'The final recommendation quality depends on complete context and accurate source files.'
    ],
    recommendedActions: [
      'Define one concrete success outcome for this request.',
      'Break the outcome into 3 executable steps with clear owners.',
      'Schedule the first step today and set a follow-up reminder.',
      'Review progress after completion and adjust the next step.'
    ],
    followUpQuestions: [
      'What deadline matters most for this request?',
      'Which constraint (time, budget, resources) is your biggest blocker?'
    ]
  };
}

class DemoAIService implements AIService {
  async answer(request: AskRequest): Promise<AskResponse> {
    return {
      mode: 'demo',
      badgeLabel: 'Demo Mode',
      response: createStructuredResponse(request.question, request.attachments.length)
    };
  }
}

class BedrockAIService implements AIService {
  constructor(private readonly config: ServiceConfig) {}

  async answer(request: AskRequest): Promise<AskResponse> {
    if (!this.config.awsRegion || !this.config.bedrockModelId) {
      return {
        mode: 'demo',
        badgeLabel: 'Demo Mode',
        response: createStructuredResponse(request.question, request.attachments.length)
      };
    }

    // Placeholder implementation: secure backend boundary is in place.
    // Real Bedrock invocation can be connected here when AWS credentials and model access are configured.
    return {
      mode: 'demo',
      badgeLabel: 'Demo Mode',
      response: createStructuredResponse(request.question, request.attachments.length)
    };
  }
}

function getServiceConfig(): ServiceConfig {
  return {
    forceDemoMode: process.env.LIFEPILOT_DEMO_MODE !== 'false',
    bedrockModelId: process.env.BEDROCK_MODEL_ID?.trim() ?? '',
    awsRegion: process.env.AWS_REGION?.trim() ?? ''
  };
}

export function createAIService(): AIService {
  const config = getServiceConfig();
  if (config.forceDemoMode) {
    return new DemoAIService();
  }

  return new BedrockAIService(config);
}
