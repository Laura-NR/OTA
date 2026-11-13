import type { Config } from 'tailwindcss';

type FontSizeEntry = [
  string,
  { lineHeight: string; fontWeight?: string; letterSpacing?: string },
];

/** The design type scale, keyed by type token name (`h1`, `body-sm`, …). */
export declare const TYPE_SCALE: Readonly<Record<string, FontSizeEntry>>;

declare const preset: Partial<Config>;

export default preset;
