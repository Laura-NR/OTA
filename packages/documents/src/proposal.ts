import type { DocumentBranding } from './branding';
import { escapeHtml, page } from './templates';

export type ProposalPdfLocale = 'en' | 'es' | 'fr';

const LOCALES: readonly ProposalPdfLocale[] = ['en', 'es', 'fr'];

/** The traveler's locale for the document; anything else reads English. */
export function proposalPdfLocale(value?: string | null): ProposalPdfLocale {
  const base = (value ?? 'en').trim().toLowerCase().split(/[-_]/)[0];
  return LOCALES.includes(base as ProposalPdfLocale) ? (base as ProposalPdfLocale) : 'en';
}

/** One priced version of a custom-trip proposal (M5, D-Proposal board). */
export interface ProposalPdfModel {
  reference: string;
  version: number;
  travelerName: string;
  createdAt: string;
  validUntil: string;
  /** Calendar days stored at UTC midnight. */
  startDate: string;
  endDate: string;
  adults: number;
  children: number;
  summary: string;
  notes: string | null;
  stops: { province: string; nights: number; accommodation?: string }[];
  /** Numbered from 1; each day's date is counted from `startDate`. */
  days: { day: number; location: string; plan: string; with?: string }[];
  options: { label: string; description?: string; price?: number }[];
  lines: {
    label: string;
    description: string | null;
    quantity: string;
    amount: string;
  }[];
  currency: string;
  total: string;
  perPerson: string | null;
  /** Shown for transparency only; never part of the total (M5 D6). */
  planningFee: number | null;
  /** The signed-in proposal page, where the traveler accepts. */
  portalUrl: string;
}

interface Copy {
  title: string;
  version: (version: number) => string;
  issued: (date: string, until: string) => string;
  preparedFor: (name: string) => string;
  party: (adults: number, children: number) => string;
  nights: (count: number) => string;
  route: string;
  stop: string;
  stay: string;
  days: string;
  day: string;
  where: string;
  plan: string;
  with: string;
  price: string;
  item: string;
  quantity: string;
  amount: string;
  total: string;
  perPerson: (amount: string) => string;
  planningFee: (amount: string) => string;
  options: string;
  notes: string;
  next: string;
  steps: string[];
  online: string;
  notABooking: string;
  license: string;
}

