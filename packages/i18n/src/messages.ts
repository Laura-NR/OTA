import en from './messages/en.json';
import es from './messages/es.json';
import fr from './messages/fr.json';

import { DEFAULT_LOCALE, type Locale } from './locales';

/** The English catalog is the reference shape for every locale. */
export type Messages = typeof en;

const CATALOGS: Record<Locale, Messages> = {
  en,
  es: es as Messages,
  fr: fr as Messages,
};

export function loadMessages(locale: Locale): Messages {
  return CATALOGS[locale] ?? CATALOGS[DEFAULT_LOCALE];
}
