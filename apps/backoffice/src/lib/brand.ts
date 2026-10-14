import favicon from '../../../../tenant/assets/brand/favicon.svg';
import wordmarkWhite from '../../../../tenant/assets/brand/vereda-wordmark-white.svg';

/**
 * The agency's brand files (logo C, "the name, set once"), self-hosted in the
 * fork-specific `tenant/assets/brand/` like the fonts, so a fork swaps the
 * files rather than components. Never retype the wordmark: use the files.
 * This is a build-time asset path, not a runtime import of agency
 * configuration.
 */
export const brand = { favicon, wordmarkWhite };
