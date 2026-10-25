import * as THREE from 'three';
import type { Combat } from './core/combat';
import { AREA_RULES, BARRAGE_RULES, AREA_FEEDBACK_LIMITS } from './core/area-attacks';
import { AREA_ATTACK_PRESENTATION as STYLES, AREA_ATTACK_DECORATION } from './content/area-attack-recipes';
import type { ProjectileDetail } from './content/projectile-recipes';
import { StripBatch } from './render/vfx/strip-batch';
import { PixelBatch } from './render/vfx/pixel-batch';
import { PathHistory, PATH_POINTS } from './render/vfx/path-history';

/** Nova rectangles and the separate 96-lane barrage pool, never inferred from rendered collisions. */
export class AreaAttackVfx {
  readonly group = new THREE.Group();
  private novas = new StripBatch(AREA_RULES.novaCapacity + AREA_RULES.visualCapacity);
  private bodies = new PixelBatch(BARRAGE_RULES.lanes * 2, 5);
  private trails = new PixelBatch(BARRAGE_RULES.lanes * (PATH_POINTS - 1), 3);
  private particles = new PixelBatch(AREA_FEEDBACK_LIMITS.events * 4 + AREA_RULES.novaCapacity * 5, 4);
  private history = new PathHistory(BARRAGE_RULES.lanes);
  private identities = new Float64Array(BARRAGE_RULES.lanes);
  private epoch = -1;
  private lastSample = -1;
  private detail: ProjectileDetail = 'full';
  private activeLanes = 0;
  private novaCount = 0;
  constructor() { this.group.add(this.novas.mesh, this.trails.mesh, this.bodies.mesh, this.particles.mesh); }
  setDetail(detail: ProjectileDetail) { this.detail = detail; }
  reset() {
    this.novas.begin(); this.bodies.begin(); this.trails.begin(); this.particles.begin();
    this.history.reset(); this.lastSample = -1; this.activeLanes = this.novaCount = 0;
  }
  sample(combat: Combat) {
    if (this.epoch !== combat.areaAttacks.epoch) { this.reset(); this.epoch = combat.areaAttacks.epoch; }
    if (this.lastSample === combat.elapsed) return;
    this.lastSample = combat.elapsed;
    for (let slot = 0; slot < BARRAGE_RULES.lanes; slot++) {
      const lane = combat.areaAttacks.lanes[slot];
      if (!lane.active || !lane.castId) { this.history.clear(slot); continue; }
      if (!this.history.count(slot) || this.identities[slot] !== lane.castId) {
        this.history.clear(slot); this.history.add(slot, lane.previousX, lane.previousZ, combat.elapsed - 1 / 60);
      }
      this.identities[slot] = lane.castId; this.history.add(slot, lane.x, lane.z, combat.elapsed);
    }
  }
  update(combat: Combat, visible: boolean) {
    this.sample(combat);
    this.novas.begin(); this.bodies.begin(); this.trails.begin(); this.particles.begin();
    this.activeLanes = this.novaCount = 0; this.group.visible = visible;
    if (!visible) return;
    const quality = AREA_ATTACK_DECORATION[this.detail], style = STYLES.nova;
    let latestNova = -1;
    for (const cast of combat.areaAttacks.novas) if (cast.active) latestNova = Math.max(latestNova, cast.castId);
    for (const cast of combat.areaAttacks.novas) {
      if (!cast.active) continue;
      // The existing rule resnapshots the camera at detonation; only that final snapshot is authoritative.
      const view = cast.detonated ? cast.view : combat.attackViewport ?? combat.spawnViewport ?? cast.view;
      const ax = view.x - view.halfWidth, bx = view.x + view.halfWidth;
      const progress = Math.max(0, (cast.age - AREA_RULES.warning) / (AREA_RULES.duration - AREA_RULES.warning));
      const fade = (1 - Math.min(1, progress)) ** 2;
      this.novas.put(ax, view.z, bx, view.z, view.halfDepth * 2, style.color,
        cast.detonated ? .55 * fade : .26 + .28 * Math.min(1, cast.age / AREA_RULES.warning), style.height, true);
      // One large fill at most, while every active nova retains its actual rectangle boundary.
      if (cast.castId === latestNova) this.novas.put(ax, view.z, bx, view.z, view.halfDepth * 2, style.color,
        cast.detonated ? (this.detail === 'full' ? style.fullFlash : style.reducedFlash) * fade : .012,
        style.height - .004);
      if (quality.corners) for (let i = 0; i < 4; i++) this.particles.put('star',
        i % 2 ? bx : ax, .12, i < 2 ? view.z - view.halfDepth : view.z + view.halfDepth,
        .36, .36, style.core, cast.detonated ? fade * .75 : .55);
      this.particles.put('star', view.x, .18, view.z, cast.detonated ? 1.1 : .45,
        cast.detonated ? 1.1 : .45, style.core, cast.detonated ? fade * .7 : .6, cast.age * .6);
      this.novaCount++;
    }
    const barrage = STYLES.barrage;
    for (let slot = 0; slot < BARRAGE_RULES.lanes; slot++) {
      const lane = combat.areaAttacks.lanes[slot];
      if (!lane.active || !lane.castId) continue;
      const angle = -Math.atan2(lane.vz, lane.vx);
      this.bodies.put('crystal', lane.x, barrage.height, lane.z, barrage.width, barrage.depth, barrage.color, .98, angle);
      this.bodies.put('star', lane.x, barrage.height + .006, lane.z, barrage.width * .28, barrage.depth * .4, barrage.core, .95, angle);
      this.trail(slot, combat.elapsed);
      this.activeLanes++;
    }
    for (const event of combat.areaAttacks.events) {
      if (!event.active) continue;
      const progress = Math.min(1, event.age / AREA_FEEDBACK_LIMITS.duration), fade = (1 - progress) ** 2;
      const nova = event.kind === 'nova-hit', color = nova ? style.core : barrage.core;
      if (event.kind === 'barrage-end') {
        this.particles.put('crystal', event.x, barrage.height, event.z,
          .3 * (1 - progress * .6), .17, barrage.trail, fade * .65); continue;
      }
      this.particles.put('star', event.x, .46, event.z, nova ? .6 : .36, nova ? .6 : .36, color, fade);
      for (let i = 0; i < quality.feedbackPieces; i++) {
        const angle = i / quality.feedbackPieces * Math.PI * 2 + event.seed * 2.399963;
        const radius = progress * (nova ? .7 : .45), size = .2 * (1 - progress * .5);
        this.particles.put('shard', event.x + Math.cos(angle) * radius, .4 + Math.sin(progress * Math.PI) * .16,
          event.z + Math.sin(angle) * radius, size, size * .65, nova ? style.color : barrage.color, fade, angle);
      }
    }
    this.novas.finish(); this.bodies.finish(); this.trails.finish(); this.particles.finish();
  }
  private trail(slot: number, time: number) {
    const style = STYLES.barrage;
    const count = Math.min(this.history.count(slot) - 1, AREA_ATTACK_DECORATION[this.detail].trailSegments);
    let total = 0;
    for (let i = 0; i < count; i++) {
      const ax = this.history.x(slot, i), az = this.history.z(slot, i), bx = this.history.x(slot, i + 1), bz = this.history.z(slot, i + 1);
      const age = Math.max(0, time - this.history.time(slot, i + 1));
      if (age >= style.trailDuration) break;
      const dx = bx - ax, dz = bz - az, length = Math.hypot(dx, dz);
      if (length < .001) continue;
      if (total + length > style.trailLength) break;
      total += length;
      const fade = (1 - age / style.trailDuration) * (1 - i / PATH_POINTS);
      this.trails.put('streak', (ax + bx) / 2, style.height - .01, (az + bz) / 2, length * 1.1,
        style.trailWidth * fade, style.trail, fade * .35, -Math.atan2(dz, dx));
    }
  }
  inspect() {
    return { detail: this.detail, novas: this.novaCount, activeLanes: this.activeLanes, rectangleInstances: this.novas.mesh.count,
      bodyInstances: this.bodies.mesh.count, trailInstances: this.trails.mesh.count, feedbackInstances: this.particles.mesh.count,
      laneCapacity: BARRAGE_RULES.lanes, feedbackCapacity: AREA_FEEDBACK_LIMITS.events };
  }
}
