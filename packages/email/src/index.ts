export { ConsoleMailer, SmtpMailer, createMailer } from './mailer';
export type { EmailAttachment, EmailMessage, Mailer, SmtpOptions } from './mailer';
export { magicLinkEmail } from './templates/magic-link';
export type { EmailBranding, MagicLinkEmailInput } from './templates/magic-link';
export { contactMessageEmail } from './templates/contact-message';
export type { ContactMessageEmailInput } from './templates/contact-message';
export { newMessageEmail } from './templates/new-message';
export type { NewMessageEmailInput } from './templates/new-message';
export { retentionNoticeEmail } from './templates/retention-notice';
export type { RetentionNoticeEmailInput } from './templates/retention-notice';
export { bookingReceivedEmail } from './templates/booking-received';
export type { BookingReceivedEmailInput } from './templates/booking-received';
export { ofacReminderEmail } from './templates/ofac-reminder';
export type { OfacReminderEmailInput } from './templates/ofac-reminder';
export { proposalSentEmail } from './templates/proposal-sent';
export type { ProposalSentEmailInput } from './templates/proposal-sent';
export { instalmentReminderEmail } from './templates/instalment-reminder';
export type {
  InstalmentReminderEmailInput,
  ReminderInstalmentKind,
} from './templates/instalment-reminder';
export { paymentWindowReminderEmail } from './templates/payment-window-reminder';
export type {
  PaymentWindowReminderEmailInput,
  WindowInstalmentKind,
} from './templates/payment-window-reminder';
export { bookingSecuredEmail } from './templates/booking-secured';
export type { BookingSecuredEmailInput } from './templates/booking-secured';
export { bookingConfirmedEmail } from './templates/booking-confirmed';
export type { BookingConfirmedEmailInput } from './templates/booking-confirmed';
export { reviewRequestEmail } from './templates/review-request';
export type { ReviewRequestEmailInput } from './templates/review-request';
export { tripReconfirmEmail } from './templates/trip-reconfirm';
export type { TripReconfirmEmailInput } from './templates/trip-reconfirm';
export { travelAdvisoryEmail } from './templates/travel-advisory';
export { disruptionOptionsEmail } from './templates/disruption-options';
export type {
  DisruptionEmailSeverity,
  DisruptionOptionsEmailInput,
} from './templates/disruption-options';
export type {
  AdvisoryEmailSeverity,
  TravelAdvisoryEmailInput,
} from './templates/travel-advisory';
export { staffInviteEmail } from './templates/staff-invite';
export type { StaffInviteEmailInput } from './templates/staff-invite';
