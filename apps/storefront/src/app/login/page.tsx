import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@ota/ui';
import { redirect } from 'next/navigation';

import { MagicLinkForm } from '@/components/magic-link-form';
import { getServerSession } from '@/lib/api';

function safeNext(value: string | undefined): string {
  return value && value.startsWith('/') ? value : '/account';
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const callbackPath = safeNext(next);

  const session = await getServerSession();
  if (session) {
    redirect(callbackPath);
  }

  return (
    <main className="mx-auto flex max-w-5xl justify-center px-4 py-16">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Enter your email and we will send a one-time link to your bookings and
            documents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MagicLinkForm callbackPath={callbackPath} />
        </CardContent>
      </Card>
    </main>
  );
}
