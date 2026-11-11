import { describe, expect, it } from 'vitest';

import { copy, declineReasonText } from '../src/lib/copy';
import {
  calendarDate,
  clock,
  dayName,
  dayShort,
  dayTitle,
  money,
  monthTitle,
  secondsLeft,
  shortDate,
  timeLeft,
  travelerLine,
} from '../src/lib/format';

describe('how the worker app says things (W-Home, W-Offer)', () => {
  it('shows times in Cuba, wherever the phone is', () => {
    // 20:40 UTC is 15:40 in Havana in February (UTC−5).
    expect(clock('2027-02-13T20:40:00Z')).toBe('15:40');
    expect(shortDate('2027-02-13T20:40:00Z')).toMatch(/13 feb/);
  });

  it('keeps a calendar date such as a credential expiry on its own day', () => {
    expect(calendarDate('2027-12-31T00:00:00.000Z')).toBe('31 dic 2027');
  });

  it('counts down in hours and minutes, never below zero', () => {
    expect(timeLeft(29 * 60_000 + 59_000)).toBe('0:29');
    expect(timeLeft(112 * 60_000)).toBe('1:52');
    expect(timeLeft(-5_000)).toBe('0:00');
    expect(secondsLeft(44.2)).toBe('0:45');
  });

  it('names the travelers by first name, party and language only', () => {
    expect(travelerLine({ firstName: 'Margaret', language: 'en', partySize: 2 })).toBe(
      'Margaret +1 · inglés',
    );
    expect(travelerLine({ firstName: null, language: 'xx', partySize: 1 })).toBe(
      'Viajero · XX',
    );
  });

  it('writes the payout in euros the Spanish way', () => {
    expect(money('180.00', 'EUR')).toBe('€ 180');
    expect(money('92.50', 'EUR')).toBe('€ 92,50');
  });

  it('sends the decline reason as the desk reads it', () => {
    expect(declineReasonText('fuel', 'ignored')).toBe('No tengo combustible asegurado');
    expect(declineReasonText('other', '  boda familiar ')).toBe(
      'Otro motivo: boda familiar',
    );
    expect(declineReasonText('other', '')).toBe('Otro motivo');
  });

  it('names W-Calendar’s days as dates, whatever the phone’s time zone', () => {
    expect(monthTitle('2026-10')).toBe('Octubre 2026');
    expect(dayTitle('2026-10-06')).toBe('Martes 6 de octubre');
    expect(dayName('2026-11-01')).toBe('domingo 1 de noviembre');
    expect(dayShort('2026-10-25')).toBe('25 oct');
    expect(dayShort('2026-09-03')).toBe('3 sep');
  });

  it('does not count a day on the range button before both ends are picked', () => {
    expect(copy.calendar.blockDays(0)).toBe('Bloquear días');
    expect(copy.calendar.blockDays(1)).toBe('Bloquear 1 día');
    expect(copy.calendar.blockDays(16)).toBe('Bloquear 16 días');
  });
});
