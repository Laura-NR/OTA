/**
 * Provider-agnostic AI assistant adapter (spec §4.8). Concrete LLM vendors are
 * added behind this interface once one is selected; core code never imports a
 * vendor SDK directly. The mock ships first so the drafting, summarising, and
 * translation surfaces can be built and tested without an external dependency
 * or API key.
 */

export interface DraftReplyInput {
  bookingCode: string;
  /** Traveler's locale (es/en/fr); the mock only understands those. */
  locale: string;
  status: string;
  travelerName: string | null;
  serviceSummary: string[];
  /** The most recent message in the thread, when there is one. */
  latestMessage: string | null;
}

export interface DraftReplyResult {
  subject: string;
  body: string;
}

export interface SummaryInput {
  range: { from: string | null; to: string | null };
  bookings: number;
  paidCount: number;
  gbv: number;
  netRevenue: number;
  acceptanceRate: number;
  topProvinces: { province: string; count: number }[];
}

export interface SummaryResult {
  text: string;
}

export interface TranslationInput {
  text: string;
  targetLocale: string;
}

export interface TranslationResult {
  text: string;
  targetLocale: string;
}

export interface LlmProvider {
  /** Draft a contextual reply to a traveler or supplier (spec §4.8). */
  draftReply(input: DraftReplyInput): Promise<DraftReplyResult>;
  /** Natural-language operations/financial summary. */
  summarize(input: SummaryInput): Promise<SummaryResult>;
  /** Translate a message for the operations desk (spec §4.8). */
  translate(input: TranslationInput): Promise<TranslationResult>;
}
