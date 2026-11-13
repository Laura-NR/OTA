import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { Prisma } from '@ota/db';
import {
  BASE_CURRENCY,
  DISPLAY_CURRENCIES,
  displayCurrencySwitchKey,
  displayRate,
  enabledDisplayCurrencies,
  isRateStale,
  lockDue,
  referenceRate,
  type DisplayCurrencyCode,
  type FxLockEvent,
  type FxLockPoint,
  type ShownCurrency,
} from '@ota/domain';
import type {
  CurrencySettingsDto,
  DisplayRateLockDto,
  PublicCurrenciesDto,
} from '@ota/schemas';

import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { OperatingSettingsService } from '../settings/operating-settings.service';
import type { FxRateProvider } from './fx-rate.provider';
import type { FxRateScheduler } from './fx-rate.scheduler';
import { FX_RATE_PROVIDER, FX_RATE_SCHEDULER } from './fx-rate.tokens';

/** The latest stored day of reference rates. */
interface StoredRates {
  rateDate: Date;
  source: string;
  rates: Partial<Record<DisplayCurrencyCode, number>>;
}

/** The public read is on every storefront page; rates change once a day. */
const CACHE_MS = 60_000;
/** A day with no rate retries the provider at most this often per process. */
const RETRY_MS = 60 * 60_000;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

/** A booking's locked rate as the DTOs carry it (C6a), or null. */
export function rateLockOf(reservation: {
  displayCurrency: string | null;
  displayRate: Prisma.Decimal | number | null;
  displayRateDate: Date | null;
  displayRateLockedAt: Date | null;
}): DisplayRateLockDto | null {
  if (
    !reservation.displayCurrency ||
    reservation.displayRate === null ||
    !reservation.displayRateDate ||
    !reservation.displayRateLockedAt
  ) {
    return null;
  }
  return {
    currency: reservation.displayCurrency as DisplayCurrencyCode,
    rate: Number(reservation.displayRate),
    rateDate: isoDay(reservation.displayRateDate),
    lockedAt: reservation.displayRateLockedAt.toISOString(),
  };
}

/**
 * M9 display currencies (`docs/schema-m9-display-currencies.md`). Stores the
 * day's reference rates from the provider, serves the rates shown (spread
 * included), keeps a traveler's choice, and locks a booking's rate at the
 * deposit or the invoice. Every amount charged stays in EUR.
 */
