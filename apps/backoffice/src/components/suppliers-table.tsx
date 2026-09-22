'use client';

import type { VerificationStatus } from '@ota/domain';
import type { SupplierDto } from '@ota/schemas';
import {
  Alert,
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ota/ui';
import Link from 'next/link';

import { VerificationActions } from './verification-actions';

function statusVariant(status: VerificationStatus) {
  if (status === 'VERIFIED') return 'success' as const;
  if (status === 'REJECTED' || status === 'SUSPENDED') return 'destructive' as const;
  return 'secondary' as const;
}

export function SuppliersTable({
  suppliers,
  canVerify,
}: {
  suppliers: SupplierDto[];
  canVerify: boolean;
}) {
  if (suppliers.length === 0) {
    return (
      <Alert>No suppliers yet. Recruitment intake is not built in this increment.</Alert>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Supplier</TableHead>
          <TableHead>Category</TableHead>
          <TableHead>Provinces</TableHead>
          <TableHead>RTN licence</TableHead>
          <TableHead>Credential</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Available</TableHead>
          {canVerify ? <TableHead>Verification</TableHead> : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {suppliers.map((supplier) => (
          <TableRow key={supplier.id}>
            <TableCell>
              <Link
                href={`/suppliers/${supplier.id}`}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                {supplier.fullName ?? supplier.email}
              </Link>
              <div className="text-xs text-muted-foreground">{supplier.email}</div>
            </TableCell>
            <TableCell>{supplier.category.replaceAll('_', ' ')}</TableCell>
            <TableCell>{supplier.provincesActive.join(', ') || '—'}</TableCell>
            <TableCell>{supplier.rtnLicenseNumber}</TableCell>
            <TableCell>
              <Badge variant={supplier.hasCredential ? 'success' : 'outline'}>
                {supplier.hasCredential ? 'On file' : 'Missing'}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(supplier.verificationStatus)}>
                {supplier.verificationStatus.replaceAll('_', ' ')}
              </Badge>
            </TableCell>
            <TableCell>{supplier.isAvailable ? 'Yes' : 'No'}</TableCell>
            {canVerify ? (
              <TableCell>
                <VerificationActions
                  supplierId={supplier.id}
                  status={supplier.verificationStatus}
                  canVerify={canVerify}
                />
              </TableCell>
            ) : null}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
