import type { PackageDto } from '@ota/schemas';

function apiBaseUrl(): string {
  return process.env.API_URL ?? 'http://localhost:3001';
}

/**
 * Read the public curated-package catalogue. Cached for 60s and tolerant of an
 * unavailable API so a cold build or a briefly-down backend still renders the
 * page shell.
 */
export async function getPackages(): Promise<PackageDto[]> {
  try {
    const response = await fetch(`${apiBaseUrl()}/catalog/packages`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) {
      return [];
    }
    return (await response.json()) as PackageDto[];
  } catch {
    return [];
  }
}

export async function getPackage(slug: string): Promise<PackageDto | null> {
  try {
    const response = await fetch(
      `${apiBaseUrl()}/catalog/packages/${encodeURIComponent(slug)}`,
      { next: { revalidate: 60 } },
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as PackageDto;
  } catch {
    return null;
  }
}
