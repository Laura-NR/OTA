import { createHash } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { ConsentPurpose } from '@ota/domain';
import type { LegalContent, LegalText } from '@ota/schemas';

import { LEGAL_CONTENT } from './compliance.tokens';

export interface ResolvedText {
  version: string;
  text: string;
  /** SHA-256 of the words, so a record proves which text was shown. */
  hash: string;
}

/** English is the content's source language; other locales fall back to it. */
const SOURCE_LOCALE = 'en';

function resolve(text: LegalText | undefined): ResolvedText | null {
  return text
    ? {
        version: text.version,
        text: text.text,
        hash: createHash('sha256').update(text.text, 'utf8').digest('hex'),
      }
    : null;
}

/**
 * The words a traveler signs or consents to (M3, D4), read from the tenant's
 * content: the OFAC statement and each consent purpose's text, in the
 * requested locale or the English source.
 */
@Injectable()
export class LegalTextsService {
  constructor(
    @Inject(LEGAL_CONTENT) private readonly content: Record<string, LegalContent>,
  ) {}

  ofacStatement(locale?: string): ResolvedText | null {
    return resolve(
      this.inOrder(locale)
        .map((legal) => legal.ofacStatement)
        .find(Boolean),
    );
  }

  consent(purpose: ConsentPurpose, locale?: string): ResolvedText | null {
    return resolve(
      this.inOrder(locale)
        .map((legal) => legal.consents[purpose])
        .find(Boolean),
    );
  }

  private inOrder(locale: string | undefined): LegalContent[] {
    return [locale, SOURCE_LOCALE]
      .filter((candidate): candidate is string => Boolean(candidate))
      .map((candidate) => this.content[candidate])
      .filter((legal): legal is LegalContent => Boolean(legal));
  }
}