@Injectable()
export class CurrenciesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CurrenciesService.name);
  private cache: { at: number; stored: StoredRates | null } | null = null;
  private lastRefreshAttempt = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: OperatingSettingsService,
    @Inject(FX_RATE_PROVIDER) private readonly provider: FxRateProvider,
    @Inject(FX_RATE_SCHEDULER) private readonly scheduler: FxRateScheduler,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.scheduler.schedule(async () => {
      await this.refresh();
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.scheduler.close();
  }

  /** Ask the provider for its latest day and store it; a stored day is kept as is. */
  async refresh(): Promise<void> {
    this.lastRefreshAttempt = Date.now();
    const latest = await this.provider.latest();
    const rateDate = new Date(`${latest.rateDate}T00:00:00.000Z`);
    await this.prisma.exchangeRate.createMany({
      data: DISPLAY_CURRENCIES.flatMap((currency) => {
        const rate = latest.rates[currency];
        return rate === undefined
          ? []
          : [{ rateDate, currency, rate, source: this.provider.source }];
      }),
      skipDuplicates: true,
    });
    this.cache = null;
  }

  /**
   * The latest stored day of rates. A day that has none yet asks the
   * provider first (C5a "the first read of a day"), at most once an hour; a
   * failed ask is logged and the older day is served.
   */
  private async stored(now = new Date()): Promise<StoredRates | null> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.stored;
    let latest = await this.prisma.exchangeRate.findFirst({
      orderBy: { rateDate: 'desc' },
    });
    const today = isoDay(now);
    if (
      (!latest || isoDay(latest.rateDate) < today) &&
      Date.now() - this.lastRefreshAttempt >= RETRY_MS
    ) {
      try {
        await this.refresh();
        latest = await this.prisma.exchangeRate.findFirst({
          orderBy: { rateDate: 'desc' },
        });
      } catch (error) {
        this.logger.warn(`Display rates not refreshed: ${(error as Error).message}`);
      }
    }
    let stored: StoredRates | null = null;
    if (latest) {
      const rows = await this.prisma.exchangeRate.findMany({
        where: { rateDate: latest.rateDate },
      });
      stored = {
        rateDate: latest.rateDate,
        source: latest.source,
        rates: Object.fromEntries(rows.map((row) => [row.currency, Number(row.rate)])),
      };
    }
    this.cache = { at: Date.now(), stored };
    return stored;
  }

  /** Public `GET /catalog/currencies`: the currencies on, at the rate shown; none when stale. */
  async publicCurrencies(now = new Date()): Promise<PublicCurrenciesDto> {
    const thresholds = await this.settings.thresholds();
    const stored = await this.stored(now);
    if (!stored || isRateStale(stored.rateDate, now)) {
      return {
        base: BASE_CURRENCY,
        rateDate: null,
        lockAt: thresholds.fxLockAt,
        currencies: [],
      };
    }
    return {
      base: BASE_CURRENCY,
      rateDate: isoDay(stored.rateDate),
      lockAt: thresholds.fxLockAt,
      currencies: enabledDisplayCurrencies(thresholds).flatMap((code) => {
        const reference = stored.rates[code];
        return reference === undefined
          ? []
          : [{ code, rate: displayRate(reference, thresholds.fxSpreadPercent) }];
      }),
    };
  }

  /** Staff `GET /settings/currencies`: A-Settings' table. */
  async settingsView(now = new Date()): Promise<CurrencySettingsDto> {
    const thresholds = await this.settings.thresholds();
    const stored = await this.stored(now);
    return {
      base: BASE_CURRENCY,
      source: stored?.source ?? this.provider.source,
      rateDate: stored ? isoDay(stored.rateDate) : null,
      stale: !stored || isRateStale(stored.rateDate, now),
      spreadPercent: thresholds.fxSpreadPercent,
      lockAt: thresholds.fxLockAt,
      currencies: DISPLAY_CURRENCIES.map((code) => {
        const reference = stored?.rates[code] ?? null;
        return {
          code,
          enabled: thresholds[displayCurrencySwitchKey(code)],
          referenceRate: reference,
          rate:
            reference === null
              ? null
              : displayRate(reference, thresholds.fxSpreadPercent),
        };
      }),
    };
  }

  /**
   * The rate an email's "about CA$ …" guide uses (C7b): the booking's locked
   * rate, else today's for the traveler's currency, with the lock point for
   * the "the rate locks when …" words. Null when the traveler sees EUR or no
   * rate applies. A failed read is logged and returns null: the guide never
   * costs the traveler the email it sits in.
   */
  async emailReference(
    currency: string | null | undefined,
    lock: DisplayRateLockDto | null,
    now = new Date(),
  ): Promise<{
    currency: DisplayCurrencyCode;
    rate: number;
    lockedAt: Date | null;
    lockAt: FxLockPoint;
  } | null> {
    try {
      const today = await this.publicCurrencies(now);
      const found = referenceRate({ lock, currency, offered: today.currencies });
      return found
        ? {
            currency: found.currency,
            rate: found.rate,
            lockedAt: lock ? new Date(lock.lockedAt) : null,
            lockAt: today.lockAt,
          }
        : null;
    } catch (error) {
      this.logger.warn(`Email display rate not read: ${(error as Error).message}`);
      return null;
    }
  }

  /** `PUT /me/display-currency` (C4a): save the choice and audit it. */
  async setPreference(
    actor: AuthUser,
    currency: ShownCurrency,
  ): Promise<{ currency: ShownCurrency }> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: { displayCurrency: true },
    });
    if (user.displayCurrency !== currency) {
      await this.prisma.$transaction([
        this.prisma.user.update({
          where: { id: actor.id },
          data: { displayCurrency: currency },
        }),
        this.prisma.auditLog.create({
          data: {
            actorUserId: actor.id,
            action: 'user.display_currency_changed',
            entityType: 'User',
            entityId: actor.id,
            metadata: { from: user.displayCurrency, to: currency },
          },
        }),
      ]);
    }
    return { currency };
  }

  /**
   * A traveler who never chose keeps the currency the storefront showed them
   * when they ask for a payment link, so the lock reads what they saw.
   */
  async adoptShown(userId: string, currency: ShownCurrency | undefined): Promise<void> {
    if (!currency) return;
    await this.prisma.user.updateMany({
      where: { id: userId, displayCurrency: null },
      data: { displayCurrency: currency },
    });
  }

  /**
   * Lock a booking's display rate (C6a) inside the caller's transaction, when
   * the event is the threshold's lock point. Nothing happens when the booking
   * is locked already, the traveler's currency is EUR or switched off, or the
   * rate is stale; a lock is never changed.
   */
  async lockRate(
    tx: Prisma.TransactionClient,
    reservationId: string,
    event: FxLockEvent,
    actorId: string | null,
    now = new Date(),
  ): Promise<void> {
    const thresholds = await this.settings.thresholds();
    if (!lockDue(thresholds.fxLockAt, event)) return;
    const reservation = await tx.reservation.findUnique({
      where: { id: reservationId },
      select: { displayRateLockedAt: true, user: { select: { displayCurrency: true } } },
    });
    const currency = reservation?.user.displayCurrency;
    if (
      !reservation ||
      reservation.displayRateLockedAt ||
      !currency ||
      currency === BASE_CURRENCY
    ) {
      return;
    }
    const code = currency as DisplayCurrencyCode;
    if (!enabledDisplayCurrencies(thresholds).includes(code)) return;
    const stored = await this.stored(now);
    const reference = stored?.rates[code];
    if (!stored || reference === undefined || isRateStale(stored.rateDate, now)) return;
    const rate = displayRate(reference, thresholds.fxSpreadPercent);
    await tx.reservation.update({
      where: { id: reservationId },
      data: {
        displayCurrency: code,
        displayRate: rate,
        displayRateDate: stored.rateDate,
        displayRateLockedAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        actorUserId: actorId,
        action: 'reservation.display_rate_locked',
        entityType: 'Reservation',
        entityId: reservationId,
        metadata: {
          currency: code,
          rate,
          rateDate: isoDay(stored.rateDate),
          source: stored.source,
          event,
        },
      },
    });
  }
}
