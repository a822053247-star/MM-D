import * as THREE from 'three';
import { COMBAT_LIMITS, type Combat } from './core/combat';
import { DREAM_RULES } from './core/dream-combat';
import { EFFECT_ATLASES } from './content/effect-recipes';
import { DREAM_PRESENTATION as STYLE, DREAM_DECORATION } from './content/dream-recipes';
import type { ProjectileDetail } from './content/projectile-recipes';
import type { EffectAssets } from './assets/effect-assets';
import { AtlasBatch } from './render/vfx/atlas-batch';
import { AreaBatch } from './render/vfx/area-batch';
import { PixelBatch } from './render/vfx/pixel-batch';
import { StripBatch } from './render/vfx/strip-batch';

/** Dream/resonance marks, original blossom frames and actual resolved death-transfer links. */
export class DreamVfx {
  readonly group = new THREE.Group();
  private flowers = new AtlasBatch(EFFECT_ATLASES['dream-bloom'], DREAM_RULES.effects, 'flower');
  private ranges = new AreaBatch(DREAM_RULES.effects, 2);
  private links = new StripBatch(DREAM_RULES.effects * 2);
  private endpoints = new PixelBatch(DREAM_RULES.effects * 2, 4);
  private marks = new PixelBatch(COMBAT_LIMITS.enemies * 5, 5);
  private detail: ProjectileDetail = 'full';
  private transferLinks = 0;
  private dreamMarks = 0;
  private resonanceMarks = 0;
  constructor(private assets: EffectAssets) {
    this.group.add(this.ranges.mesh, this.flowers.mesh, this.links.mesh, this.endpoints.mesh, this.marks.mesh);
  }
  setDetail(detail: ProjectileDetail) { this.detail = detail; }
  reset() {
    this.flowers.begin(); this.ranges.begin(); this.links.begin(); this.endpoints.begin(); this.marks.begin();
    this.transferLinks = this.dreamMarks = this.resonanceMarks = 0;
  }
  update(combat: Combat, visible: boolean) {
    this.reset(); this.group.visible = visible;
    this.flowers.setTexture(this.assets.texture('dream-bloom'));
    if (!visible) return;
    const quality = DREAM_DECORATION[this.detail];
    for (const event of combat.dream.events) {
      if (!event.active) continue;
      const progress = Math.max(0, Math.min(1, event.age / event.duration));
      const fade = (1 - progress) ** 2;
      if (event.kind === 'bloom' || event.kind === 'pulse') {
        // Preserve the existing eight frames, relative sizing and alpha progression.
        const size = event.radius * 2.05 * (event.kind === 'pulse' ? 1 : .88);
        this.flowers.put(Math.min(7, Math.floor(progress * 8)), event.x, .18, event.z,
          size, size, Math.min(1, (1 - progress) * 3) * .86);
        this.ranges.put(event.x, event.z, event.radius, Math.max(0, event.radius - .05), STYLE.mark, .32 * fade, .065);
      } else if (event.kind === 'link') {
        if (quality.linkGlow) this.links.put(event.x, event.z, event.tx, event.tz,
          STYLE.linkWidth * 2.8, STYLE.resonance, .16 * fade, STYLE.linkHeight - .004);
        this.links.put(event.x, event.z, event.tx, event.tz, STYLE.linkWidth, STYLE.link, .88 * fade, STYLE.linkHeight);
        this.endpoints.put('star', event.tx, STYLE.linkHeight + .01, event.tz, .28, .28, STYLE.core, fade);
        if (quality.sourceFlare) this.endpoints.put('seed', event.x, STYLE.linkHeight, event.z, .25, .2, STYLE.resonance, fade * .6);
        this.transferLinks++;
      }
      // Ordinary dart/seed contacts are drawn once by ProjectileVfx from actual swept contacts.
    }
    for (const enemy of combat.enemies) {
      if (!enemy.active || enemy.spawnTime > 0) continue;
      const height = enemy.rank === 'boss' ? 6.8 : enemy.rank === 'elite' ? 3.9 : enemy.kind === 'tank' ? 3.4 : 2.6;
      if ((enemy.dreamTime ?? 0) > 0) {
        const count = Math.max(0, Math.min(3, enemy.dreamStacks ?? 0));
        for (let i = 0; i < count; i++) this.marks.put('star', enemy.x + (i - (count - 1) / 2) * .24,
          height, enemy.z, .17, .17, STYLE.mark, .93);
        this.dreamMarks += count;
      }
      if ((enemy.resonanceTime ?? 0) > 0) {
        const y = height + .29;
        const alpha = .65 + .25 * Math.min(1, enemy.resonanceTime! / DREAM_RULES.resonanceCap);
        this.marks.put('bubble', enemy.x, y, enemy.z, .34, .34, STYLE.resonance, alpha);
        this.marks.put('seed', enemy.x, y + .004, enemy.z, .21, .16, STYLE.core, .95);
        this.resonanceMarks++;
      }
    }
    this.flowers.finish(); this.ranges.finish(); this.links.finish(); this.endpoints.finish(); this.marks.finish();
  }
  inspect() {
    return { detail: this.detail, bloomInstances: this.flowers.mesh.count, rangeInstances: this.ranges.mesh.count,
      transferLinks: this.transferLinks, linkInstances: this.links.mesh.count, endpointInstances: this.endpoints.mesh.count,
      dreamMarks: this.dreamMarks, resonanceMarks: this.resonanceMarks, markInstances: this.marks.mesh.count,
      markCapacity: this.marks.mesh.instanceMatrix.count };
  }
}
