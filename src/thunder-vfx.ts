import * as THREE from 'three';
import type { Combat } from './core/combat';
import { THUNDER_LIMITS } from './core/thunder-weapon';
import { THUNDER_PRESENTATION as STYLE, THUNDER_DECORATION } from './content/thunder-recipes';
import type { ProjectileDetail } from './content/projectile-recipes';
import { AreaBatch } from './render/vfx/area-batch';
import { PixelBatch } from './render/vfx/pixel-batch';
import { LightningBatch } from './render/vfx/lightning-batch';

/** Draws the original charge/links/impact pools, using their own fixed-step ages. */
export class ThunderVfx {
  readonly group = new THREE.Group();
  private lightning = new LightningBatch(THUNDER_LIMITS.links);
  private nodes = new PixelBatch(THUNDER_LIMITS.impacts * 4 + THUNDER_LIMITS.casts * 2, 5);
  private charges = new AreaBatch(THUNDER_LIMITS.casts, 2);
  private detail: ProjectileDetail = 'full';
  private linkCount = 0;
  constructor() { this.group.add(this.charges.mesh, this.lightning.group, this.nodes.mesh); }
  setDetail(detail: ProjectileDetail) { this.detail = detail; }
  reset() { this.lightning.begin(); this.nodes.begin(); this.charges.begin(); this.linkCount = 0; }
  update(combat: Combat, visible: boolean) {
    this.reset(); this.group.visible = visible;
    if (!visible) return;
    const quality = THUNDER_DECORATION[this.detail];
    for (const cast of combat.thunder.casts) {
      if (!cast.active) continue;
      const first = cast.hops === 0;
      const progress = first ? Math.min(1, cast.age / THUNDER_LIMITS.warning)
        : Math.max(0, Math.min(1, 1 - (cast.nextAt - cast.age) / THUNDER_LIMITS.hopDelay));
      // The first target may become invalid before firing: charge only marks the actual source.
      const size = first ? .28 + progress * .24 : .22 + progress * .1;
      this.nodes.put('star', cast.x, STYLE.height, cast.z, size, size, STYLE.color, .72 + progress * .25, cast.age * 4);
      if (first) {
        const radius = STYLE.chargeRadius * (.55 + progress * .45);
        this.charges.put(cast.x, cast.z, radius, Math.max(0, radius - .045), STYLE.color, .6);
        this.nodes.put('shard', cast.x + Math.cos(cast.age * 10) * radius, STYLE.height, cast.z + Math.sin(cast.age * 10) * radius,
          .13, .2, STYLE.core, .8, -cast.age * 10);
      }
    }
    for (const link of combat.thunder.links) {
      if (!link.active) continue;
      const fade = Math.max(0, 1 - link.age / THUNDER_LIMITS.linkDuration);
      this.lightning.put(link.x, link.z, link.tx, link.tz, .95 * Math.sqrt(fade), link.variant, quality.halo);
      this.linkCount++;
    }
    for (const impact of combat.thunder.impacts) {
      if (!impact.active) continue;
      const progress = Math.min(1, impact.age / THUNDER_LIMITS.impactDuration), fade = (1 - progress) ** 2;
      const size = .46 * (1 + progress * .5);
      this.nodes.put('star', impact.x, STYLE.height + .02, impact.z, size, size, STYLE.core, fade, impact.age * 4);
      for (let i = 0; i < quality.impactPieces; i++) {
        const angle = i / quality.impactPieces * Math.PI * 2 + impact.enemyId * 2.399963;
        const distance = STYLE.impactSpread * progress, shard = .17 * (1 - progress * .5);
        this.nodes.put('shard', impact.x + Math.cos(angle) * distance, STYLE.height + .03,
          impact.z + Math.sin(angle) * distance, shard, shard * 1.6, STYLE.color, fade, angle);
      }
    }
    this.lightning.finish(); this.nodes.finish(); this.charges.finish();
  }
  inspect() {
    return { detail: this.detail, links: this.linkCount, ...this.lightning.inspect(),
      nodeInstances: this.nodes.mesh.count, chargeInstances: this.charges.mesh.count,
      linkCapacity: THUNDER_LIMITS.links, nodeCapacity: this.nodes.mesh.instanceMatrix.count };
  }
}
