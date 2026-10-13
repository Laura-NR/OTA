import type { TenantConfig } from '@ota/config';
import { getTranslations } from 'next-intl/server';

export async function SiteFooter({ tenant }: { tenant: TenantConfig }) {
  const t = await getTranslations('footer');

  return (
    <footer className="border-t bg-sunken">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-8 text-body-sm text-muted">
        <span className="font-medium text-default">{tenant.branding.agencyName}</span>
        <span>{t('license', { license: tenant.branding.licenseNumber })}</span>
        {tenant.branding.supportEmail ? (
          <a href={`mailto:${tenant.branding.supportEmail}`}>
            {tenant.branding.supportEmail}
          </a>
        ) : null}
      </div>
    </footer>
  );
}
