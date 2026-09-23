import { MockLlmProvider } from './mock';
import type { LlmProvider } from './provider';

export type LlmProviderName = 'mock';

export interface LlmProviderOptions {
  /** Which adapter to build. Only the mock ships until a vendor is approved. */
  provider?: LlmProviderName;
}

/**
 * Build the AI assistant adapter for a deployment. A real LLM vendor is added
 * here once selected and cleared under Article 2; core code depends on the
 * `LlmProvider` interface only.
 */
export function createLlmProvider(options: LlmProviderOptions = {}): LlmProvider {
  void options;
  return new MockLlmProvider();
}
