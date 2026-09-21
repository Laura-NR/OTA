'use client';

import { Button } from '@ota/ui';
import { useRouter } from 'next/navigation';

import { authClient } from '@/lib/auth-client';

export function SignOutButton() {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await authClient.signOut();
        router.push('/login');
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
