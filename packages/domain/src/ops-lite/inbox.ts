/** AL-Inbox's filters. Worker threads do not exist yet, so there is no Workers filter. */
export const INBOX_FILTERS = ['all', 'urgent', 'unread'] as const;

export type InboxFilter = (typeof INBOX_FILTERS)[number];

export interface InboxThreadInput {
  /** Who wrote the thread's latest message. */
  lastSender: 'TRAVELER' | 'OPERATIONS';
  lastAt: Date;
  /** The traveler's messages nobody on the desk has opened yet. */
  unread: number;
  /** The booking is on an open disruption case. */
  openDisruption: boolean;
}

/** The traveler wrote last, so the desk owes a reply. */
export function awaitsReply(thread: Pick<InboxThreadInput, 'lastSender'>): boolean {
  return thread.lastSender === 'TRAVELER';
}

/**
 * Urgent on AL-Inbox: the traveler waits for a reply while their booking is
 * on an open disruption case ("Urgent because a disruption case is open on
 * this booking").
 */
export function isUrgentThread(thread: InboxThreadInput): boolean {
  return thread.openDisruption && awaitsReply(thread);
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
