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
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('backoffice.suppliersTable');

  if (suppliers.length === 0) {
    return <Alert>{t('empty')}</Alert>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('supplier')}</TableHead>
          <TableHead>{t('category')}</TableHead>
          <TableHead>{t('provinces')}</TableHead>
          <TableHead>{t('rtnLicence')}</TableHead>
          <TableHead>{t('credential')}</TableHead>
          <TableHead>{t('status')}</TableHead>
          <TableHead>{t('available')}</TableHead>
          {canVerify ? <TableHead>{t('verification')}</TableHead> : null}
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
                {supplier.hasCredential ? t('onFile') : t('missing')}
              </Badge>
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(supplier.verificationStatus)}>
                {supplier.verificationStatus.replaceAll('_', ' ')}
              </Badge>
            </TableCell>
            <TableCell>{supplier.isAvailable ? t('yes') : t('no')}</TableCell>
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
