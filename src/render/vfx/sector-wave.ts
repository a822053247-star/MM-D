import * as THREE from 'three';
import { EFFECT_ATLASES } from '../../content/effect-recipes';

interface SectorState {
  active: boolean; age: number; x: number; z: number; aimX: number; aimZ: number; angle: number; radius: number;
}

/** Flame geometry keeps its own UV mapping; the borrowed atlas is never mutated. */
export class SectorWave {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  private positions = new Float32Array(96 * 18);
  private uvs = new Float32Array(96 * 12);
  private texture?: THREE.Texture;
  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2).setUsage(THREE.DynamicDrawUsage));
    const material = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .94,
      side: THREE.DoubleSide, depthWrite: false, alphaTest: 2 / 255, forceSinglePass: true });
    material.onBeforeCompile = shader => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        float core = smoothstep(.36, .82, min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b)));
        diffuseColor.rgb *= mix(vec3(1.0), .7 * vec3(1.0, .84, .45), core);`);
    };
    material.customProgramCacheKey = () => 'compressed-flame-sector-v1';
    this.mesh = new THREE.Mesh(geometry, material); this.mesh.frustumCulled = false; this.mesh.visible = false;
  }
  begin(texture?: THREE.Texture) {
    this.texture = texture;
    const map = texture ?? null;
    if (this.mesh.material.map !== map) { this.mesh.material.map = map; this.mesh.material.needsUpdate = true; }
    this.mesh.visible = false;
  }
  put(melee: Readonly<SectorState>) {
    const spec = EFFECT_ATLASES['flame-sweep'], milliseconds = melee.age * 1000;
    const duration = spec.durationsMs.reduce((sum, ms) => sum + ms, 0);
    if (!this.texture || !melee.active || milliseconds >= duration) return;
    this.mesh.visible = true;
    let frame = 0, end = spec.durationsMs[0] as number;
    while (frame < spec.frames.length - 1 && milliseconds >= end) end += spec.durationsMs[++frame];
    const [x, y, width, height] = spec.frames[frame].rect;
    const u0 = x / spec.width, v0 = 1 - (y + height) / spec.height;
    const us = width / spec.width, vs = height / spec.height;
    this.mesh.material.opacity = .94 * (milliseconds <= 165 ? 1 : Math.pow(Math.max(0, (230 - milliseconds) / 65), 1.5));
    const facing = Math.atan2(melee.aimZ, melee.aimX), segments = 96;
    for (let i = 0; i < segments; i++) {
      const a = facing - melee.angle / 2 + i / segments * melee.angle, b = facing - melee.angle / 2 + (i + 1) / segments * melee.angle;
      for (let j = 0; j < 6; j++) {
        const angle = j === 2 || j === 4 || j === 5 ? b : a;
        const radius = j === 0 || j === 3 || j === 5 ? .12 : 1;
        const offset = (i * 6 + j) * 3, uv = (i * 6 + j) * 2;
        this.positions[offset] = melee.x + Math.cos(angle) * melee.radius * radius;
        this.positions[offset + 1] = .14;
        this.positions[offset + 2] = melee.z + Math.sin(angle) * melee.radius * radius;
        this.uvs[uv] = u0 + (.5 + Math.cos(angle - facing) * radius * .48) * us;
        this.uvs[uv + 1] = v0 + (.36 + Math.sin(angle - facing) * radius * .33) * vs;
      }
    }
  }
  finish() {
    if (!this.mesh.visible) return;
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.uv.needsUpdate = true;
  }
}
