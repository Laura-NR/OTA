import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

/**
 * The tenant's destination data (`tenant/provinces.json`,
 * `tenant/destinations.json`): where the agency operates and what each place
 * offers, as numbers and states the map layers and panels read. The words
 * (names, taglines, notes) are tenant content in `messages/<locale>.json`, so
 * these files are the same in every language. Province codes are the map's
 * ISO 3166-2:CU ids (`CU03` La Habana; `CU99` the special municipality).
 */

const provinceCode = z.string().regex(/^CU\d{2}$/, 'a province code like CU03');
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a lower-case kebab-case slug');
/** A point on the 1000 × 342 province map. */
const mapPoint = z.object({
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(342),
});
const count = z.number().int().nonnegative();

/** `placeholder` data shows a sample notice until the agency publishes it. */
export const geographyStatusSchema = z.enum(['placeholder', 'published']);

/** Active: vetted hosts and drivers on call. Limited: custom trips only. None: not sold. */
export const networkStatusSchema = z.enum(['active', 'limited', 'none']);

/** The Destinations strip groups provinces west to east; the isle sits outside it. */
export const regionSchema = z.enum(['west', 'centre', 'east', 'isle']);

export const fuelStatusSchema = z.enum(['ok', 'queues', 'scarce']);

export const provinceDataSchema = z.object({
  code: provinceCode,
  /** Map label when the province name is too long to print: "S. Spíritus". */
  short: z.string().min(1).optional(),
  region: regionSchema,
  network: networkStatusSchema,
  casas: count,
  hotels: count.default(0),
  guides: count.default(0),
  drivers: count.default(0),
  experiences: count.default(0),
  /** 1 normal, 2 caution, 3 disruption likely (the Conditions layer). */
  advisoryLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  /** Typical daily power cut in hours; `max: null` reads "12 h+". */
  powerCuts: z
    .object({ min: z.number().nonnegative(), max: z.number().nonnegative().nullable() })
    .refine((cuts) => cuts.max === null || cuts.max >= cuts.min, {
      message: 'max must be at least min',
    }),
  fuel: fuelStatusSchema,
  /** Road distance from Havana, negative to the west; route legs are measured on it. */
  kmFromHavana: z.number().int(),
  /** Nights the agency suggests for a stop here. */
  nights: count,
  label: mapPoint,
});

export const provincesFileSchema = z.object({
  status: geographyStatusSchema,
  /** When the network and conditions figures were last checked (YYYY-MM-DD). */
  updated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  provinces: z.array(provinceDataSchema).min(1),
});

export const destinationDataSchema = z.object({
  slug,
  province: provinceCode,
  /** Key of the theme filter; its label is tenant content. */
  theme: slug,
  /** Whether backup power reads as settled (green) or as something to plan for (amber). */
  power: z.enum(['ok', 'caution']),
  /** Hosts exist but the bench is thin: custom trips only. */
  limited: z.boolean().default(false),
  /** Curated packages that sleep here, by slug; the live catalogue supplies their price. */
  packages: z.array(slug).default([]),
  point: mapPoint,
});

export const destinationsFileSchema = z.object({
  status: geographyStatusSchema,
  destinations: z.array(destinationDataSchema),
});

export type GeographyStatus = z.infer<typeof geographyStatusSchema>;
export type NetworkStatus = z.infer<typeof networkStatusSchema>;
export type Region = z.infer<typeof regionSchema>;
export type FuelStatus = z.infer<typeof fuelStatusSchema>;
export type ProvinceData = z.infer<typeof provinceDataSchema>;
export type DestinationData = z.infer<typeof destinationDataSchema>;

export interface TenantGeography {
  /** `placeholder` when either file is. */
  status: GeographyStatus;
  updated: string;
  provinces: ProvinceData[];
  destinations: DestinationData[];
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function unique(values: readonly string[], what: string, file: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${file}: duplicate ${what} ${value}`);
    }
    seen.add(value);
  }
}

/**
 * Read and check the tenant's destination data from its directory. No
 * `provinces.json` means the tenant publishes no destinations (null); a
 * malformed file, a repeated code or slug, or a destination in an unlisted
 * province throws, so a bad edit fails loudly instead of drawing half a map.
 */
export function loadTenantGeography(dir: string): TenantGeography | null {
  const provincesPath = join(dir, 'provinces.json');
  if (!existsSync(provincesPath)) {
    return null;
  }
  const provincesFile = provincesFileSchema.parse(readJson(provincesPath));
  unique(
    provincesFile.provinces.map((province) => province.code),
    'province',
    provincesPath,
  );

  const destinationsPath = join(dir, 'destinations.json');
  const destinationsFile = existsSync(destinationsPath)
    ? destinationsFileSchema.parse(readJson(destinationsPath))
    : { status: provincesFile.status, destinations: [] };
  unique(
    destinationsFile.destinations.map((destination) => destination.slug),
    'destination',
    destinationsPath,
  );
  const codes = new Set(provincesFile.provinces.map((province) => province.code));
  for (const destination of destinationsFile.destinations) {
    if (!codes.has(destination.province)) {
      throw new Error(
        `${destinationsPath}: ${destination.slug} is in ${destination.province}, which provinces.json does not list`,
      );
    }
  }

  return {
    status:
      provincesFile.status === 'published' && destinationsFile.status === 'published'
        ? 'published'
        : 'placeholder',
    updated: provincesFile.updated,
    provinces: provincesFile.provinces,
    destinations: destinationsFile.destinations,
  };
}
