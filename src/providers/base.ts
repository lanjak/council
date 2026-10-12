import type { ProviderConfig, RunControls } from '../types.js';

export interface ChatOptions extends RunControls {
  prompt: string;
  system?: string;
  model: string;
  temperature?: number;
  jsonMode?: boolean;
}

export interface ChatResult {
  content: string;
  reasoning?: string;
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number };
}

export interface AuthResult {
  available: boolean;
  authenticated: boolean;
  detail: string;
}

export interface ProviderCapabilities {
  supportsReasoning: boolean;
  supportsJsonMode: boolean;
}

export abstract class LLMProvider {
  abstract readonly name: string;
  abstract readonly displayName: string;
  abstract readonly capabilities: ProviderCapabilities;

  constructor(protected config: ProviderConfig) {}

  abstract checkAuth(): Promise<AuthResult>;
  abstract chat(options: ChatOptions): Promise<ChatResult>;
}
