import { randomInt } from 'node:crypto';

// Excludes I/O/0/1 so a booking code can be read over the phone.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** An 8-character booking code, unique only with retry on collision. */
export function generateBookingCode(): string {
  let code = '';
  for (let index = 0; index < 8; index += 1) {
    code += CODE_ALPHABET.charAt(randomInt(CODE_ALPHABET.length));
  }
  return code;
}
