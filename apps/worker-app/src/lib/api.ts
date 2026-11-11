import type { WorkerAnswer } from '@ota/domain';
import type {
  SetWorkerDaysRequest,
  WorkerCalendarDto,
  WorkerDaysResultDto,
  WorkerEarningsDto,
  WorkerFuelDto,
  WorkerHomeDto,
} from '@ota/schemas';

/** A refused request; `status` is null when no response came back at all. */
export class ApiError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
  ) {
    super(message);
  }
}

/** The API calls the worker app makes (`docs/worker-app-plan.md` W1, W3, W5, §8). */
export interface WorkerApi {
  sendCode(phone: string): Promise<void>;
  signIn(phone: string, code: string): Promise<{ token: string; expiresAt: string }>;
  home(token: string): Promise<WorkerHomeDto>;
  /** The HTTP status of an accept or decline, or null with no connection. */
  answer(token: string, answer: WorkerAnswer): Promise<number | null>;
  signOut(token: string): Promise<void>;
  /** W-Calendar: a `YYYY-MM` month, or the current one in Havana. */
  calendar(token: string, month?: string): Promise<WorkerCalendarDto>;
  setDays(token: string, change: SetWorkerDaysRequest): Promise<WorkerDaysResultDto>;
  declareFuel(token: string, litres: number): Promise<WorkerFuelDto>;
  /** W-Earnings: reliability, payouts and the latest finished jobs. */
  earnings(token: string): Promise<WorkerEarningsDto>;
}

export function createWorkerApi(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
): WorkerApi {
  async function request(
    path: string,
    init: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<Response> {
    let response: Response;
    try {
      response = await fetcher(`${baseUrl}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          accept: 'application/json',
          ...(init.body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw new ApiError(null, 'No connection');
    }
    if (!response.ok) {
      const detail = (await response.json().catch(() => null)) as {
        message?: unknown;
      } | null;
      throw new ApiError(
        response.status,
        typeof detail?.message === 'string' ? detail.message : response.statusText,
      );
    }
    return response;
  }

  return {
    async sendCode(phone) {
      await request('/api/auth/sign-in/worker-code/send', {
        method: 'POST',
        body: { phone },
      });
    },
    async signIn(phone, code) {
      const response = await request('/api/auth/sign-in/worker-code', {
        method: 'POST',
        body: { phone, code },
      });
      return (await response.json()) as { token: string; expiresAt: string };
    },
    async home(token) {
      return (await (await request('/worker/home', { token })).json()) as WorkerHomeDto;
    },
    async answer(token, answer) {
      try {
        const response = await request(
          `/service-items/${answer.serviceItemId}/${answer.kind}`,
          {
            method: 'POST',
            token,
            body: answer.kind === 'decline' ? { reason: answer.reason } : {},
          },
        );
        return response.status;
      } catch (error) {
        return error instanceof ApiError ? error.status : null;
      }
    },
    async signOut(token) {
      await request('/worker/sign-out', { method: 'POST', token });
    },
    async calendar(token, month) {
      const query = month ? `?month=${month}` : '';
      return (await (
        await request(`/worker/calendar${query}`, { token })
      ).json()) as WorkerCalendarDto;
    },
    async setDays(token, change) {
      return (await (
        await request('/worker/availability', { method: 'PUT', token, body: change })
      ).json()) as WorkerDaysResultDto;
    },
    async declareFuel(token, litres) {
      return (await (
        await request('/worker/fuel', { method: 'PUT', token, body: { litres } })
      ).json()) as WorkerFuelDto;
    },
    async earnings(token) {
      return (await (
        await request('/worker/earnings', { token })
      ).json()) as WorkerEarningsDto;
    },
  };
}
