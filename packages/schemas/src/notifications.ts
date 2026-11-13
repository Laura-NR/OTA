import { z } from 'zod';

/** One pass of the daily traveler-notification scan (Phase 6). */
export const notificationScanResultSchema = z.object({
  /** E-NPS, adapted: trip-review requests and their one reminder. */
  reviewRequests: z.number().int(),
  /** E-Reconfirm: the one-week-to-go emails. */
  reconfirmations: z.number().int(),
});

export type NotificationScanResultDto = z.infer<typeof notificationScanResultSchema>;
