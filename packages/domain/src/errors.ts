import type { ReservationStatus } from './reservation/status';

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidReservationTransitionError extends DomainError {
  constructor(
    public readonly from: ReservationStatus,
    public readonly to: ReservationStatus,
  ) {
    super(`Invalid reservation transition: ${from} -> ${to}`);
  }
}
