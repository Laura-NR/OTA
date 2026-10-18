/**
 * Cuba's provinces by the codes the tenant data and the map use (ISO 3166-2:CU
 * without the dash), named as the map file names them. The storefront reads
 * the same names from its generated map paths; this list serves the places
 * that have no map, such as the desk's view of a custom request's route.
 */
export const CUBA_PROVINCE_NAMES: Readonly<Record<string, string>> = {
  CU01: 'Pinar del Río',
  CU15: 'Artemisa',
  CU03: 'La Habana',
  CU16: 'Mayabeque',
  CU04: 'Matanzas',
  CU06: 'Cienfuegos',
  CU05: 'Villa Clara',
  CU07: 'Sancti Spíritus',
  CU08: 'Ciego de Ávila',
  CU09: 'Camagüey',
  CU10: 'Las Tunas',
  CU11: 'Holguín',
  CU12: 'Granma',
  CU13: 'Santiago de Cuba',
  CU14: 'Guantánamo',
  CU99: 'Isla de la Juventud',
};

/** A province code's name, or the code itself when it is not a Cuban province. */
export function cubaProvinceName(code: string): string {
  return CUBA_PROVINCE_NAMES[code] ?? code;
}
