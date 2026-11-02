import type { ProviderConfig, RunControls } from '../types.js';

export interface ChatOptions extends RunControls {
  prompt: string;
  system?: string;
  model: string;
  temperature?: number;
  jsonMode?: boolean;
  /** W3C traceparent sent to the gateway so its span joins the caller trace. */
  traceparent?: string;
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

export interface ModelInfo {
  id: string;
  /** Input context window in tokens, when the endpoint reports one. */
  context?: number;
}

// Listing is a quick metadata call; never let a dead gateway hang `council models`.
export const LIST_MODELS_TIMEOUT_MS = 15_000;

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
  /** Models the endpoint offers to this key. */
  abstract listModels(): Promise<ModelInfo[]>;
}
