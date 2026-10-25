import type { PresentedProjectile } from '../core/projectile-presentation';

export type ProjectileDetail = 'full' | 'reduced';
export type PixelShape = 'flame' | 'leaf' | 'shard' | 'star' | 'streak' | 'bubble' | 'droplet' | 'crystal' | 'snowflake' | 'seed';
export interface ProjectileRecipe {
  body: PixelShape | 'dream-atlas'; color: string; core: string;
  width: number; depth: number; height: number;
  trail: { color: string; width: number; length: number; duration: number; opacity: number };
  impact: { shape: PixelShape; flash: PixelShape; color: string; duration: number; pieces: number; spread: number };
  expire: { shape: PixelShape; duration: number; size: number };
}

/** Sizes are presentation parameters; collision and travel speed remain in Combat. */
export const PROJECTILE_RECIPES: Readonly<Record<PresentedProjectile, ProjectileRecipe>> = {
  'resonance-seed': { body: 'seed', color: '#e8a0e3', core: '#fff0fa', width: 1.02, depth: .68, height: .36,
    trail: { color: '#d6b5ef', width: .11, length: 1.05, duration: .15, opacity: .4 },
    impact: { shape: 'leaf', flash: 'bubble', color: '#f9c8ef', duration: .27, pieces: 4, spread: .56 },
    expire: { shape: 'seed', duration: .22, size: .38 } },
  'frost-crystal': { body: 'crystal', color: '#9de5ff', core: '#f0fdff', width: .96, depth: .42, height: .48,
    trail: { color: '#bcefff', width: .09, length: .9, duration: .12, opacity: .4 },
    impact: { shape: 'crystal', flash: 'snowflake', color: '#caf4ff', duration: .24, pieces: 4, spread: .55 },
    expire: { shape: 'crystal', duration: .2, size: .34 } },
  bubble: { body: 'bubble', color: '#55c9ed', core: '#d8faff', width: .82, depth: .82, height: .5,
    trail: { color: '#80dce9', width: .1, length: .8, duration: .14, opacity: .34 },
    impact: { shape: 'droplet', flash: 'bubble', color: '#9de8ff', duration: .25, pieces: 5, spread: .6 },
    expire: { shape: 'bubble', duration: .2, size: .42 } },
  spark: { body: 'flame', color: '#ff9849', core: '#fff1b3', width: .85, depth: .5, height: .55,
    trail: { color: '#ff9849', width: .16, length: 1.1, duration: .14, opacity: .52 },
    impact: { shape: 'shard', flash: 'star', color: '#ffbd64', duration: .2, pieces: 5, spread: .65 },
    expire: { shape: 'shard', duration: .16, size: .32 } },
  leaf: { body: 'leaf', color: '#83d66b', core: '#e4ffb3', width: .9, depth: .4, height: .5,
    trail: { color: '#9fdc83', width: .09, length: .85, duration: .12, opacity: .36 },
    impact: { shape: 'leaf', flash: 'star', color: '#a8e975', duration: .26, pieces: 4, spread: .6 },
    expire: { shape: 'leaf', duration: .2, size: .28 } },
  'dream-dart': { body: 'dream-atlas', color: '#ef9bcf', core: '#ffe0fa', width: 1.65, depth: 1.1, height: .32,
    trail: { color: '#e9adea', width: .12, length: 1.2, duration: .16, opacity: .4 },
    impact: { shape: 'star', flash: 'star', color: '#ffc7f0', duration: .28, pieces: 5, spread: .72 },
    expire: { shape: 'star', duration: .22, size: .36 } },
};

export const PROJECTILE_DECORATION = {
  full: { trailSegments: 5, impactPieces: 5, halo: true },
  reduced: { trailSegments: 2, impactPieces: 2, halo: false },
} as const;
