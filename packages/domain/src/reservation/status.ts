/**
 * Reservation lifecycle statuses.
 *
 * Canonical sequence comes from the operations state machine (spec §4.2):
 *   DRAFT -> ITINERARY_SUBMITTED -> DISPATCH_IN_PROGRESS ->
 *   ASSEMBLY_AND_ESCALATION -> SECURED_AND_INVOICED -> PENDING_PAYMENT ->
 *   CONFIRMED -> IN_PROGRESS -> COMPLETED
 * with ACTION_REQUIRED as a non-linear escalation branch and CANCELLED terminal.
 *
 * The data dictionary (§6.2) lists a shorter, inconsistent set
 * (DRAFT, PENDING_PAYMENT, DISPATCHING, ...). The §4.2 set is authoritative here;
 * the discrepancy is flagged in the handoff.
 */
export const ReservationStatus = {
  Draft: 'DRAFT',
  ItinerarySubmitted: 'ITINERARY_SUBMITTED',
  DispatchInProgress: 'DISPATCH_IN_PROGRESS',
  AssemblyAndEscalation: 'ASSEMBLY_AND_ESCALATION',
  SecuredAndInvoiced: 'SECURED_AND_INVOICED',
  PendingPayment: 'PENDING_PAYMENT',
  ActionRequired: 'ACTION_REQUIRED',
  Confirmed: 'CONFIRMED',
  InProgress: 'IN_PROGRESS',
  Completed: 'COMPLETED',
  Cancelled: 'CANCELLED',
} as const;

export type ReservationStatus =
  (typeof ReservationStatus)[keyof typeof ReservationStatus];

export const RESERVATION_STATUSES: readonly ReservationStatus[] =
  Object.values(ReservationStatus);

/**
 * Lifecycle of a single assigned service component (spec §6.2).
 */
export const ServiceItemStatus = {
  Unassigned: 'UNASSIGNED',
  Offered: 'OFFERED',
  Accepted: 'ACCEPTED',
  Declined: 'DECLINED',
  Timeout: 'TIMEOUT',
  Fulfilled: 'FULFILLED',
} as const;

export type ServiceItemStatus =
  (typeof ServiceItemStatus)[keyof typeof ServiceItemStatus];

export const ServiceType = {
  Guide: 'GUIDE',
  Transportation: 'TRANSPORTATION',
  Accommodation: 'ACCOMMODATION',
  Experience: 'EXPERIENCE',
} as const;

export type ServiceType = (typeof ServiceType)[keyof typeof ServiceType];

/**
 * RBAC roles (spec §2).
 */
export const UserRole = {
  SuperAdmin: 'SUPER_ADMIN',
  OperationsAdmin: 'OPERATIONS_ADMIN',
  AdministrativeSupport: 'ADMINISTRATIVE_SUPPORT',
  ServiceWorker: 'SERVICE_WORKER',
  Traveler: 'TRAVELER',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];
