import * as THREE from 'three';
import { PixelBatch } from './pixel-batch';
import { THUNDER_PRESENTATION as STYLE } from '../../content/thunder-recipes';

/** Fixed zigzag segments join actual link endpoints. No target selection or collision code. */
export class LightningBatch {
  readonly group = new THREE.Group();
  private cores: PixelBatch;
  private halos: PixelBatch;
  constructor(linkCapacity: number) {
    this.cores = new PixelBatch(linkCapacity * STYLE.segments, 5);
    this.halos = new PixelBatch(linkCapacity * STYLE.segments, 4);
    this.group.add(this.halos.mesh, this.cores.mesh);
  }
  begin() { this.cores.begin(); this.halos.begin(); }
  put(x: number, z: number, tx: number, tz: number, alpha: number, variant: number, halo: boolean) {
    const dx = tx - x, dz = tz - z, distance = Math.hypot(dx, dz);
    if (distance < .001) {
      this.cores.put('star', x, STYLE.height, z, .24, .24, STYLE.core, alpha); return;
    }
    const nx = -dz / distance, nz = dx / distance;
    const jitter = Math.min(STYLE.jitter, distance * .12);
    let ax = x, az = z;
    for (let i = 1; i <= STYLE.segments; i++) {
      const t = i / STYLE.segments;
      const offset = i === STYLE.segments ? 0 : ((i + variant) % 2 ? 1 : -1)
        * jitter * Math.sin(t * Math.PI) * (1 + ((i + variant) % 3) * .12);
      const bx = x + dx * t + nx * offset, bz = z + dz * t + nz * offset;
      const sx = bx - ax, sz = bz - az, length = Math.hypot(sx, sz), angle = -Math.atan2(sz, sx);
      if (halo) this.halos.put('streak', (ax + bx) / 2, STYLE.height - .008, (az + bz) / 2,
        length * 1.12, STYLE.width * 3.1, STYLE.halo, alpha * .18, angle);
      this.cores.put('streak', (ax + bx) / 2, STYLE.height, (az + bz) / 2,
        length * 1.12, STYLE.width, STYLE.core, alpha, angle);
      ax = bx; az = bz;
    }
  }
  finish() { this.cores.finish(); this.halos.finish(); }
  inspect() { return { coreSegments: this.cores.mesh.count, haloSegments: this.halos.mesh.count }; }
}
