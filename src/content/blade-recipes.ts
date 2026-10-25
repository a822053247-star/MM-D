import type { BladeId } from '../core/blade-weapons';

export const BLADE_PRESENTATION = {
  'thorn-wheel': { color: '#a9d971', core: '#f2ffd0', impact: '#caef95', height: .18, trailLength: 1.1, trailWidth: .12 },
  'tidal-blade': { color: '#72dfff', core: '#e3ffff', impact: '#a4f1ff', height: .2, trailLength: 1.4, trailWidth: .16 },
} as const satisfies Record<BladeId, { color: string; core: string; impact: string; height: number; trailLength: number; trailWidth: number }>;
export const BLADE_DECORATION = {
  full: { trailSegments: 5, impactPieces: 3 },
  reduced: { trailSegments: 2, impactPieces: 1 },
} as const;
