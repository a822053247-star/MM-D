import * as THREE from 'three';
import { EFFECT_ATLASES, EFFECT_RECIPES } from './content/effect-recipes';
import { AtlasBatch } from './render/vfx/atlas-batch';
import type { EffectAssets } from './assets/effect-assets';
import { ICE_LIMITS } from './core/ice-skills';
import type { FirstRun } from './model';

export class SkillVfx {
  readonly group = new THREE.Group();
  private ice = new AtlasBatch(EFFECT_ATLASES['ice-ring'], ICE_LIMITS.rings, EFFECT_RECIPES['shatter-ring'].appearance);
  constructor(private assets: EffectAssets) {
    this.group.add(this.ice.mesh);
  }
  update(model: FirstRun) {
    this.ice.setTexture(this.assets.texture('ice-ring')); this.ice.begin();
    this.group.visible = !!model.run && model.mode !== 'menu';
    if (!this.group.visible) return;
    const c = model.combat;
    for (const ring of c.iceSkills.rings) {
      if (!ring.active || ring.waveRadius <= 0) continue;
      const frame = Math.min(5, Math.floor(ring.age / .1));
      const extent = [.26, .36, .46, .49, .46, .44][frame];
      const hole = [.06, .115, .185, .235, .265, .265][frame];
      const size = ring.waveRadius / extent;
      this.ice.put(frame, ring.x, .16, ring.z, size, size, .92 * Math.min(1, (ring.duration - ring.age) / .14), 0, hole);
    }
    this.ice.finish();
  }
  inspect() { return { ...this.assets.inspect(),
    iceInstances: this.ice.mesh.count }; }
}
