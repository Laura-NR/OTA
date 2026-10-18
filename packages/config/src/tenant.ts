import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const featureFlagsSchema = z.object({
  interactiveSvgMap: z.boolean().default(true),
  culturalEventsBanner: z.boolean().default(true),
  recruitmentPortal: z.boolean().default(true),
  customItineraryBuilder: z.boolean().default(true),
  instantBooking: z.boolean().default(false),
  directBankTransferRail: z.boolean().default(true),
  creditCardGatewayRail: z.boolean().default(true),
});

export type FeatureFlags = z.infer<typeof featureFlagsSchema>;

/**
 * Duty-of-care contacts injected into generated vouchers and work orders
 * (spec §4.4, §8.1). Agency-specific, so they live in the tenant manifest.
 */
export const emergencyContactSchema = z.object({
  label: z.string().min(1),
  phone: z.string().min(1),
});

export type EmergencyContact = z.infer<typeof emergencyContactSchema>;

/**
 * Bank coordinates for the manual wire-transfer rail (spec §7.1). Agency
 * specific, so they live in the tenant manifest; core never imports `tenant/`.
 */
export const bankTransferDetailsSchema = z.object({
  accountName: z.string().min(1),
  bankName: z.string().min(1),
  iban: z.string().min(4),
  bic: z.string().nullable().default(null),
  /** Optional wording shown to the traveler about the reference to quote. */
  referenceNote: z.string().nullable().default(null),
});

export type BankTransferDetails = z.infer<typeof bankTransferDetailsSchema>;

/** Who must approve a refund (M4 D7): one person up to `singleUpTo`, two up to `dualUpTo`, a Super Admin above. */
export const refundApprovalSchema = z
  .object({
    singleUpTo: z.number().nonnegative().default(500),
    dualUpTo: z.number().nonnegative().default(2000),
  })
  .refine((limits) => limits.dualUpTo >= limits.singleUpTo, {
    message: 'dualUpTo must be at least singleUpTo',
  });

export const paymentsSchema = z.object({
  bankTransfer: bankTransferDetailsSchema.nullable().default(null),
  /** M4: hours to make the first payment once the link is sent (spec §4.2). */
  windowHours: z.number().int().positive().default(48),
  /**
   * M4 D6: the card surcharge in percent. 0 until counsel sets it: EU rules
   * restrict surcharges on consumer cards issued in the EEA (PSD2 art. 62(4)).
   */
  cardFeePercent: z.number().min(0).max(10).default(0),
  refundApproval: refundApprovalSchema.prefault({}),
});

export type PaymentsConfig = z.infer<typeof paymentsSchema>;

/**
 * A child's rate as a fraction of the adult price, up to an inclusive age
 * (M1 decision D4: agency-wide terms live in the manifest). No band, no
 * discount: a child then pays the adult rate.
 */
export const childBandSchema = z.object({
  maxAge: z.number().int().min(0).max(17),
  rate: z.number().min(0).max(1),
});

export type ChildBandConfig = z.infer<typeof childBandSchema>;

/**
 * A fee every package booking carries (a tourist card, a service fee). The
 * label is frozen onto the booking's price lines and printed on the invoice.
 */
export const bookingFeeSchema = z.object({
  label: z.string().min(1),
  unit: z.enum(['PER_PERSON', 'PER_BOOKING']),
  amount: z.number().nonnegative(),
});

export type BookingFeeConfig = z.infer<typeof bookingFeeSchema>;

export const pricingSchema = z.object({
  childBands: z.array(childBandSchema).default([]),
  fees: z.array(bookingFeeSchema).default([]),
});

export type PricingConfig = z.infer<typeof pricingSchema>;

/**
 * A deposit plan (M4 D2): the share paid first, offered only when departure is
 * further away than `minDaysBeforeDeparture`; the balance falls due
 * `balanceDaysBeforeDeparture` days before departure.
 */
export const depositPolicySchema = z
  .object({
    percent: z.number().gt(0).lt(100),
    minDaysBeforeDeparture: z.number().int().min(0),
    balanceDaysBeforeDeparture: z.number().int().min(0),
  })
  .refine((plan) => plan.balanceDaysBeforeDeparture < plan.minDaysBeforeDeparture, {
    message: 'The balance must fall due after the deposit window',
  });

/** From `fromDays` before departure, the share of what was paid that is kept, plus a fixed fee. */
export const cancellationBandSchema = z.object({
  fromDays: z.number().int().min(0),
  keepPercent: z.number().min(0).max(100),
  fee: z.number().nonnegative().default(0),
});

export const cancellationScaleSchema = z.object({
  bands: z.array(cancellationBandSchema).min(1),
});

/**
 * The agency's payment terms by policy key (M1 D4, M4 D2): a package names a
 * deposit plan and a cancellation scale by key, and these keys are the known
 * ones the publish checks accept.
 */
