import { VFX_ATLASES } from './vfx-atlas-manifest';
export const ASSETS = {
  walk: 'hero-walk.png', diagonal: 'hero-diagonal.png',
  normal: 'enemy-normal.png', fast: 'enemy-fast.png', tank: 'enemy-tank.png',
  menu: 'menu.png', music: 'grassland.ogg',
  crystal: 'enemy-crystal.png', spore: 'enemy-spore.png', treasure: 'enemy-treasure.png', boss: 'boss-idle.png',
  flame: VFX_ATLASES['flame-sweep'].url,
} as const;
export const assetPath = (file: string) => `first-play/${file}`;
