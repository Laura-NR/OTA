import { notFound } from 'next/navigation';

/** Any path no route matches: the localized 404 (`not-found.tsx`), not Next's default. */
export default function UnknownPage() {
  notFound();
}
