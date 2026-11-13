import { redirect } from 'next/navigation';

/** The Content section opens on its only built tab, the advisories (M7). */
export default function ContentPage() {
  redirect('/content/advisories');
}
