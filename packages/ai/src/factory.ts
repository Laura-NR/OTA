import { MockLlmProvider } from './mock';
import type { LlmProvider } from './provider';

export type LlmProviderName = 'mock';

const PROVIDER_NAMES: readonly string[] = ['mock'] satisfies LlmProviderName[];

/**
 * The adapter a setting such as `AI_PROVIDER` selects. Only the mock ships, so
 * an unset or unknown value selects the mock; deployments use this to tell
 * whether the assistant would answer with canned text.
 */
export function llmProviderName(value: string | undefined): LlmProviderName {
  return value !== undefined && PROVIDER_NAMES.includes(value)
    ? (value as LlmProviderName)
    : 'mock';
}

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
