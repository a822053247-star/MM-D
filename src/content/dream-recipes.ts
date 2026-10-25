/** Timers and transfer targets are owned by DreamCombat; these values only style its output. */
export const DREAM_PRESENTATION = {
  mark: '#ffc1ec', resonance: '#d9b6fa', core: '#fff0fc',
  link: '#edb2ea', linkWidth: .075, linkHeight: .31,
} as const;
export const DREAM_DECORATION = {
  full: { linkGlow: true, sourceFlare: true },
  reduced: { linkGlow: false, sourceFlare: false },
} as const;
