/**
 * The Destinations map's planning rules (Destinations board, "Plan a route"
 * layer, and the network panel). Distances are measured along the island on
 * each province's road distance from Havana, as the board does: a sketch to
 * talk over with a specialist, not a routing engine.
 */

/** Average road speed the board uses to turn kilometres into driving hours. */
export const ROAD_KMH = 55;

/** A leg longer than this is priced as a domestic flight or an overnight stop. */
export const FLIGHT_LEG_KM = 600;

/** The most stops a sketched route can hold. */
export const MAX_ROUTE_STOPS = 6;

export interface RouteStopInput {
  id: string;
  /** Road distance from Havana, negative to the west. */
  kmFromHavana: number;
  nights: number;
  /** A stop in a limited-network province is custom only. */
  limited: boolean;
}

export interface RouteLeg {
  from: string;
  to: string;
  km: number;
  hours: number;
  flight: boolean;
}

export interface RouteSummary {
  legs: RouteLeg[];
  km: number;
  hours: number;
  nights: number;
  needsFlight: boolean;
  hasLimited: boolean;
}

/** Driving hours for a distance, to one decimal. */
export function roadHours(km: number): number {
  return Math.round((km / ROAD_KMH) * 10) / 10;
}

/**
 * Add a stop at the end of the route, or take it out if it is already there.
 * A full route ignores new stops rather than dropping old ones.
 */
export function toggleRouteStop(
  route: readonly string[],
  id: string,
  max = MAX_ROUTE_STOPS,
): string[] {
  if (route.includes(id)) {
    return route.filter((stop) => stop !== id);
  }
  return route.length >= max ? [...route] : [...route, id];
}

/** The road, the nights and the warnings for stops in sleeping order. */
export function summarizeRoute(stops: readonly RouteStopInput[]): RouteSummary {
  const legs = stops.slice(1).map((stop, index) => {
    const previous = stops[index]!;
    const km = Math.abs(stop.kmFromHavana - previous.kmFromHavana);
    return {
      from: previous.id,
      to: stop.id,
      km,
      hours: roadHours(km),
      flight: km > FLIGHT_LEG_KM,
    };
  });
  const km = legs.reduce((sum, leg) => sum + leg.km, 0);
  return {
    legs,
    km,
    hours: roadHours(km),
    nights: stops.reduce((sum, stop) => sum + stop.nights, 0),
    needsFlight: legs.some((leg) => leg.flight),
    hasLimited: stops.some((stop) => stop.limited),
  };
}

/**
 * The closest province, by road distance from Havana, among the candidates
 * (for a province the agency does not serve: "nearest active").
 */
export function nearestByRoad<T extends { kmFromHavana: number }>(
  target: { kmFromHavana: number },
  candidates: readonly T[],
): T | null {
  let best: T | null = null;
  for (const candidate of candidates) {
    if (
      !best ||
      Math.abs(candidate.kmFromHavana - target.kmFromHavana) <
        Math.abs(best.kmFromHavana - target.kmFromHavana)
    ) {
      best = candidate;
    }
  }
  return best;
}

export interface NetworkProvince {
  network: 'active' | 'limited' | 'none';
  casas: number;
  hotels: number;
  guides: number;
  drivers: number;
}

export interface NetworkSummary {
  active: number;
  provinces: number;
  casas: number;
  hotels: number;
  guides: number;
  drivers: number;
}

/** "Active provinces 9 of 15 · 69 casas · 24 guides": the network panel's totals. */
export function summarizeNetwork(provinces: readonly NetworkProvince[]): NetworkSummary {
  return provinces.reduce<NetworkSummary>(
    (sum, province) => ({
      active: sum.active + (province.network === 'active' ? 1 : 0),
      provinces: sum.provinces + 1,
      casas: sum.casas + province.casas,
      hotels: sum.hotels + province.hotels,
      guides: sum.guides + province.guides,
      drivers: sum.drivers + province.drivers,
    }),
    { active: 0, provinces: 0, casas: 0, hotels: 0, guides: 0, drivers: 0 },
  );
}