export const policiesSchema = z.object({
  deposit: z.record(z.string(), depositPolicySchema).default({}),
  cancellation: z.record(z.string(), cancellationScaleSchema).default({}),
});

export type PoliciesConfig = z.infer<typeof policiesSchema>;

/**
 * M5: the desk's proposal terms. The planning fee is transparency copy (it is
 * never added to the amount due); validity and response time are sample
 * placeholders until the owner confirms them.
 */
export const proposalsSchema = z.object({
  validityDays: z.number().int().positive().default(21),
  responseHours: z.number().int().positive().default(4),
  planningFee: z.number().nonnegative().default(140),
  defaultDepositPolicy: z.string().min(1).nullable().default('standard'),
  defaultCancellationPolicy: z.string().min(1).nullable().default('standard'),
});

export type ProposalsConfig = z.infer<typeof proposalsSchema>;

/**
 * The custom builder's choices and the rates behind its estimate (Custom
 * board). Keys name the options (their words live in the message catalogs);
 * every price is per person unless the key says per group. The estimate is a
 * range for orientation: the desk's proposal is the price.
 */
export const customBuilderSchema = z
  .object({
    /** `placeholder` shows the sample-content notice next to the estimate. */
    status: z.enum(['placeholder', 'published']).default('placeholder'),
    currency: z.string().length(3).default('EUR'),
    transports: z
      .array(
        z.object({ key: z.string().min(1), pricePerPersonDay: z.number().nonnegative() }),
      )
      .min(1),
    stayStyles: z
      .array(
        z.object({ key: z.string().min(1), pricePerNight: z.number().nonnegative() }),
      )
      .min(1),
    defaultStayStyle: z.string().min(1),
    guiding: z.object({
      sharedPerPersonDay: z.number().nonnegative(),
      privatePerGroupDay: z.number().nonnegative(),
    }),
    interpreterPerGroupDay: z.number().nonnegative(),
    offsetPerNight: z.number().nonnegative(),
    feePercent: z.number().min(0).max(100),
    /** The estimate shows the total ± this share. */
    spreadPercent: z.number().min(0).max(50).default(6),
  })
  .refine(
    (builder) =>
      builder.stayStyles.some((style) => style.key === builder.defaultStayStyle),
    { message: 'defaultStayStyle must be one of stayStyles', path: ['defaultStayStyle'] },
  );

export type CustomBuilderConfig = z.infer<typeof customBuilderSchema>;

/**
 * M8: the agency's crisis framework (A-Disruption). A case copies its
 * scenario's steps, options and compensation text when it opens (D1), so a
 * later edit here never rewrites an open case. Texts are in the desk's
 * language; the desk adapts the options before sending them.
 */
export const disruptionScenarioSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    /** What opens a case of this kind, as the framework words it. */
    trigger: z.string().min(1),
    steps: z
      .array(
        z.object({
          text: z.string().min(1),
          owner: z.string().min(1),
          due: z.string().min(1),
        }),
      )
      .default([]),
    /** At most four, keyed A–D in order; each states its money consequence. */
    options: z
      .array(
        z.object({
          key: z.enum(['A', 'B', 'C', 'D']),
          title: z.string().min(1),
          detail: z.string().min(1),
        }),
      )
      .max(4)
      .default([]),
    /** The option that stands when the deadline passes with no answer. */
    defaultOption: z.enum(['A', 'B', 'C', 'D']).default('A'),
    /** The compensation rule; money moves through M4 refunds (D9). */
    policy: z.string().min(1),
  })
  .refine(
    (scenario) => scenario.options.every((option, index) => option.key === 'ABCD'[index]),
    { message: 'options must be keyed A, B, C, D in order', path: ['options'] },
  )
  .refine(
    (scenario) =>
      scenario.options.length === 0 ||
      scenario.options.some((option) => option.key === scenario.defaultOption),
    { message: 'defaultOption must be one of options', path: ['defaultOption'] },
  );

export const disruptionsSchema = z
  .object({
    /** `placeholder` marks the sample framework until the agency confirms it. */
    status: z.enum(['placeholder', 'published']).default('placeholder'),
    /** The options deadline the desk's form proposes, in hours from sending. */
    deadlineHours: z.number().int().positive().max(72).default(4),
    scenarios: z.array(disruptionScenarioSchema).default([]),
  })
  .refine(
    (block) =>
      new Set(block.scenarios.map((scenario) => scenario.key)).size ===
      block.scenarios.length,
    { message: 'scenario keys must be unique', path: ['scenarios'] },
  );

export type DisruptionScenarioConfig = z.infer<typeof disruptionScenarioSchema>;
export type DisruptionsConfig = z.infer<typeof disruptionsSchema>;

