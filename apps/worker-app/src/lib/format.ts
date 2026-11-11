import type { ServiceType } from '@ota/domain';

/** Service times are shown in Cuba's time, wherever the phone thinks it is. */
const TIME_ZONE = 'America/Havana';

const SERVICE_LABELS: Record<ServiceType, string> = {
  GUIDE: 'Guía',
  TRANSPORTATION: 'Traslado',
  ACCOMMODATION: 'Alojamiento',
  EXPERIENCE: 'Experiencia',
};

const LANGUAGE_LABELS: Record<string, string> = {
  es: 'español',
  en: 'inglés',
  fr: 'francés',
  de: 'alemán',
  it: 'italiano',
  pt: 'portugués',
};

export function serviceLabel(type: ServiceType): string {
  return SERVICE_LABELS[type] ?? type;
}

export function languageLabel(locale: string): string {
  return LANGUAGE_LABELS[locale.slice(0, 2).toLowerCase()] ?? locale.toUpperCase();
}

/** "Margaret +1 · inglés" (W-Home): the first name, the rest of the party, the language. */
export function travelerLine(traveler: {
  firstName: string | null;
  language: string;
  partySize: number;
}): string {
  const name = traveler.firstName ?? 'Viajero';
  const others = traveler.partySize > 1 ? ` +${traveler.partySize - 1}` : '';
  return `${name}${others} · ${languageLabel(traveler.language)}`;
}

/** "€ 180" or "€ 92,50" (W-Home). */
export function money(amount: string, currency: string): string {
  const value = Number(amount);
  const symbol = currency === 'EUR' ? '€' : currency;
  const digits = Number.isInteger(value) ? 0 : 2;
  return `${symbol} ${value.toLocaleString('es-ES', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

/** "vie 13 feb" */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: TIME_ZONE,
  });
}

/** "15:40" */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  });
}

/**
 * A calendar date such as a credential's expiry, "12 jun 2027". It is kept
 * as midnight UTC, so it is read in UTC: in Cuba's time it would show the
 * day before.
 */
export function calendarDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Time left to answer as hours and minutes, "1:52" or "0:29" (W-Home,
 * W-Offer); never below "0:00".
 */
export function timeLeft(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Seconds as "0:45" (W-Login "Reenviar en 0:45"). */
export function secondsLeft(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const WEEKDAYS = [
  'domingo',
  'lunes',
  'martes',
  'miércoles',
  'jueves',
  'viernes',
  'sábado',
];

/** A `YYYY-MM-DD` calendar day's parts; it is a date, so it is read in UTC. */
function dayParts(day: string): { weekday: string; date: number; month: string } {
  const value = new Date(`${day}T00:00:00Z`);
  return {
    weekday: WEEKDAYS[value.getUTCDay()]!,
    date: value.getUTCDate(),
    month: MONTHS[value.getUTCMonth()]!,
  };
}

/** "Octubre 2026" (W-Calendar). */
export function monthTitle(month: string): string {
  const name = MONTHS[Number(month.slice(5, 7)) - 1]!;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${month.slice(0, 4)}`;
}

/** "Jueves 6 de octubre" (W-Calendar's selected day). */
export function dayTitle(day: string): string {
  const { weekday, date, month } = dayParts(day);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${date} de ${month}`;
}

/** "jueves 6 de octubre", for a screen reader. */
export function dayName(day: string): string {
  const { weekday, date, month } = dayParts(day);
  return `${weekday} ${date} de ${month}`;
}

/** "25 oct" (W-Calendar's range fields). */
export function dayShort(day: string): string {
  const { date, month } = dayParts(day);
  return `${date} ${month.slice(0, 3)}`;
}
