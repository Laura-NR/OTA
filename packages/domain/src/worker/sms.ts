/** One SMS segment in the GSM 03.38 default alphabet holds 160 characters. */
export const SMS_SEGMENT_CHARACTERS = 160;

/**
 * The GSM 03.38 default alphabet. It has è, é, ù, ì, ò and à but not á, í, ó
 * or ú, which is why ADR 0007 bans those four.
 */
const GSM_7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

/**
 * Whether a message goes out as a single GSM-7 segment, the rule every
 * Cuban SMS follows (ADR 0007): only default-alphabet characters, at most
 * 160 of them. Characters from the extension table (`€`, `[`, …) count
 * double on the network, so they are refused here rather than counted.
 */
export function fitsOneSmsSegment(text: string): boolean {
  if ([...text].length > SMS_SEGMENT_CHARACTERS) return false;
  return [...text].every((character) => GSM_7_BASIC.includes(character));
}
