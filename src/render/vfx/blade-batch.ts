import * as THREE from 'three';
import type { BladeId } from '../../core/blade-weapons';

/** Two real blade silhouettes, with fixed per-instance color and pose buffers. */
export class BladeBatch {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private tints: THREE.InstancedBufferAttribute;
  private kinds: THREE.InstancedBufferAttribute;
  private color = new THREE.Color();
  private pose = new THREE.Object3D();
  private rotation = new THREE.Quaternion();
  private axis = new THREE.Vector3(0, 0, 1);
  private ground = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  constructor(capacity: number) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.tints = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.kinds = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('bladeTint', this.tints); geometry.setAttribute('bladeKind', this.kinds);
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `attribute vec4 bladeTint; attribute float bladeKind;
        varying vec2 vBladeUV; varying vec4 vTint; varying float vKind;
        void main() {
          vBladeUV = uv; vTint = bladeTint; vKind = bladeKind;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec2 vBladeUV; varying vec4 vTint; varying float vKind;
        void main() {
          vec2 p = (floor(vBladeUV * 32.0) + .5) / 32.0 - .5;
          float radius = length(p); float mask = 0.0; float core = 0.0;
          if (vKind < .5) {
            float tooth = step(.5, fract((atan(p.y, p.x) + 3.141593) / 6.283185 * 8.0));
            mask = step(.19, radius) * step(radius, .42 + .07 * tooth);
            core = step(.28, radius) * step(radius, .34);
          } else {
            float outside = length(p * vec2(1.0, 1.1));
            float inside = length(p - vec2(.17, 0.0));
            mask = step(outside, .48) * step(.36, inside);
            core = step(.4, outside) * step(outside, .45);
          }
          float alpha = vTint.a * mask; if (alpha < .025) discard;
          gl_FragColor = vec4(mix(vTint.rgb, vec3(1.0), core * .5), alpha);
          #include <colorspace_fragment>
        }`,
    });
    material.forceSinglePass = true;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  begin() { this.mesh.count = 0; }
  put(id: BladeId, x: number, z: number, size: number, angle: number, color: string, alpha: number, height: number) {
    const index = this.mesh.count;
    if (index >= this.mesh.instanceMatrix.count || size <= 0 || alpha <= 0) return;
    this.pose.position.set(x, height, z); this.pose.scale.set(size, size, 1);
    this.pose.quaternion.copy(this.ground).multiply(this.rotation.setFromAxisAngle(this.axis, angle));
    this.pose.updateMatrix(); this.mesh.setMatrixAt(index, this.pose.matrix);
    this.color.set(color); this.tints.setXYZW(index, this.color.r, this.color.g, this.color.b, alpha);
    this.kinds.setX(index, id === 'thorn-wheel' ? 0 : 1); this.mesh.count++;
  }
  finish() {
    if (!this.mesh.count) return;
    this.mesh.instanceMatrix.needsUpdate = true; this.tints.needsUpdate = true; this.kinds.needsUpdate = true;
  }
}
