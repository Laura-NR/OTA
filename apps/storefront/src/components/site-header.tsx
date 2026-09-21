import Link from 'next/link';

export function SiteHeader({ agencyName }: { agencyName: string }) {
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
        </nav>
      </div>
    </header>
  );
}
