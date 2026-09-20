import { Catch, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { DomainError, InvalidReservationTransitionError } from '@ota/domain';
import type { Response } from 'express';

/**
 * Maps domain errors to HTTP responses so services can stay framework-free and
 * throw domain errors. Anything not mapped here is a 500 and should be treated
 * as a bug.
 */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const status = exception instanceof InvalidReservationTransitionError ? 409 : 422;

    response.status(status).json({
      error: exception.name,
      message: exception.message,
    });
  }
}
