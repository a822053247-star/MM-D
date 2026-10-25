import * as THREE from 'three';

/** Ground disks/annuli use world-space outer and inner radii supplied by simulation. */
export class AreaBatch {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private bands: THREE.InstancedBufferAttribute;
  private tints: THREE.InstancedBufferAttribute;
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  constructor(capacity: number, order = 1) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.bands = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
    this.tints = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('effectBand', this.bands); geometry.setAttribute('effectTint', this.tints);
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `attribute vec2 effectBand; attribute vec4 effectTint;
        varying vec2 vAreaUV; varying vec2 vBand; varying vec4 vTint;
        void main() {
          vAreaUV = uv; vBand = effectBand; vTint = effectTint;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec2 vAreaUV; varying vec2 vBand; varying vec4 vTint;
        void main() {
          float radius = length((vAreaUV - .5) * 2.0);
          float mask = 1.0 - smoothstep(1.0 - vBand.y, 1.0, radius);
          if (vBand.x > 0.0) mask *= smoothstep(vBand.x, min(1.0, vBand.x + vBand.y), radius);
          float alpha = vTint.a * mask; if (alpha < .008) discard;
          gl_FragColor = vec4(vTint.rgb, alpha);
          #include <colorspace_fragment>
        }`,
    });
    material.forceSinglePass = true;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.pose.rotation.x = -Math.PI / 2;
  }
  begin() { this.mesh.count = 0; }
  put(x: number, z: number, outer: number, inner: number, color: string, alpha: number, height = .045) {
    const index = this.mesh.count;
    if (index >= this.mesh.instanceMatrix.count || outer <= 0 || inner >= outer || alpha <= 0) return;
    this.pose.position.set(x, height, z); this.pose.scale.set(outer * 2, outer * 2, 1);
    this.pose.updateMatrix(); this.mesh.setMatrixAt(index, this.pose.matrix);
    this.bands.setXY(index, Math.max(0, inner / outer), Math.min(.035, .025 / outer));
    this.color.set(color); this.tints.setXYZW(index, this.color.r, this.color.g, this.color.b, alpha);
    this.mesh.count++;
  }
  finish() {
    if (!this.mesh.count) return;
    this.mesh.instanceMatrix.needsUpdate = true; this.bands.needsUpdate = true; this.tints.needsUpdate = true;
  }
}
