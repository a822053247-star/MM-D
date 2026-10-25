/** Appearance only: actual status timers, capsule extents and damage remain in core. */
export const FROST_PRESENTATION = {
  chill: '#9ddfff', frozen: '#d0f7ff', immune: '#a6b7c9',
  patch: '#73c5e5', edge: '#c1f2ff', shard: '#defaff',
} as const;
export const FROST_DECORATION = {
  full: { eventPieces: 4, patchCrystals: 4 },
  reduced: { eventPieces: 1, patchCrystals: 1 },
} as const;
