export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** The parsed error body, when a caller needs structured detail. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Pull a human-readable message out of a NestJS error payload. */
export function messageFromBody(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
  }
  return fallback;
}