export const tenantConfigSchema = z.object({
  tenantId: z.string().min(1),
  branding: z.object({
    agencyName: z.string().min(1),
    licenseNumber: z.string().min(1),
    /** The action colour (design token `color-primary-600`); the rest of the primary scale is derived from it. */
    primaryColor: z.string().default('#0B4F6C'),
    supportEmail: z.string().email().nullable().default(null),
    supportPhone: z.string().nullable().default(null),
    /** The WhatsApp line in international format (`+34 600 000 000`); web links open `wa.me`. */
    whatsappNumber: z.string().nullable().default(null),
  }),
  primaryLocale: z.string().min(2).default('es'),
  supportedLocales: z.array(z.string().min(2)).min(1).default(['es', 'en', 'fr']),
  theme: z
    .object({
      palette: z.string().default('vereda'),
      /** Scales the radius steps: `none`, `sm`, `md` (the design) or `lg`. */
      borderRadius: z.string().default('md'),
      /**
       * Overrides for primitive design tokens, keyed by token name without the
       * leading `--` (e.g. `color-secondary-600`). Alias and component tokens
       * are not overridable and are ignored by `@ota/theming`.
       */
      tokens: z.record(z.string(), z.string()).default({}),
    })
    .prefault({}),
  features: featureFlagsSchema.prefault({}),
  destinations: z
    .object({
      geographyType: z.string().default('cuba_provinces'),
    })
    .prefault({}),
  payments: paymentsSchema.prefault({}),
  pricing: pricingSchema.prefault({}),
  policies: policiesSchema.prefault({}),
  proposals: proposalsSchema.prefault({}),
  /** Null hides the builder's estimate and offers no transport or stay styles. */
  customBuilder: customBuilderSchema.nullable().default(null),
  /** No scenarios means the desk cannot open a case. */
  disruptions: disruptionsSchema.prefault({}),
  emergencyContacts: z.array(emergencyContactSchema).default([]),
});

export type TenantConfig = z.infer<typeof tenantConfigSchema>;

/** Every policy key the manifest defines, deposit and cancellation (the publish checks' known keys). */
export function knownPolicyKeys(config: Pick<TenantConfig, 'policies'>): string[] {
  return [
    ...new Set([
      ...Object.keys(config.policies.deposit),
      ...Object.keys(config.policies.cancellation),
    ]),
  ];
}

/**
 * Validate a tenant manifest. This is the fork-specific `agency.config` — the
 * only file (with assets and `.env`) that differs between agency deployments.
 */
export function parseTenantConfig(raw: unknown): TenantConfig {
  return tenantConfigSchema.parse(raw);
}

export function loadTenantConfig(path: string): TenantConfig {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return parseTenantConfig(raw);
}

export function isFeatureEnabled(
  config: TenantConfig,
  flag: keyof FeatureFlags,
): boolean {
  return config.features[flag];
}

/** Turn an agency name into a safe tenant id (lower-case kebab-case). */
export function slugifyTenantId(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'tenant';
}

/** Bank details for the wire-transfer rail, as accepted by `create-tenant`. */
export interface BankTransferManifestOptions {
  accountName: string;
  bankName: string;
  iban: string;
  bic?: string;
  referenceNote?: string;
}

export interface TenantManifestOptions {
  tenantId: string;
  agencyName: string;
  licenseNumber?: string;
  primaryColor?: string;
  palette?: string;
  borderRadius?: string;
  primaryLocale?: string;
  supportedLocales?: string[];
  features?: Partial<FeatureFlags>;
  emergencyContacts?: EmergencyContact[];
  bankTransfer?: BankTransferManifestOptions | null;
}

/**
 * Build a validated agency manifest for a new fork (the `create-tenant` tool).
 * Everything omitted falls back to the schema defaults, so the result is always
 * a complete, loadable manifest.
 */
export function buildTenantManifest(options: TenantManifestOptions): TenantConfig {
  return parseTenantConfig({
    tenantId: options.tenantId,
    branding: {
      agencyName: options.agencyName,
      licenseNumber: options.licenseNumber ?? 'MINTUR-YYYY-XXXX',
      ...(options.primaryColor ? { primaryColor: options.primaryColor } : {}),
    },
    ...(options.primaryLocale ? { primaryLocale: options.primaryLocale } : {}),
    ...(options.supportedLocales ? { supportedLocales: options.supportedLocales } : {}),
    ...(options.palette || options.borderRadius
      ? {
          theme: {
            ...(options.palette ? { palette: options.palette } : {}),
            ...(options.borderRadius ? { borderRadius: options.borderRadius } : {}),
          },
        }
      : {}),
    ...(options.features ? { features: options.features } : {}),
    ...(options.emergencyContacts
      ? { emergencyContacts: options.emergencyContacts }
      : {}),
    ...(options.bankTransfer
      ? {
          payments: {
            bankTransfer: {
              accountName: options.bankTransfer.accountName,
              bankName: options.bankTransfer.bankName,
              iban: options.bankTransfer.iban,
              ...(options.bankTransfer.bic ? { bic: options.bankTransfer.bic } : {}),
              ...(options.bankTransfer.referenceNote
                ? { referenceNote: options.bankTransfer.referenceNote }
                : {}),
            },
          },
        }
      : {}),
  });
}
