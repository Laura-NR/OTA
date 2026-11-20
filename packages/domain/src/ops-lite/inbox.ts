/** AL-Inbox's filters: the board's four, plus Unread, which the desk already uses. */
export const INBOX_FILTERS = ['all', 'urgent', 'unread', 'travelers', 'workers'] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number];

/** A traveler's thread (one per booking) or a worker's (one per worker, M2). */
export type InboxThreadKind = 'traveler' | 'worker';

export interface InboxThreadInput {
  kind: InboxThreadKind;
  /** Who wrote the thread's latest message. */
  lastSender: 'TRAVELER' | 'WORKER' | 'OPERATIONS';
  lastAt: Date;
  /** The traveler's or the worker's messages nobody on the desk has opened yet. */
  unread: number;
  /** A traveler's booking is on an open disruption case. */
  openDisruption: boolean;
  /** A worker's latest message is about a job that runs today (`jobRunsToday`). */
  jobToday: boolean;
}

/** The traveler or the worker wrote last, so the desk owes a reply. */
export function awaitsReply(thread: Pick<InboxThreadInput, 'lastSender'>): boolean {
  return thread.lastSender !== 'OPERATIONS';
}

/**
 * Urgent on AL-Inbox: a traveler waits for a reply while their booking is on
 * an open disruption case ("Urgent because a disruption case is open on this
 * booking"), or a worker waits for one about a job that runs today (M6).
 */
export function isUrgentThread(thread: InboxThreadInput): boolean {
  const pressing = thread.kind === 'worker' ? thread.jobToday : thread.openDisruption;
  return pressing && awaitsReply(thread);
}

export function matchesInboxFilter(
  thread: InboxThreadInput,
  filter: InboxFilter,
): boolean {
  switch (filter) {
    case 'urgent':
      return isUrgentThread(thread);
    case 'unread':
      return thread.unread > 0;
    case 'travelers':
      return thread.kind === 'traveler';
    case 'workers':
      return thread.kind === 'worker';
    default:
      return true;
  }
}

/** AL-Inbox's order, urgent first: urgent, then unread, then the latest message first. */
export function compareInboxThreads(a: InboxThreadInput, b: InboxThreadInput): number {
  const rank = (thread: InboxThreadInput) =>
    isUrgentThread(thread) ? 0 : thread.unread > 0 ? 1 : 2;
  return rank(a) - rank(b) || b.lastAt.getTime() - a.lastAt.getTime();
}
