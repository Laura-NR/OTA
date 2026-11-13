import type { SVGAttributes } from 'react';

import { cn } from '../cn';
import { ICON_SPRITE_SYMBOLS } from '../icons/sprite';
import type { IconName } from '../icons/sprite';

/**
 * The icon sprite (T-Assets §03): render it once per document, at the top of
 * `<body>`; every `<Icon>` references its symbols with `<use>`.
 */
export function IconSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="absolute h-0 w-0 overflow-hidden"
      dangerouslySetInnerHTML={{ __html: ICON_SPRITE_SYMBOLS }}
    />
  );
}

export interface IconProps extends Omit<SVGAttributes<SVGSVGElement>, 'children'> {
  name: IconName;
  /**
   * The accessible name, for an icon that carries meaning on its own. Omit it
   * for a decorative icon or one beside visible text; it is then hidden from
   * assistive technology. Icon-only buttons put their label on the button.
   */
  label?: string;
}

/** A Lucide icon on the 24 px grid with a 2 px stroke, in the current text colour. */
export function Icon({ name, label, className, ...props }: IconProps) {
  const accessibility = label
    ? { role: 'img', 'aria-label': label }
    : { 'aria-hidden': true, focusable: 'false' as const };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('h-5 w-5 shrink-0', className)}
      {...accessibility}
      {...props}
    >
      <use href={`#icon-${name}`} />
    </svg>
  );
}
