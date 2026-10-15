import { Controller, Get, Param, ParseUUIDPipe, UseFilters } from '@nestjs/common';
import { UserRole } from '@ota/domain';
import type { CustomerDetailDto, CustomerDto } from '@ota/schemas';

import { Roles } from '../common/auth/roles.decorator';
import { DomainExceptionFilter } from '../common/errors/domain-exception.filter';
import { CustomersService } from './customers.service';

const READ_ROLES = [
  UserRole.OperationsAdmin,
  UserRole.AdministrativeSupport,
  UserRole.SuperAdmin,
] as const;

/**
 * A-Customers: the traveler account list and a customer's profile (trips and
 * retention). Read-only; the OFAC, consent and communication surfaces arrive
 * with M2/M3.
 */
@Controller('customers')
@UseFilters(DomainExceptionFilter)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @Roles(...READ_ROLES)
  list(): Promise<CustomerDto[]> {
    return this.customers.list();
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  get(@Param('id', ParseUUIDPipe) id: string): Promise<CustomerDetailDto> {
    return this.customers.getById(id);
  }
}
