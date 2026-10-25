import * as THREE from 'three';
import type { PixelShape } from '../../content/projectile-recipes';

const SHAPES: Record<PixelShape, number> = { flame: 0, leaf: 1, shard: 2, star: 3, streak: 4, bubble: 5, droplet: 6,
  crystal: 7, snowflake: 8, seed: 9 };

/** Shared code-native pixel silhouettes: one material and fixed buffers, no bitmap allocation. */
export class PixelBatch {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private tint: THREE.InstancedBufferAttribute;
  private shapes: THREE.InstancedBufferAttribute;
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  private ground = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  private rotation = new THREE.Quaternion();
  private axis = new THREE.Vector3(0, 0, 1);
  constructor(capacity: number, order: number) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.shapes = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('effectTint', this.tint); geometry.setAttribute('effectShape', this.shapes);
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false,
      vertexShader: `attribute vec4 effectTint; attribute float effectShape;
        varying vec4 vTint; varying float vShape; varying vec2 vPixelUV;
        void main() {
          vTint = effectTint; vShape = effectShape; vPixelUV = uv;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec4 vTint; varying float vShape; varying vec2 vPixelUV;
        void main() {
          vec2 p = (floor(vPixelUV * 16.0) + .5) / 16.0 - .5;
          float mask = 0.0; float core = 0.0;
          if (vShape < .5) {
            float width = .32 - p.x * .36;
            mask = step(abs(p.y), width) * step(-.44, p.x) * step(p.x, .44);
            core = step(abs(p.y), .13 - p.x * .12) * step(-.2, p.x);
          } else if (vShape < 1.5) {
            mask = step(abs(p.y + p.x * .18), .31 * (1.0 - abs(p.x) * 2.0));
            core = step(abs(p.y + p.x * .18), .045);
          } else if (vShape < 2.5) {
            mask = step(abs(p.x) * .65 + abs(p.y), .32); core = step(abs(p.x) + abs(p.y), .13);
          } else if (vShape < 3.5) {
            mask = max(step(abs(p.x), .07) * step(abs(p.y), .43), step(abs(p.y), .07) * step(abs(p.x), .43));
            core = step(abs(p.x) + abs(p.y), .15);
          } else if (vShape < 4.5) {
            mask = step(abs(p.y), .32 * (1.0 - abs(p.x) * 1.4));
            core = step(abs(p.y), .08);
          } else if (vShape < 5.5) {
            float r = length(p);
            mask = step(.31, r) * step(r, .45);
            core = step(-p.x, -.12) * step(.12, p.y);
          } else if (vShape < 6.5) {
            float width = .25 * (1.0 - p.y) - max(0.0, p.y) * .5;
            mask = step(abs(p.x), width) * step(-.35, p.y) * step(p.y, .42);
            core = step(abs(p.x + .06), .06) * step(p.y, .1);
          } else if (vShape < 7.5) {
            mask = step(abs(p.x) + abs(p.y) * .7, .44);
            core = step(abs(p.y + p.x * .12), .05);
          } else if (vShape < 8.5) {
            float a = abs(p.x), b = abs(.5 * p.x + .866025 * p.y), c = abs(.5 * p.x - .866025 * p.y);
            mask = max(step(a, .04), max(step(b, .04), step(c, .04))) * step(length(p), .43);
            core = step(length(p), .14);
          } else {
            float grain = length((p - vec2(.08, 0.0)) * vec2(1.0, 1.5));
            float petalA = length((p + vec2(.20, .17)) * vec2(1.3, 1.0));
            float petalB = length((p + vec2(.20, -.17)) * vec2(1.3, 1.0));
            mask = max(step(grain, .31), max(step(petalA, .20), step(petalB, .20)));
            core = step(grain, .13);
          }
          float alpha = vTint.a * mask; if (alpha < .025) discard;
          gl_FragColor = vec4(mix(vTint.rgb, vec3(1.0), core * .48), alpha);
          #include <colorspace_fragment>
        }`,
    });
    material.forceSinglePass = true;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = order;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  begin() { this.mesh.count = 0; }
  put(shape: PixelShape, x: number, y: number, z: number, width: number, depth: number, color: string, alpha: number, angle = 0) {
    const index = this.mesh.count;
    if (index >= this.mesh.instanceMatrix.count || width <= 0 || depth <= 0 || alpha <= 0) return;
    this.pose.position.set(x, y, z); this.pose.scale.set(width, depth, 1);
    this.pose.quaternion.copy(this.ground).multiply(this.rotation.setFromAxisAngle(this.axis, angle));
    this.pose.updateMatrix(); this.mesh.setMatrixAt(index, this.pose.matrix);
    this.color.set(color); this.tint.setXYZW(index, this.color.r, this.color.g, this.color.b, alpha);
    this.shapes.setX(index, SHAPES[shape]); this.mesh.count++;
  }
  finish() {
    if (!this.mesh.count) return;
    this.mesh.instanceMatrix.needsUpdate = true; this.tint.needsUpdate = true; this.shapes.needsUpdate = true;
  }
}
