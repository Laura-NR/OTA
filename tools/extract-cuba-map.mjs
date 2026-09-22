// Regenerates the storefront's Cuba province path data from the source SVG in
// resources/index.html. Run with: node tools/extract-cuba-map.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'resources/index.html'), 'utf8');

// The SVG uses historical province labels; keep them in step with the names the
// catalog and supplier records use.
const PROVINCE_ALIASES = new Map([['Ciudad de la Habana', 'La Habana']]);

const pathPattern = /<path\s+d="([^"]+)"\s+id="(CU\d+)"\s+name="([^"]+)"/g;
const provinces = [];
for (const match of source.matchAll(pathPattern)) {
  const name = PROVINCE_ALIASES.get(match[3]) ?? match[3];
  provinces.push({ id: match[2], name, d: match[1] });
}
provinces.sort((a, b) => a.name.localeCompare(b.name, 'es'));

const output = `// GENERATED FILE — do not edit by hand.
// Source: resources/index.html. Regenerate with: node tools/extract-cuba-map.mjs
export interface CubaProvince {
  id: string;
  name: string;
  d: string;
}

export const CUBA_PROVINCES: readonly CubaProvince[] = ${JSON.stringify(
  provinces,
  null,
  2,
)};
`;

writeFileSync(resolve(root, 'apps/storefront/src/lib/cuba-provinces.ts'), output);
console.log(`Wrote ${provinces.length} provinces to apps/storefront/src/lib/cuba-provinces.ts`);
