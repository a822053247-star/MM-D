import * as THREE from 'three';
import { PIXEL_VFX } from './pixel-vfx-manifest';
import { assetPath } from './assets';
import { ICE_LIMITS } from './core/ice-skills';
import { DREAM_RULES } from './core/dream-combat';
import { COMBAT_LIMITS } from './core/combat';
import type { FirstRun } from './model';
import type { DouyinPlatform } from './platform';

type AtlasId = keyof typeof PIXEL_VFX;
type AtlasSpec = { url: string; width: number; height: number; frames: readonly { rect: readonly number[] }[] };
function dependencies(skill: string): readonly AtlasId[] {
  return skill === 'shatter-ring' ? ['ice-ring'] : skill === 'dream-dart-weapon' ? ['dream-dart', 'dream-bloom']
    : skill === 'sakura-echo' ? ['dream-bloom'] : [];
}

/** One mesh, material, texture and bounded instance buffer per effect type. */
class AtlasBatch {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private rects: THREE.InstancedBufferAttribute;
  private alphas: THREE.InstancedBufferAttribute;
  private masks: THREE.InstancedBufferAttribute;
  private pose = new THREE.Object3D();
  private rotation = new THREE.Quaternion();
  private axis = new THREE.Vector3(0, 0, 1);
  private ground = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  loaded = false;
  constructor(private spec: AtlasSpec, count: number, kind: 'ice' | 'flower' | 'dart') {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.rects = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4);
    this.alphas = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    this.masks = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
    for (const attribute of [this.rects, this.alphas, this.masks]) attribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('effectRect', this.rects); geometry.setAttribute('effectAlpha', this.alphas); geometry.setAttribute('effectHole', this.masks);
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false, alphaTest: kind === 'dart' ? .14 : .02 });
    material.forceSinglePass = true;
    material.onBeforeCompile = shader => {
      shader.vertexShader = 'attribute vec4 effectRect; attribute float effectAlpha; attribute float effectHole; varying float vEffectAlpha; varying float vEffectHole; varying vec2 vEffectUV;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        vEffectAlpha = effectAlpha; vEffectHole = effectHole; vEffectUV = uv;
        #ifdef USE_MAP
          vMapUv = effectRect.xy + uv * effectRect.zw;
        #endif`);
      shader.fragmentShader = 'varying float vEffectAlpha; varying float vEffectHole; varying vec2 vEffectUV;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        diffuseColor.a *= vEffectAlpha;
        ${kind === 'ice' ? `float radius = length(vEffectUV - vec2(.5));
          diffuseColor.a *= smoothstep(vEffectHole, vEffectHole + .025, radius)
            * (1.0 - smoothstep(.47, .5, radius))
            * smoothstep(.18, .42, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));` : `float edge = min(min(vEffectUV.x, 1.0 - vEffectUV.x), min(vEffectUV.y, 1.0 - vEffectUV.y));
          diffuseColor.a *= smoothstep(0.0, .075, edge);
          ${kind === 'flower' ? 'diffuseColor.a *= mix(.68, 1.0, smoothstep(.10, .30, length(vEffectUV - vec2(.5))));' : ''}`}
        #include <alphatest_fragment>`);
    };
    material.customProgramCacheKey = () => `pixel-skill-vfx-${kind}-v1`;
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0;
    this.mesh.frustumCulled = false; this.mesh.renderOrder = kind === 'dart' ? 5 : 3;
  }
  setTexture(texture: THREE.Texture) { this.mesh.material.map = texture; this.mesh.material.needsUpdate = true; this.loaded = true; }
  begin() { this.mesh.count = 0; }
  put(frame: number, x: number, y: number, z: number, width: number, depth: number, alpha: number, angle = 0, hole = 0) {
    const index = this.mesh.count;
    if (!this.loaded || index >= this.mesh.instanceMatrix.count || alpha <= 0 || width <= 0 || depth <= 0) return;
    const [rx, ry, rw, rh] = this.spec.frames[Math.max(0, Math.min(this.spec.frames.length - 1, frame))].rect;
    this.pose.position.set(x, y, z); this.pose.scale.set(width, depth, 1);
    this.pose.quaternion.copy(this.ground).multiply(this.rotation.setFromAxisAngle(this.axis, angle));
    this.pose.updateMatrix(); this.mesh.setMatrixAt(index, this.pose.matrix);
    this.rects.setXYZW(index, rx / this.spec.width, 1 - (ry + rh) / this.spec.height, rw / this.spec.width, rh / this.spec.height);
    this.alphas.setX(index, alpha); this.masks.setX(index, hole); this.mesh.count++;
  }
  finish() {
    if (!this.mesh.count) return;
    this.mesh.instanceMatrix.needsUpdate = true; this.rects.needsUpdate = true;
    this.alphas.needsUpdate = true; this.masks.needsUpdate = true;
  }
}

