/**
 * Injection token for the AI assistant adapter. Keep it in its own file:
 * importing it from the module into the service can create a circular import
 * that resolves the token to `undefined` (same trap as PAYMENT_PROVIDERS).
 */
export const LLM_PROVIDER = 'ota:llm-provider';
