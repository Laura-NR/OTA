import type {
  DraftReplyInput,
  DraftReplyResult,
  LlmProvider,
  SummaryInput,
  SummaryResult,
  TranslationInput,
  TranslationResult,
} from './provider';

interface Template {
  greeting: string;
  intro: string;
  closing: string;
  subject: string;
}

const EN: Template = {
  subject: 'Your booking {code}',
  greeting: 'Hello {name},',
  intro:
    'Thank you for your message about booking {code}. Our operations team is reviewing it and will confirm the details shortly.',
  closing: 'Best regards, the operations team',
};

const TEMPLATES: Record<string, Template> = {
  es: {
    subject: 'Tu reserva {code}',
    greeting: 'Hola {name},',
    intro:
      'Gracias por tu mensaje sobre la reserva {code}. Nuestro equipo de operaciones la está revisando y te confirmará los detalles en breve.',
    closing: 'Un saludo, el equipo de operaciones',
  },
  en: EN,
  fr: {
    subject: 'Votre réservation {code}',
    greeting: 'Bonjour {name},',
    intro:
      'Merci pour votre message concernant la réservation {code}. Notre équipe des opérations l’examine et confirmera les détails sous peu.',
    closing: 'Cordialement, l’équipe des opérations',
  },
};

function template(locale: string): Template {
  return TEMPLATES[locale] ?? EN;
}

function fill(value: string, vars: Record<string, string>): string {
  return value.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? '');
}

/**
 * In-process stand-in for an LLM so the assistant surfaces work before a vendor
 * is chosen. Output is deterministic and templated — it is not a real model, and
 * `translate` only tags the target locale rather than translating.
 */
export class MockLlmProvider implements LlmProvider {
  async draftReply(input: DraftReplyInput): Promise<DraftReplyResult> {
    const t = template(input.locale);
    const vars = {
      code: input.bookingCode,
      name: input.travelerName ?? 'traveler',
    };
    const lines = [fill(t.greeting, vars), '', fill(t.intro, vars)];
    if (input.serviceSummary.length > 0) {
      lines.push('', `Included: ${input.serviceSummary.join(', ')}`);
    }
    if (input.latestMessage) {
      lines.push('', `Regarding: "${input.latestMessage}"`);
    }
    lines.push('', t.closing);
    return { subject: fill(t.subject, vars), body: lines.join('\n') };
  }

  async summarize(input: SummaryInput): Promise<SummaryResult> {
    const window =
      input.range.from || input.range.to
        ? `${input.range.from ?? 'the beginning'} to ${input.range.to ?? 'now'}`
        : 'all time';
    const acceptance = Math.round(input.acceptanceRate * 1000) / 10;
    const provinces =
      input.topProvinces.length > 0
        ? input.topProvinces
            .slice(0, 3)
            .map((row) => `${row.province} (${row.count})`)
            .join(', ')
        : 'none recorded';
    return {
      text:
        `For ${window}: ${input.bookings} bookings, ${input.paidCount} paid, ` +
        `€${input.gbv.toFixed(2)} gross and €${input.netRevenue.toFixed(2)} net. ` +
        `Dispatch acceptance was ${acceptance}%. Top provinces: ${provinces}.`,
    };
  }

  async translate(input: TranslationInput): Promise<TranslationResult> {
    return {
      text: `[${input.targetLocale}] ${input.text}`,
      targetLocale: input.targetLocale,
    };
  }
}
