#!/usr/bin/env node
/**
 * Scaffold a fork's tenant directory (spec §2 white-label strategy).
 *
 *   pnpm create:tenant --name "Viñales Eco Travel" [--id vinales-eco]
 *     [--license MINTUR-2027-0001] [--primary "#0f766e"] [--palette ecoGreen]
 *     [--radius md] [--locale es] [--locales es,en,fr]
 *     [--account-name "..."] [--bank "..."] [--iban ES...] [--bic ...]
 *     [--reference-note "..."] [--out tenant] [--force]
 *
 * Requires the workspace to be built (`pnpm build`) so `@ota/config` resolves.
 * Writes `agency.config.json` (validated by the same Zod schema the apps load)
 * and an `assets/` folder, and refuses to overwrite an existing manifest
 * without `--force`. The wire-transfer bank flags configure the primary payment
 * rail (spec §7.1); omit them and the storefront wire page shows "not
 * available" until the manifest is edited.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { buildTenantManifest, slugifyTenantId } from '@ota/config';

function parseArgs(argv) {
  const args = { force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--force') {
      args.force = true;
      continue;
    }
    if (!token.startsWith('--')) {
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) {
      continue;
    }
    args[token.slice(2)] = value;
    index += 1;
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (!args.name) {
  console.error(
    'Usage: pnpm create:tenant --name "Agency Name" [--id slug] [--license MINTUR-YYYY-XXXX] ' +
      '[--primary #hex] [--palette name] [--radius md] [--locale es] [--locales es,en,fr] ' +
      '[--account-name "..."] [--bank "..."] [--iban ES...] [--bic ...] [--reference-note "..."] ' +
      '[--out tenant] [--force]',
  );
  process.exit(1);
}

const bankTransfer =
  args['account-name'] ||
  args.bank ||
  args.iban ||
  args.bic ||
  args['reference-note']
    ? {
        accountName: args['account-name'],
        bankName: args.bank,
        iban: args.iban,
        bic: args.bic,
        referenceNote: args['reference-note'],
      }
    : undefined;

if (
  bankTransfer &&
  (!bankTransfer.accountName || !bankTransfer.bankName || !bankTransfer.iban)
) {
  console.error(
    'Wire transfer needs --account-name, --bank, and --iban together (--bic and --reference-note are optional).',
  );
  process.exit(1);
}

const tenantId = slugifyTenantId(args.id ?? args.name);
const outDir = resolve(args.out ?? 'tenant');
const configPath = join(outDir, 'agency.config.json');

if (existsSync(configPath) && !args.force) {
  console.error(`${configPath} already exists — pass --force to overwrite.`);
  process.exit(1);
}

const manifest = buildTenantManifest({
  tenantId,
  agencyName: args.name,
  licenseNumber: args.license,
  primaryColor: args.primary,
  palette: args.palette,
  borderRadius: args.radius,
  primaryLocale: args.locale,
  supportedLocales: args.locales
    ? args.locales
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : undefined,
  bankTransfer,
});

mkdirSync(outDir, { recursive: true });
writeFileSync(configPath, `${JSON.stringify(manifest, null, 2)}\n`);

const assetsDir = join(outDir, 'assets');
mkdirSync(assetsDir, { recursive: true });
const assetReadme = join(assetsDir, 'README.md');
if (!existsSync(assetReadme)) {
  writeFileSync(
    assetReadme,
    "# tenant/assets\n\nDrop this agency's logo, favicon, and illustrations here. " +
      'Core apps reference these through the tenant config, never by importing this directory.\n',
  );
}

console.log(`Wrote ${configPath} (tenantId: ${manifest.tenantId})`);
console.log(`Wrote ${assetReadme}`);
console.log(
  'Next: copy .env.example to .env, fill in secrets/services, review the feature flags, and deploy.',
);