const COPY: Record<ProposalPdfLocale, Copy> = {
  en: {
    title: 'Custom itinerary proposal',
    version: (version) => `Proposal · version ${version}`,
    issued: (date, until) => `${date} · prices held until ${until}`,
    preparedFor: (name) => `Prepared for ${name}`,
    party: (adults, children) =>
      `${adults} ${adults === 1 ? 'adult' : 'adults'}${children > 0 ? `, ${children} ${children === 1 ? 'child' : 'children'}` : ''}`,
    nights: (count) => `${count} ${count === 1 ? 'night' : 'nights'}`,
    route: 'Route',
    stop: 'Stop',
    stay: 'Stay',
    days: 'Day by day',
    day: 'Day',
    where: 'Where',
    plan: 'Plan',
    with: 'With',
    price: 'Price',
    item: 'Item',
    quantity: 'Qty',
    amount: 'Amount',
    total: 'Total',
    perPerson: (amount) => `${amount} per person`,
    planningFee: (amount) =>
      `Planning fee ${amount}, shown for transparency and not added to the total.`,
    options: 'Options you can add',
    notes: 'Notes',
    next: 'What happens next',
    steps: [
      'Accept the proposal online: nothing is charged.',
      'We confirm each host, guide and driver with them.',
      'Once they have accepted, you choose a deposit or the full amount on your trip page.',
      'When your first payment is received, your vouchers and documents arrive in your account.',
    ],
    online: 'Review and accept online',
    notABooking:
      'This proposal is not a booking; each provider confirms availability after you accept.',
    license: 'MINTUR License',
  },
  es: {
    title: 'Propuesta de itinerario a medida',
    version: (version) => `Propuesta · versión ${version}`,
    issued: (date, until) => `${date} · precios garantizados hasta el ${until}`,
    preparedFor: (name) => `Preparada para ${name}`,
    party: (adults, children) =>
      `${adults} ${adults === 1 ? 'adulto' : 'adultos'}${children > 0 ? `, ${children} ${children === 1 ? 'niño' : 'niños'}` : ''}`,
    nights: (count) => `${count} ${count === 1 ? 'noche' : 'noches'}`,
    route: 'Ruta',
    stop: 'Parada',
    stay: 'Alojamiento',
    days: 'Día a día',
    day: 'Día',
    where: 'Dónde',
    plan: 'Plan',
    with: 'Con',
    price: 'Precio',
    item: 'Concepto',
    quantity: 'Cant.',
    amount: 'Importe',
    total: 'Total',
    perPerson: (amount) => `${amount} por persona`,
    planningFee: (amount) =>
      `Tarifa de planificación ${amount}, indicada por transparencia y no sumada al total.`,
    options: 'Opciones que puedes añadir',
    notes: 'Notas',
    next: 'Qué pasa después',
    steps: [
      'Acepta la propuesta en línea: no se cobra nada.',
      'Confirmamos con cada anfitrión, guía y conductor.',
      'Cuando todos hayan aceptado, eliges un depósito o el importe completo en la página de tu viaje.',
      'Cuando recibimos tu primer pago, tus bonos y documentos llegan a tu cuenta.',
    ],
    online: 'Revisa y acepta en línea',
    notABooking:
      'Esta propuesta no es una reserva; cada proveedor confirma la disponibilidad después de que la aceptes.',
    license: 'Licencia MINTUR',
  },
  fr: {
    title: "Proposition d'itinéraire sur mesure",
    version: (version) => `Proposition · version ${version}`,
    issued: (date, until) => `${date} · prix garantis jusqu'au ${until}`,
    preparedFor: (name) => `Préparée pour ${name}`,
    party: (adults, children) =>
      `${adults} ${adults === 1 ? 'adulte' : 'adultes'}${children > 0 ? `, ${children} ${children === 1 ? 'enfant' : 'enfants'}` : ''}`,
    nights: (count) => `${count} ${count === 1 ? 'nuit' : 'nuits'}`,
    route: 'Itinéraire',
    stop: 'Étape',
    stay: 'Hébergement',
    days: 'Jour par jour',
    day: 'Jour',
    where: 'Où',
    plan: 'Programme',
    with: 'Avec',
    price: 'Prix',
    item: 'Poste',
    quantity: 'Qté',
    amount: 'Montant',
    total: 'Total',
    perPerson: (amount) => `${amount} par personne`,
    planningFee: (amount) =>
      `Frais de conception ${amount}, indiqués par transparence et non ajoutés au total.`,
    options: 'Options à ajouter',
    notes: 'Remarques',
    next: 'Et ensuite',
    steps: [
      "Acceptez la proposition en ligne : rien n'est débité.",
      'Nous confirmons avec chaque hôte, guide et chauffeur.',
      "Une fois qu'ils ont accepté, vous choisissez un acompte ou le montant total sur la page de votre voyage.",
      'Dès réception de votre premier paiement, vos bons et documents arrivent dans votre compte.',
    ],
    online: 'Consulter et accepter en ligne',
    notABooking:
      "Cette proposition n'est pas une réservation ; chaque prestataire confirme sa disponibilité après votre acceptation.",
    license: 'Licence MINTUR',
  },
};

function money(
  value: number | string,
  currency: string,
  locale: ProposalPdfLocale,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value));
}

function day(value: string, locale: ProposalPdfLocale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(value),
  );
}

/** Day `number` of the trip, counted from its first calendar day ("Thu 4 Mar"). */
function tripDay(start: string, number: number, locale: ProposalPdfLocale): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(Date.parse(start) + (number - 1) * 86_400_000));
}

/** Nights between two calendar days (the trip's last day is a departure). */
function nightsBetween(start: string, end: string): number {
  return Math.max(0, Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000));
}

/**
 * The D-Proposal document: one priced version as the traveler receives it,
 * with the route, the days, the price lines, the options and what happens
 * next. Sections without data (no stops, no days, no options) are left out.
 */
