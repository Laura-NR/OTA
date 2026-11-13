/**
 * For a button-styled link with a long label: the label wraps and the button
 * grows, rather than push a narrow page sideways at larger text (DS 07).
 */
export const WRAPPING_BUTTON =
  'h-auto min-h-10 whitespace-normal py-2 text-center pointer-coarse:min-h-touch';

/**
 * A link that stands alone (not inside a sentence) becomes a 44 px row on a
 * touch screen (DS 05 targets); a mouse keeps the compact line.
 */
export const TOUCH_ROW =
  'pointer-coarse:inline-flex pointer-coarse:min-h-touch pointer-coarse:items-center';
