import { redirect } from 'next/navigation';

/** Ops Lite opens on its alerts. */
export default function OpsLitePage() {
  redirect('/lite/alerts');
}
