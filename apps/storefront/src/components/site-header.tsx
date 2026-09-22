import Link from 'next/link';

import { getServerSession } from '@/lib/api';

export async function SiteHeader({ agencyName }: { agencyName: string }) {
  const session = await getServerSession();

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          {agencyName}
        </Link>
        <nav className="flex items-center gap-6 text-sm font-medium">
          <Link href="/" className="hover:text-primary">
            Home
          </Link>
          <Link href="/catalog" className="hover:text-primary">
            Experiences
          </Link>
          <Link href="/join-our-network" className="hover:text-primary">
            Work with us
          </Link>
          {session ? (
            <Link href="/account" className="hover:text-primary">
              My account
            </Link>
          ) : (
            <Link href="/login" className="hover:text-primary">
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
