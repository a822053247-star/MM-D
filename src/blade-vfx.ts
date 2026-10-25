import * as THREE from 'three';
import type { Combat } from './core/combat';
import { BLADE_LIMITS, type BladeId } from './core/blade-weapons';
import { BLADE_PRESENTATION as STYLES, BLADE_DECORATION } from './content/blade-recipes';
import type { ProjectileDetail } from './content/projectile-recipes';
import { BladeBatch } from './render/vfx/blade-batch';
import { PixelBatch } from './render/vfx/pixel-batch';
import { AreaBatch } from './render/vfx/area-batch';
import { PathHistory, PATH_POINTS } from './render/vfx/path-history';

const WHEEL_SLOTS = BLADE_LIMITS.wheels * 3;
const PATH_SLOTS = WHEEL_SLOTS + BLADE_LIMITS.tides;

/** Original wheel poses and returning casts stay essential; paths and debris are decoration. */
export class BladeVfx {
  readonly group = new THREE.Group();
  private bodies = new BladeBatch(PATH_SLOTS);
  private trails = new PixelBatch(PATH_SLOTS * (PATH_POINTS - 1), 3);
  private impacts = new PixelBatch(BLADE_LIMITS.impacts * 4 + BLADE_LIMITS.transitions, 4);
  private transitions = new AreaBatch(BLADE_LIMITS.transitions, 2);
  private history = new PathHistory(PATH_SLOTS);
  private identities = new Float64Array(PATH_SLOTS);
  private epoch = -1;
  private lastSample = -1;
  private detail: ProjectileDetail = 'full';
  constructor() { this.group.add(this.trails.mesh, this.bodies.mesh, this.impacts.mesh, this.transitions.mesh); }
  setDetail(detail: ProjectileDetail) { this.detail = detail; }
  reset() {
    this.bodies.begin(); this.trails.begin(); this.impacts.begin(); this.transitions.begin();
    this.history.reset(); this.lastSample = -1;
  }
  sample(combat: Combat) {
    if (this.epoch !== combat.blades.epoch) { this.reset(); this.epoch = combat.blades.epoch; }
    if (this.lastSample === combat.elapsed) return;
    this.lastSample = combat.elapsed;
    for (let slot = 0; slot < WHEEL_SLOTS; slot++) {
      const pose = combat.blades.wheels[slot];
      if (!pose?.active) { this.history.clear(slot); continue; }
      this.add(slot, pose.castId, pose.previousX, pose.previousZ, pose.x, pose.z, combat.elapsed);
    }
    let slot = WHEEL_SLOTS;
    for (const cast of combat.blades.casts) {
      if (cast.id !== 'tidal-blade') continue;
      if (!cast.active) this.history.clear(slot);
      else this.add(slot, cast.source?.rootId ?? 0, cast.previousX, cast.previousZ, cast.x, cast.z, combat.elapsed);
      slot++;
    }
  }
  private add(slot: number, identity: number, px: number, pz: number, x: number, z: number, time: number) {
    if (!this.history.count(slot) || this.identities[slot] !== identity) {
      this.history.clear(slot); this.history.add(slot, px, pz, time - BLADE_LIMITS.step);
    }
    this.identities[slot] = identity; this.history.add(slot, x, z, time);
  }
  update(combat: Combat, visible: boolean) {
    this.sample(combat);
    this.bodies.begin(); this.trails.begin(); this.impacts.begin(); this.transitions.begin();
    this.group.visible = visible;
    if (!visible) return;
    for (let slot = 0; slot < WHEEL_SLOTS; slot++) {
      const pose = combat.blades.wheels[slot];
      if (!pose?.active) continue;
      const style = STYLES['thorn-wheel'];
      this.bodies.put('thorn-wheel', pose.x, pose.z, pose.size, pose.angle, style.color, pose.copied ? .55 : .96, style.height);
      this.trail(slot, 'thorn-wheel', combat.elapsed, style.color);
    }
    let slot = WHEEL_SLOTS;
    for (const cast of combat.blades.casts) {
      if (cast.id !== 'tidal-blade') continue;
      if (cast.active) {
        const style = STYLES['tidal-blade'], color = cast.returning ? style.core : style.color;
        this.bodies.put('tidal-blade', cast.x, cast.z, cast.bladeRadius * 2, -cast.age * 5.5,
          color, cast.copied ? .55 : .96, style.height);
        this.trail(slot, 'tidal-blade', combat.elapsed, color);
      }
      slot++;
    }
    const quality = BLADE_DECORATION[this.detail];
    for (const event of combat.blades.impacts) {
      if (!event.active) continue;
      const style = STYLES[event.id], progress = Math.min(1, event.age / BLADE_LIMITS.impactDuration), fade = (1 - progress) ** 2;
      this.impacts.put('star', event.x, .26, event.z, .4, .4, style.core, fade, event.angle);
      for (let i = 0; i < quality.impactPieces; i++) {
        const angle = event.angle + i / quality.impactPieces * Math.PI * 2, distance = progress * .55;
        this.impacts.put(event.id === 'thorn-wheel' ? 'leaf' : 'droplet', event.x + Math.cos(angle) * distance,
          .24 + Math.sin(progress * Math.PI) * .1, event.z + Math.sin(angle) * distance,
          .25 * (1 - progress * .6), .15, style.impact, fade, angle);
      }
    }
    for (const event of combat.blades.transitions) {
      if (!event.active) continue;
      const progress = Math.min(1, event.age / BLADE_LIMITS.transitionDuration), fade = (1 - progress) ** 2;
      const style = STYLES['tidal-blade'];
      if (event.kind === 'expire') this.impacts.put('droplet', event.x, .2, event.z,
        .35 * (1 - progress * .5), .35 * (1 - progress * .5), style.color, fade);
      else {
        const radius = Math.max(.16, event.size * .3) * (event.kind === 'recover' ? 1 - progress * .6 : 1 + progress * .5);
        this.transitions.put(event.x, event.z, radius, Math.max(0, radius - .055), style.core, fade * .7, .08);
      }
    }
    this.bodies.finish(); this.trails.finish(); this.impacts.finish(); this.transitions.finish();
  }
  private trail(slot: number, id: BladeId, time: number, color: string) {
    const style = STYLES[id], count = Math.min(this.history.count(slot) - 1, BLADE_DECORATION[this.detail].trailSegments);
    let total = 0;
    for (let i = 0; i < count; i++) {
      const ax = this.history.x(slot, i), az = this.history.z(slot, i);
      const bx = this.history.x(slot, i + 1), bz = this.history.z(slot, i + 1);
      const age = Math.max(0, time - this.history.time(slot, i + 1));
      if (age >= .14) break;
      const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
      if (length < .001) continue;
      if (total + length > style.trailLength) break;
      total += length;
      const fade = (1 - age / .14) * (1 - i / PATH_POINTS);
      this.trails.put('streak', (ax + bx) / 2, style.height - .015, (az + bz) / 2,
        length * 1.1, style.trailWidth * fade, color, .35 * fade, -Math.atan2(dz, dx));
    }
  }
  inspect() {
    return { detail: this.detail, bodyInstances: this.bodies.mesh.count, trailInstances: this.trails.mesh.count,
      impactInstances: this.impacts.mesh.count, transitionInstances: this.transitions.mesh.count,
      bodyCapacity: PATH_SLOTS, transitionCapacity: BLADE_LIMITS.transitions };
  }
}
