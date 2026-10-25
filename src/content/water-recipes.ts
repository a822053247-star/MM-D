import type { WaterSkill } from '../core/water-aoe';

export const WATER_PRESENTATION = {
  'azure-burst': { color: '#71dfff', edge: '#cff7ff', fill: .13, height: .048 },
  'star-tide': { color: '#8ff0ee', edge: '#d9ffff', fill: 0, height: .052 },
  'still-sea': { color: '#5caedf', edge: '#9ddfff', fill: .055, height: .038 },
  'returning-ring': { color: '#68dfd2', edge: '#c1fff2', fill: .035, height: .042 },
} as const satisfies Record<WaterSkill, { color: string; edge: string; fill: number; height: number }>;
export const WATER_DECORATION = {
  full: { markers: 8, splashPieces: 3 },
  reduced: { markers: 3, splashPieces: 1 },
} as const;
