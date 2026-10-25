import { PIXEL_VFX } from '../pixel-vfx-manifest.ts';
import { VFX_ATLASES } from '../vfx-atlas-manifest.ts';

/** Runtime and packager consume the same explicit atlas selection. */
export const EFFECT_ATLASES = {
  'flame-sweep': { ...VFX_ATLASES['flame-sweep'], source: 'resources/first-play/vfx/flame-sweep.png' },
  'ice-ring': PIXEL_VFX['ice-ring'],
  'dream-dart': PIXEL_VFX['dream-dart'],
  'dream-bloom': PIXEL_VFX['dream-bloom'],
} as const;
export type EffectAtlasId = keyof typeof EFFECT_ATLASES;
export type AtlasSpec = { width: number; height: number; frames: readonly { rect: readonly number[] }[] };

export const EFFECT_RECIPES = {
  'spark-projectile': { atlases: [], family: 'pixel', appearance: 'flame', essential: true },
  'leaf-projectile': { atlases: [], family: 'pixel', appearance: 'leaf', essential: true },
  'bubble-projectile': { atlases: [], family: 'pixel', appearance: 'bubble', essential: true },
  'azure-burst': { atlases: [], family: 'area', appearance: 'water-disk', essential: true },
  'star-tide': { atlases: [], family: 'area', appearance: 'water-waves', essential: true },
  'still-sea': { atlases: [], family: 'area', appearance: 'water-field', essential: true },
  'returning-ring': { atlases: [], family: 'area', appearance: 'water-aura', essential: true },
  'thunder-chain': { atlases: [], family: 'lightning', appearance: 'yellow-chain', essential: true },
  'frost-projectile': { atlases: [], family: 'pixel', appearance: 'ice-crystal', essential: true },
  'glacier-trail': { atlases: [], family: 'capsule', appearance: 'ice-patches', essential: true },
  'thorn-wheel': { atlases: [], family: 'blade', appearance: 'thorn-wheel', essential: true },
  'tidal-blade': { atlases: [], family: 'blade', appearance: 'tidal-crescent', essential: true },
  'abyss-vortex': { atlases: [], family: 'area', appearance: 'pull-field', essential: true },
  'ice-radiance': { atlases: [], family: 'strip-ring', appearance: 'gapped-rays', essential: true },
  'spore-trail': { atlases: [], family: 'area', appearance: 'spore-patches', essential: true },
  'tidal-recall': { atlases: [], family: 'area', appearance: 'returning-wave', essential: true },
  'screen-nova': { atlases: [], family: 'rectangle', appearance: 'viewport-nova', essential: true },
  'screen-barrage': { atlases: [], family: 'barrage', appearance: 'star-lanes', essential: true },
  'flame-sweep': { atlases: ['flame-sweep'], family: 'sector', appearance: 'flame', essential: true },
  'shatter-ring': { atlases: ['ice-ring'], family: 'atlas', appearance: 'ice', essential: true },
  'dream-dart': { atlases: ['dream-dart', 'dream-bloom'], family: 'atlas', appearance: 'dart', essential: true },
  'resonance-seed': { atlases: [], family: 'pixel-link', appearance: 'resonance-seed', essential: true },
  'sakura-echo': { atlases: ['dream-bloom'], family: 'atlas', appearance: 'flower', essential: true },
} as const satisfies Record<string, { atlases: readonly EffectAtlasId[]; family: string; appearance: string; essential: boolean }>;
export type EffectRecipeId = keyof typeof EFFECT_RECIPES;
export const EFFECT_TEXTURE_BUDGET_BYTES = 16 * 1024 * 1024;
