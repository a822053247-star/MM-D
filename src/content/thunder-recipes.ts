/** Appearance only; hit timing, endpoints, targets and attenuation belong to ThunderWeapon. */
export const THUNDER_PRESENTATION = {
  color: '#ffe26b', core: '#fff5c5', halo: '#c7a6ff',
  height: .58, width: .065, jitter: .14, segments: 8,
  chargeRadius: .34, impactSpread: .6,
} as const;
export const THUNDER_DECORATION = {
  full: { halo: true, impactPieces: 3 },
  reduced: { halo: false, impactPieces: 1 },
} as const;
