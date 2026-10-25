import * as THREE from 'three';

/** Straight finite rectangles preserve beam widths, ends and the gaps between beams. */
export class StripBatch {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private specs: THREE.InstancedBufferAttribute;
  private tints: THREE.InstancedBufferAttribute;
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  private rotation = new THREE.Quaternion();
  private axis = new THREE.Vector3(0, 0, 1);
  private ground = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
  constructor(capacity: number) {
    const geometry = new THREE.PlaneGeometry(1, 1);
    this.specs = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.tints = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('effectStrip', this.specs); geometry.setAttribute('effectTint', this.tints);
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `attribute vec3 effectStrip; attribute vec4 effectTint;
        varying vec2 vStripPoint; varying vec3 vStrip; varying vec4 vTint;
        void main() {
          vStrip = effectStrip; vTint = effectTint; vStripPoint = (uv - .5) * effectStrip.xy;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec2 vStripPoint; varying vec3 vStrip; varying vec4 vTint;
        void main() {
          float edge = min(vStrip.x * .5 - abs(vStripPoint.x), vStrip.y * .5 - abs(vStripPoint.y));
          float mask = smoothstep(0.0, .01, edge);
          if (vStrip.z > 0.0) mask *= 1.0 - smoothstep(max(0.0, vStrip.z - .01), vStrip.z, edge);
          float alpha = vTint.a * mask; if (alpha < .008) discard;
          gl_FragColor = vec4(vTint.rgb, alpha);
          #include <colorspace_fragment>
        }`,
    });
    material.forceSinglePass = true;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 2;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  begin() { this.mesh.count = 0; }
  put(ax: number, az: number, bx: number, bz: number, width: number, color: string, alpha: number,
    height = .06, outline = false) {
    const index = this.mesh.count, dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
    if (index >= this.mesh.instanceMatrix.count || length <= 0 || width <= 0 || alpha <= 0) return;
    this.pose.position.set((ax + bx) / 2, height, (az + bz) / 2); this.pose.scale.set(length, width, 1);
    this.pose.quaternion.copy(this.ground).multiply(this.rotation.setFromAxisAngle(this.axis, -Math.atan2(dz, dx)));
    this.pose.updateMatrix(); this.mesh.setMatrixAt(index, this.pose.matrix);
    this.specs.setXYZ(index, length, width, outline ? .035 : 0);
    this.color.set(color); this.tints.setXYZW(index, this.color.r, this.color.g, this.color.b, alpha); this.mesh.count++;
  }
  finish() {
    if (!this.mesh.count) return;
    this.mesh.instanceMatrix.needsUpdate = true; this.specs.needsUpdate = true; this.tints.needsUpdate = true;
  }
}
