/** Presentation parameters only. Footprints, lane motion and damage belong to AreaAttacks. */
export const AREA_ATTACK_PRESENTATION = {
  nova: { color: '#ffcd88', core: '#fff0c5', height: .052, fullFlash: .085, reducedFlash: .03 },
  barrage: { color: '#efcd86', core: '#fff6cd', trail: '#d0e8ff', height: .43,
    width: .62, depth: .37, trailLength: 1.35, trailWidth: .1, trailDuration: .13 },
} as const;
export const AREA_ATTACK_DECORATION = {
  full: { trailSegments: 5, feedbackPieces: 3, corners: true },
  reduced: { trailSegments: 2, feedbackPieces: 1, corners: false },
} as const;