export class SkillVfx {
  readonly group = new THREE.Group();
  private ice = new AtlasBatch(PIXEL_VFX['ice-ring'], ICE_LIMITS.rings, 'ice');
  private flowers = new AtlasBatch(PIXEL_VFX['dream-bloom'], DREAM_RULES.effects, 'flower');
  private darts = new AtlasBatch(PIXEL_VFX['dream-dart'], COMBAT_LIMITS.projectiles, 'dart');
  private batches: Record<AtlasId, AtlasBatch> = { 'ice-ring': this.ice, 'dream-bloom': this.flowers, 'dream-dart': this.darts };
  private loads = new Map<AtlasId, Promise<void>>();
  private marks = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: '#ffc1ec', toneMapped: false }), 1024);
  private pose = new THREE.Object3D();
  constructor(private platform: DouyinPlatform) {
    this.group.add(this.ice.mesh, this.flowers.mesh, this.darts.mesh, this.marks);
    this.marks.count = 0; this.marks.frustumCulled = false; this.marks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  ready(skill: string) { return dependencies(skill).every(id => this.batches[id].loaded); }
  prepare(skills: readonly string[]) {
    const ids = new Set(skills.flatMap(skill => [...dependencies(skill)]));
    return Promise.all([...ids].map(id => {
      if (this.batches[id].loaded) return Promise.resolve();
      const pending = this.loads.get(id); if (pending) return pending;
      const request = this.platform.image(assetPath(PIXEL_VFX[id].url)).then(image => {
        const texture = new THREE.Texture(image); texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
        this.batches[id].setTexture(texture);
      }).finally(() => this.loads.delete(id));
      this.loads.set(id, request); return request;
    })).then(() => undefined);
  }
  update(model: FirstRun) {
    for (const batch of Object.values(this.batches)) batch.begin(); this.marks.count = 0;
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
    for (const shot of c.projectiles) {
      if (!shot.active || shot.attackId !== 'dream-dart') continue;
      const scale = c.projectileRadius(shot) / .2;
      this.darts.put(Math.floor((shot.age ?? 0) * 10) % 4, shot.x, .32, shot.z, 1.65 * scale, 1.1 * scale, .96, -Math.atan2(shot.vz, shot.vx));
    }
    for (const event of c.dream.events) {
      if (!event.active) continue;
      const progress = Math.max(0, Math.min(1, event.age / event.duration));
      if (event.kind === 'bloom' || event.kind === 'pulse') {
        const size = event.radius * 2.05 * (event.kind === 'pulse' ? 1 : .88);
        this.flowers.put(Math.min(7, Math.floor(progress * 8)), event.x, .18, event.z, size, size, Math.min(1, (1 - progress) * 3) * .86);
      } else if (event.kind === 'impact') {
        for (let i = 0; i < 3; i++) {
          const angle = i / 3 * Math.PI * 2 + event.seed;
          this.mark(event.x + Math.cos(angle) * progress * .4, .5 + progress * .3, event.z + Math.sin(angle) * progress * .4, .09 * (1 - progress));
        }
      }
    }
    for (const enemy of c.enemies) {
      if (!enemy.active || !(enemy.dreamTime! > 0)) continue;
      const height = enemy.rank === 'boss' ? 4.8 : enemy.rank === 'elite' ? 3.2 : enemy.kind === 'tank' ? 2.8 : 2.1;
      const count = Math.min(3, enemy.dreamStacks ?? 0);
      for (let i = 0; i < count; i++) this.mark(enemy.x + (i - (count - 1) / 2) * .25, height, enemy.z, .1);
    }
    for (const batch of Object.values(this.batches)) batch.finish();
    this.marks.instanceMatrix.needsUpdate = true;
  }
  private mark(x: number, y: number, z: number, size: number) {
    if (this.marks.count >= this.marks.instanceMatrix.count || size <= 0) return;
    this.pose.position.set(x, y, z); this.pose.rotation.set(0, 0, 0); this.pose.scale.set(size, size * 1.4, size);
    this.pose.updateMatrix(); this.marks.setMatrixAt(this.marks.count++, this.pose.matrix);
  }
  inspect() { return { loaded: Object.keys(this.batches).filter(id => this.batches[id as AtlasId].loaded), pending: this.loads.size,
    iceInstances: this.ice.mesh.count, bloomInstances: this.flowers.mesh.count, dartInstances: this.darts.mesh.count, marks: this.marks.count }; }
}
