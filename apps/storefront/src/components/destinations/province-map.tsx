'use client';

import { cn } from '@ota/ui';

import { CUBA_PROVINCES } from '@/lib/cuba-provinces';
import type { ProvinceView } from '@/lib/geography';

export type MapLayer = 'coverage' | 'conditions' | 'route';

/**
 * A province's fill and stroke on each layer (Destinations board; colours
 * snapped per ADR 0006: map fills success-200 / warning-100 / neutral-300).
 * Coverage: network state; Conditions: advisory level; Route: stops.
 */
function provinceTone(
  province: ProvinceView | undefined,
  layer: MapLayer,
  inRoute: boolean,
): { fill: string; stroke: string; dashed?: boolean; hatched?: boolean } {
  if (!province) {
    return { fill: 'fill-neutral-100', stroke: 'stroke-neutral-300' };
  }
  if (layer === 'conditions') {
    return {
      1: { fill: 'fill-success-100', stroke: 'stroke-success-600' },
      2: { fill: 'fill-info-100', stroke: 'stroke-info-600' },
      3: { fill: 'fill-warning-100', stroke: 'stroke-warning-600' },
    }[province.advisoryLevel];
  }
  if (layer === 'route') {
    if (inRoute) {
      return { fill: 'fill-primary-50', stroke: 'stroke-primary-600' };
    }
    return province.network === 'none'
      ? { fill: 'fill-neutral-100', stroke: 'stroke-neutral-300' }
      : { fill: 'fill-neutral-0', stroke: 'stroke-neutral-300' };
  }
  return {
    active: { fill: 'fill-success-200', stroke: 'stroke-success-600' },
    limited: { fill: 'fill-warning-100', stroke: 'stroke-warning-600', dashed: true },
    none: { fill: '', stroke: 'stroke-neutral-300', hatched: true },
  }[province.network];
}

/**
 * The province map (1000 × 342, Simplemaps geometry). Label sizes are in map
 * units and scale with the drawing, as on the board. Pointer users tap a
 * province here; the strip below is the same control for keyboards and screen
 * readers, so the drawing itself is one labelled image.
 */
export function ProvinceMap({
  provinces,
  points,
  layer,
  selected,
  route,
  label,
  describe,
  onPick,
}: {
  provinces: readonly ProvinceView[];
  /** Destination dots, hidden while sketching a route. */
  points: readonly { x: number; y: number }[];
  layer: MapLayer;
  selected: string | null;
  route: readonly string[];
  label: string;
  /** The hover text for a province ("Matanzas · Active network · 10 casas"). */
  describe: (province: ProvinceView) => string;
  onPick: (code: string) => void;
}) {
  const byCode = new Map(provinces.map((province) => [province.code, province]));
  const stops = route
    .map((code) => byCode.get(code))
    .filter((province): province is ProvinceView => Boolean(province));

  return (
    <svg viewBox="0 0 1000 342" role="img" aria-label={label} className="h-auto w-full">
      <defs>
        <pattern
          id="province-hatch"
          patternUnits="userSpaceOnUse"
          width="6"
          height="6"
          patternTransform="rotate(45)"
        >
          <rect width="6" height="6" className="fill-neutral-100" />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="6"
            strokeWidth="1.4"
            className="stroke-neutral-300"
          />
        </pattern>
      </defs>
      {CUBA_PROVINCES.map((shape) => {
        const province = byCode.get(shape.id);
        const tone = provinceTone(province, layer, route.includes(shape.id));
        return (
          <path
            key={shape.id}
            d={shape.d}
            fill={tone.hatched ? 'url(#province-hatch)' : undefined}
            strokeWidth={selected === shape.id ? 2.5 : 1.5}
            strokeDasharray={tone.dashed ? '6 4' : undefined}
            strokeLinejoin="round"
            onClick={province ? () => onPick(shape.id) : undefined}
            className={cn(
              tone.fill,
              tone.stroke,
              province ? 'cursor-pointer transition-opacity hover:opacity-80' : '',
            )}
          >
            {province ? <title>{describe(province)}</title> : null}
          </path>
        );
      })}
      {provinces.map((province) => (
        <text
          key={province.code}
          x={province.label.x}
          y={province.label.y}
          textAnchor="middle"
          fontSize={11}
          fontWeight={600}
          className="pointer-events-none fill-neutral-900 font-body max-md:hidden"
        >
          {province.short ?? province.name}
        </text>
      ))}
      {layer === 'route' ? (
        <g className="pointer-events-none">
          {stops.length > 1 ? (
            <polyline
              points={stops.map((stop) => `${stop.label.x},${stop.label.y}`).join(' ')}
              fill="none"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="stroke-secondary-600"
            />
          ) : null}
          {stops.map((stop, index) => (
            <g key={stop.code}>
              <circle
                cx={stop.label.x}
                cy={stop.label.y}
                r="12"
                className="fill-secondary-600"
              />
              <text
                x={stop.label.x}
                y={stop.label.y + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={700}
                className="fill-neutral-0 font-body"
              >
                {index + 1}
              </text>
            </g>
          ))}
        </g>
      ) : (
        <g className="pointer-events-none">
          {points.map((point) => (
            <circle
              key={`${point.x},${point.y}`}
              cx={point.x}
              cy={point.y}
              r="4"
              strokeWidth="1.5"
              className="fill-secondary-600 stroke-neutral-0"
            />
          ))}
        </g>
      )}
    </svg>
  );
}
