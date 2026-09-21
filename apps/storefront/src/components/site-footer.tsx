import type { TenantConfig } from '@ota/config';

export function SiteFooter({ tenant }: { tenant: TenantConfig }) {
  return (
    <footer className="border-t bg-muted/40">
      <div className="mx-auto flex max-w-5xl flex-col gap-1 px-4 py-8 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{tenant.branding.agencyName}</span>
        <span>Licence MINTUR {tenant.branding.licenseNumber}</span>
        {tenant.branding.supportEmail ? (
          <a href={`mailto:${tenant.branding.supportEmail}`}>
            {tenant.branding.supportEmail}
          </a>
        ) : null}
      </div>
    </footer>
  );
}
