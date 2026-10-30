import { createTraceId, tracedChat } from './telemetry.js';
import { loadProvider } from './providers/index.js';
import { parseHardBlocks } from './blocks.js';
import type { CouncilConfig } from './config.js';
import type { CouncilRequest, JudgeResult } from './types.js';

export async function runCouncil(config: CouncilConfig, request: CouncilRequest, traceId = createTraceId()): Promise<JudgeResult[]> {
  const promises = request.models.map(async (providerKey): Promise<JudgeResult> => {
    const providerConfig = config.providers[providerKey];

    if (!providerConfig) {
      return {
        provider: providerKey,
        model: 'unknown',
        status: 'skipped',
        error: { message: `No configuration for provider "${providerKey}"` },
      };
    }

    if (!providerConfig.model) {
      return {
        provider: providerKey,
        model: 'unknown',
        status: 'skipped',
        error: { message: `No model configured for provider "${providerKey}"` },
      };
    }

    if (!providerConfig.apiKey) {
      return {
        provider: providerKey,
        model: providerConfig.model,
        status: 'skipped',
        error: { message: `API key not set for ${providerKey}` },
      };
    }

    const provider = loadProvider(providerKey, providerConfig);

    try {
      const result = await tracedChat(provider, 'judge', {
        prompt: request.prompt,
        system: request.systemPrompt,
        maxTokens: request.maxTokens,
        effort: request.effort,
        model: providerConfig.model,
      }, traceId);

      return {
        provider: providerKey,
        model: providerConfig.model,
        status: 'success',
        response: result.content,
        reasoning: result.reasoning,
        usage: result.usage,
        ...(request.blockKey ? { blockParse: parseHardBlocks(result.content, request.blockKey) } : {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        provider: providerKey,
        model: providerConfig.model,
        status: 'error',
        error: { message },
      };
    }
  });

  return Promise.all(promises);
}
