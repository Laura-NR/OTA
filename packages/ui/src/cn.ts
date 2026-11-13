import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge only knows Tailwind's default names. Without this, the design
 * type sizes (`text-h1`, `text-body-sm`) read as text colours and a later
 * `text-default` would silently drop them.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'caption',
        'overline',
        'label',
        'body-sm',
        'nav',
        'body',
        'body-lg',
        'button',
        'h4',
        'h2-compact',
        'h3',
        'h1-compact',
        'h2',
        'h1',
        'display-2',
        'display-1',
      ],
      spacing: ['touch', 'touch-base'],
    },
  },
});

/**
 * Merge conditional class names, letting the last conflicting Tailwind class
 * win (`px-2` over `px-4`) instead of relying on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
