import Constants from 'expo-constants';

/** What `app.config.ts` read from the tenant manifest at build time. */
export interface AppSettings {
  /** The API's origin; empty in the web preview, which proxies it. */
  apiUrl: string;
  agencyName: string;
  /** The operations desk's 24/7 line, or null when the manifest has none. */
  deskPhone: string | null;
  colors: {
    primary: string;
    primaryDark: string;
    primarySoft: string;
    ink: string;
    inkSoft: string;
    line: string;
    page: string;
    surface: string;
    success: string;
    successSoft: string;
    warning: string;
    warningSoft: string;
    danger: string;
  };
}

export const settings = Constants.expoConfig?.extra as AppSettings;
