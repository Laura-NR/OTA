import { UserRole } from '@ota/domain';

/** Who reads the payment schedule, proofs and refunds (A-Payments, A-Booking). */
export const PAYMENT_READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/** Who changes them: links, reviews, refunds and votes. */
export const PAYMENT_WRITE_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.SuperAdmin,
] as const;
