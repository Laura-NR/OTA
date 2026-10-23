import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  buttonClassName,
} from '@ota/ui';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { InviteAccept } from '@/components/invite-accept';
import { getServerSession } from '@/lib/api';

/**
 * Accepting a staff invitation (M9 D4). The link carries a single-use token;
 * the invitee signs in with the invited address first, then accepts, and the
 * API applies the role. Outside the desk shell: the person is not staff yet.
 */
export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const [t, session, { token }] = await Promise.all([
    getTranslations('backoffice.invite'),
    getServerSession(),
    searchParams,
  ]);
  const back = `/invite?token=${encodeURIComponent(token ?? '')}`;

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-body-sm">
          {!token ? (
            <p>{t('noToken')}</p>
          ) : session ? (
            <InviteAccept token={token} email={session.user.email} />
          ) : (
            <>
              <p>{t('signInFirst')}</p>
              <Link
                href={`/login?next=${encodeURIComponent(back)}`}
                className={buttonClassName({ variant: 'primary' })}
              >
                {t('signIn')}
              </Link>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
