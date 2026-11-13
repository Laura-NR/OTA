/** Lower-case kebab slug for storefront URLs (accents stripped). */
export function slugify(value: string, fallback: string): string {
  return (
    value
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 200) || fallback
  );
}
