import * as THREE from 'three';

/** Capsule footprints match a straight half-length plus rounded radius, in world units. */
export class CapsuleBatch {
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
    geometry.setAttribute('effectCapsule', this.specs); geometry.setAttribute('effectTint', this.tints);
    const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
      vertexShader: `attribute vec3 effectCapsule; attribute vec4 effectTint;
        varying vec2 vCapsulePoint; varying vec3 vCapsule; varying vec4 vTint;
        void main() {
          vCapsule = effectCapsule; vTint = effectTint;
          vCapsulePoint = (uv - .5) * vec2(2.0 * (effectCapsule.x + effectCapsule.y), 2.0 * effectCapsule.y);
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `varying vec2 vCapsulePoint; varying vec3 vCapsule; varying vec4 vTint;
        void main() {
          float capsuleDistance = length(vec2(max(0.0, abs(vCapsulePoint.x) - vCapsule.x), vCapsulePoint.y));
          float mask = 1.0 - smoothstep(vCapsule.y - .015, vCapsule.y, capsuleDistance);
          if (vCapsule.z > 0.0) mask *= smoothstep(max(0.0, vCapsule.y - vCapsule.z),
            max(.001, vCapsule.y - vCapsule.z + .015), capsuleDistance);
          float alpha = vTint.a * mask; if (alpha < .008) discard;
          gl_FragColor = vec4(vTint.rgb, alpha);
          #include <colorspace_fragment>
        }`,
    });
    material.forceSinglePass = true;
    this.mesh = new THREE.InstancedMesh(geometry, material, capacity);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }
  begin() { this.mesh.count = 0; }
  put(x: number, z: number, halfLength: number, radius: number, angle: number,
    color: string, alpha: number, outline: boolean) {
    const index = this.mesh.count;
    if (index >= this.mesh.instanceMatrix.count || radius <= 0 || halfLength < 0 || alpha <= 0) return;
    this.pose.position.set(x, outline ? .047 : .04, z);
    this.pose.scale.set((halfLength + radius) * 2, radius * 2, 1);
    this.pose.quaternion.copy(this.ground).multiply(this.rotation.setFromAxisAngle(this.axis, -angle));
    this.pose.updateMatrix(); this.mesh.setMatrixAt(index, this.pose.matrix);
    this.specs.setXYZ(index, halfLength, radius, outline ? .045 : 0);
    this.color.set(color); this.tints.setXYZW(index, this.color.r, this.color.g, this.color.b, alpha);
    this.mesh.count++;
  }
  finish() {
    if (!this.mesh.count) return;
    this.mesh.instanceMatrix.needsUpdate = true; this.specs.needsUpdate = true; this.tints.needsUpdate = true;
  }
}
