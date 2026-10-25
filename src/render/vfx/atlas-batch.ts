import * as THREE from 'three';
import type { AtlasSpec } from '../../content/effect-recipes';

/** Owns geometry/material/buffers; borrows a texture owned by EffectAssets. */
export class AtlasBatch {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private rects: THREE.InstancedBufferAttribute;
  private alphas: THREE.InstancedBufferAttribute;
  private masks: THREE.InstancedBufferAttribute;
  private pose = new THREE.Object3D();
  private rotation = new THREE.Quaternion();
  private axis = new THREE.Vector3(0, 0, 1);
  private ground = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  loaded = false;
  constructor(private spec: AtlasSpec, count: number, kind: AtlasAppearance) {
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
        ${kind === 'ice' ? `float effectRadius = length(vEffectUV - vec2(.5));
          diffuseColor.a *= smoothstep(vEffectHole, vEffectHole + .025, effectRadius)
            * (1.0 - smoothstep(.47, .5, effectRadius))
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
  setTexture(texture?: THREE.Texture) {
    const map = texture ?? null;
    if (this.mesh.material.map !== map) { this.mesh.material.map = map; this.mesh.material.needsUpdate = true; }
    this.loaded = !!texture;
  }
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

export type AtlasAppearance = 'ice' | 'flower' | 'dart';