export function renderProposalHtml(
  model: ProposalPdfModel,
  branding: DocumentBranding,
  requestedLocale?: string | null,
): string {
  const locale = proposalPdfLocale(requestedLocale);
  const copy = COPY[locale];
  const amount = (value: number | string) =>
    escapeHtml(money(value, model.currency, locale));

  const route =
    model.stops.length === 0
      ? ''
      : `
<h2>${escapeHtml(copy.route)}</h2>
<table>
  <thead><tr><th>${escapeHtml(copy.stop)}</th><th>${escapeHtml(copy.stay)}</th></tr></thead>
  <tbody>${model.stops
    .map(
      (stop) => `<tr>
        <td>${escapeHtml(stop.province)}</td>
        <td>${escapeHtml(copy.nights(stop.nights))}${stop.accommodation ? ` · ${escapeHtml(stop.accommodation)}` : ''}</td>
      </tr>`,
    )
    .join('')}</tbody>
</table>`;

  const days =
    model.days.length === 0
      ? ''
      : `
<h2>${escapeHtml(copy.days)}</h2>
<table>
  <thead><tr><th>${escapeHtml(copy.day)}</th><th>${escapeHtml(copy.where)}</th><th>${escapeHtml(copy.plan)}</th><th>${escapeHtml(copy.with)}</th></tr></thead>
  <tbody>${model.days
    .map(
      (entry) => `<tr>
        <td>${entry.day}<br/><span class="muted">${escapeHtml(tripDay(model.startDate, entry.day, locale))}</span></td>
        <td>${escapeHtml(entry.location)}</td>
        <td>${escapeHtml(entry.plan)}</td>
        <td>${escapeHtml(entry.with ?? '—')}</td>
      </tr>`,
    )
    .join('')}</tbody>
</table>`;

  const lines = model.lines
    .map(
      (line) => `<tr>
        <td>${escapeHtml(line.label)}${line.description ? `<br/><span class="muted">${escapeHtml(line.description)}</span>` : ''}</td>
        <td class="amount">${escapeHtml(String(Number(line.quantity)))}</td>
        <td class="amount">${amount(line.amount)}</td>
      </tr>`,
    )
    .join('');

  const options =
    model.options.length === 0
      ? ''
      : `
<h2>${escapeHtml(copy.options)}</h2>
<ul>${model.options
          .map(
            (option) =>
              `<li><strong>${escapeHtml(option.label)}</strong>${option.description ? ` — ${escapeHtml(option.description)}` : ''}${typeof option.price === 'number' ? ` · + ${amount(option.price)}` : ''}</li>`,
          )
          .join('')}</ul>`;

  const nights = nightsBetween(model.startDate, model.endDate);
  const body = `
<h2>${escapeHtml(copy.title)}</h2>
<p class="muted">${escapeHtml(copy.version(model.version))} · <strong>${escapeHtml(model.reference)}</strong></p>
<p class="muted">${escapeHtml(copy.issued(day(model.createdAt, locale), day(model.validUntil, locale)))}</p>
<p><strong>${escapeHtml(copy.preparedFor(model.travelerName))}</strong> · ${escapeHtml(copy.party(model.adults, model.children))} · ${escapeHtml(day(model.startDate, locale))} → ${escapeHtml(day(model.endDate, locale))} · ${escapeHtml(copy.nights(nights))}</p>
<p style="white-space: pre-line;">${escapeHtml(model.summary)}</p>${route}${days}
<h2>${escapeHtml(copy.price)} · ${escapeHtml(model.currency)}</h2>
<table>
  <thead><tr><th>${escapeHtml(copy.item)}</th><th class="amount">${escapeHtml(copy.quantity)}</th><th class="amount">${escapeHtml(copy.amount)}</th></tr></thead>
  <tbody>${lines}
    <tr class="total"><td>${escapeHtml(copy.total)}${model.perPerson ? ` · ${escapeHtml(copy.perPerson(money(model.perPerson, model.currency, locale)))}` : ''}</td><td></td><td class="amount">${amount(model.total)}</td></tr>
  </tbody>
</table>
${model.planningFee !== null ? `<p class="muted">${escapeHtml(copy.planningFee(money(model.planningFee, model.currency, locale)))}</p>` : ''}${options}${model.notes ? `\n<h2>${escapeHtml(copy.notes)}</h2>\n<p style="white-space: pre-line;">${escapeHtml(model.notes)}</p>` : ''}
<h2>${escapeHtml(copy.next)}</h2>
<ol>${copy.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
<p>${escapeHtml(copy.online)}: <a href="${escapeHtml(model.portalUrl)}">${escapeHtml(model.portalUrl)}</a></p>
<p class="muted">${escapeHtml(copy.notABooking)}</p>`;

  return page(`${copy.title} ${model.reference} v${model.version}`, body, branding, {
    lang: locale,
    licenseLabel: copy.license,
  });
}
