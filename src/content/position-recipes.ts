import type { PositionSkill } from '../core/position-aoe';

/** Appearance only; ranges, angles, beam counts, pull and recall motion belong to core. */
export const POSITION_PRESENTATION = {
  'abyss-vortex': { color: '#8c9de8', edge: '#c0c9ff', fill: .04, height: .041 },
  'ice-radiance': { color: '#9ddfff', edge: '#edffff', fill: 0, height: .065 },
  'spore-trail': { color: '#9bc95c', edge: '#d5ef88', fill: .05, height: .037 },
  'tidal-recall': { color: '#75cfe8', edge: '#c8fff2', fill: 0, height: .055 },
} as const satisfies Record<PositionSkill, { color: string; edge: string; fill: number; height: number }>;
export const POSITION_DECORATION = {
  full: { motes: 6, feedbackPieces: 3, innerRipples: true, beamCore: true },
  reduced: { motes: 2, feedbackPieces: 1, innerRipples: false, beamCore: false },
} as const;
