import * as THREE from 'three';
import type { FirstRun } from './model';
import { COMBAT_LIMITS, FORMAL_POUNCE } from './core/combat';
import { ENCOUNTER_RULES } from './core/enemy-challenge';
import { SPORE_BOMBER } from './core/special-enemies';
import { GRASS_BLOB } from './core/grass-blob';
import { SectorWave } from './render/vfx/sector-wave';
import type { EffectAssets } from './assets/effect-assets';

/** Shared, bounded presentation of formal-mode attacks. Simulation remains upstream. */
export class CampaignView {
  readonly group = new THREE.Group();
  private pose = new THREE.Object3D();
  private color = new THREE.Color();
  private warnings = this.pool(new THREE.RingGeometry(.94, 1, 40), '#ffffff', 320, true);
  private lanes = this.pool(new THREE.PlaneGeometry(1, 1), '#ffffff', 48, true);
  private hostile = this.pool(new THREE.IcosahedronGeometry(.22, 0), '#ff8acb', 160);
  private health = this.pool(new THREE.PlaneGeometry(1, .08), '#b8eb90', COMBAT_LIMITS.enemies);
  private chests = this.pool(new THREE.OctahedronGeometry(.42, 0), '#f9d56c', 8);
  private elite = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: '#bca8d0' }));
  private sweep = new SectorWave();
  private boss?: THREE.Sprite;
  constructor(private assets: EffectAssets) {
    // Hostile danger contours remain above friendly water fills and particles.
    this.warnings.renderOrder = this.lanes.renderOrder = 10;
    this.group.add(this.sweep.mesh, this.elite); this.elite.visible = false;
  }
  setBossImage(image: HTMLImageElement) {
    const tex = new THREE.Texture(image); tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    tex.repeat.set(.25, 1); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    this.boss = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: .12, depthWrite: false, toneMapped: false }));
    this.boss.center.set(.5, .0625); this.boss.scale.set(6.8, 6.8, 1); this.group.add(this.boss);
  }
  private pool(geometry: THREE.BufferGeometry, color: string, count: number, transparent = false) {
    const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color, transparent, opacity: transparent ? .55 : 1, side: THREE.DoubleSide, depthWrite: !transparent, toneMapped: false }), count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0; mesh.frustumCulled = false; this.group.add(mesh); return mesh;
  }
  private put(mesh: THREE.InstancedMesh, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, color?: string) {
    if (mesh.count >= mesh.instanceMatrix.count) return;
    this.pose.position.set(x, y, z); this.pose.scale.set(sx, sy, sz); this.pose.updateMatrix();
    mesh.setMatrixAt(mesh.count, this.pose.matrix);
    if (color) mesh.setColorAt(mesh.count, this.color.set(color));
    mesh.count++;
  }
  update(model: FirstRun, camera: THREE.Camera) {
    this.group.visible = !!model.run && model.mode !== 'menu';
    if (!this.group.visible) return;
    const combat = model.combat, c = combat.encounters;
    for (const mesh of [this.warnings, this.lanes, this.hostile, this.health, this.chests]) mesh.count = 0;
    const ring = (x: number, z: number, radius: number, color = '#ff775e') => {
      this.pose.rotation.set(-Math.PI / 2, 0, 0); this.put(this.warnings, x, .08, z, radius, radius, 1, color);
    };
    const lane = (x: number, z: number, dx: number, dz: number, length: number, width: number, color = '#f47765') => {
      this.pose.rotation.set(-Math.PI / 2, 0, Math.atan2(dx, dz));
      this.put(this.lanes, x + dx * length / 2, .07, z + dz * length / 2, width, length, 1, color);
    };
    for (const enemy of combat.enemies) {
      if (!enemy.active) continue;
      if (!enemy.rank && enemy.kind === 'normal' && (enemy.intent === 'windup' || enemy.intent === 'pounce')) {
        ring(enemy.grassAttackX ?? enemy.x, enemy.grassAttackZ ?? enemy.z, GRASS_BLOB.radius);
      } else if (!enemy.rank && enemy.kind === 'fast' && enemy.intent === 'windup') {
        lane(enemy.x, enemy.z, enemy.aimX, enemy.aimZ, FORMAL_POUNCE.speed * FORMAL_POUNCE.duration, (combat.enemyRadius(enemy) + .62) * 2);
      }
      this.pose.quaternion.copy(camera.quaternion);
      const height = enemy.rank === 'boss' ? 4.4 : enemy.rank === 'elite' ? 3.1 : enemy.kind === 'tank' ? 2.5 : 1.9;
      this.put(this.health, enemy.x, height, enemy.z, Math.max(.35, combat.enemyRadius(enemy) * 1.8) * Math.max(0, enemy.hp / combat.enemyHealth(enemy)), 1, 1);
    }
    for (const spore of combat.sporeExplosions) if (spore.active) ring(spore.x, spore.z, SPORE_BOMBER.radius, spore.detonated ? '#ffc065' : '#e55773');
    if (c.elitePulsing) for (const target of c.eliteQuakeTargets) if (target.active) ring(target.x, target.z, ENCOUNTER_RULES.elitePulseRadius);
    for (const quake of [c.eliteQuake, ...c.eliteQuakeAftershocks, c.bossQuake]) if (quake.active) ring(quake.x, quake.z, ENCOUNTER_RULES.elitePulseRadius, '#ffc37b');
    if (c.bossState === 'quake-windup') ring(c.bossQuakeTarget.x, c.bossQuakeTarget.z, ENCOUNTER_RULES.elitePulseRadius);
    if (c.boss?.active && c.bossState === 'dash-windup') lane(c.boss.x, c.boss.z, c.aimX, c.aimZ, c.dashSpeed * c.dashDuration, (combat.enemyRadius(c.boss) + .62) * 2);
    if (c.boss?.active && c.bossState === 'spread-windup') {
      // Show each locked projectile trajectory instead of an unrelated generic circle.
      for (let i = 0; i < c.spreadCount; i++) {
        const angle = Math.atan2(c.aimX, c.aimZ) - .7 + i * 1.4 / (c.spreadCount - 1);
        lane(c.boss.x, c.boss.z, Math.sin(angle), Math.cos(angle), c.shotLife * c.shotSpeed, .12);
      }
    }
    if (c.barrage.warning) {
      ring(c.barrage.x, c.barrage.z, 2.2, '#ffb1dc');
      if (c.barrage.channelCount) lane(c.barrage.x, c.barrage.z, Math.sin(c.barrage.gapAngle), Math.cos(c.barrage.gapAngle), 12, .22, '#9fe3a8');
    }
    this.pose.quaternion.identity();
    for (const shot of [...c.shots, ...c.barrage.shots]) if (shot.active) this.put(this.hostile, shot.x, .65, shot.z, 1);
    for (const reward of combat.treasureRewards) if (reward.active) this.put(this.chests, reward.x, .6, reward.z, 1);
    this.elite.visible = !!c.elite?.active;
    if (c.elite) { this.elite.position.set(c.elite.x, 1.4, c.elite.z); this.elite.scale.set(1.3, 1.5, 1.3); }
    if (this.boss) {
      this.boss.visible = !!c.boss && !c.defeated;
      if (c.boss) {
        this.boss.position.set(c.boss.x, .05, c.boss.z);
        this.boss.material.map!.offset.x = Math.floor(combat.elapsed * 4) % 4 / 4;
        this.boss.material.color.set(c.boss.flash > 0 ? '#ffd2a6' : c.enraged ? '#ffb9a8' : '#ffffff');
        this.boss.material.opacity = c.dying ? Math.max(0, 1 - c.bossTime) : 1;
      }
    }
    this.sweep.begin(this.assets.texture('flame-sweep'));
    this.sweep.put(combat.melee);
    this.sweep.finish();
    for (const mesh of [this.warnings, this.lanes, this.hostile, this.health, this.chests]) {
      mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }
}
