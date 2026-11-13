/** A message catalog: nested objects whose leaves are strings (or raw content). */
export type MessageTree = { [key: string]: unknown };

function isTree(value: unknown): value is MessageTree {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge message catalogs, later ones winning. Objects merge key by key;
 * anything else (a string, an array of content items) replaces what was there.
 * A tenant uses it to override core copy and to add its own `content`.
 */
export function mergeMessages<T extends MessageTree>(
  base: T,
  ...overrides: MessageTree[]
): T {
  const result: MessageTree = { ...base };
  for (const override of overrides) {
    for (const [key, value] of Object.entries(override)) {
      const current = result[key];
      result[key] =
        isTree(current) && isTree(value) ? mergeMessages(current, value) : value;
    }
  }
  return result as T;
}
