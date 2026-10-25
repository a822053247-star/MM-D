import { Combat, type EnemyKind } from './core/combat';
import { clampToRectangularBoundary, ARENA_HALF_EXTENT, PLAYER_COLLISION_RADIUS } from './core/arena-boundary';
import type { SkillId } from './core/progression';
import { PartySystem } from './core/party';
import { RunFlow } from './core/run-flow';
import { CAMPAIGN_SKILLS } from './content/enabled';

export type Mode = 'menu' | 'playing' | 'paused' | 'upgrade' | 'result' | 'rest' | 'shop' | 'preparing';
export type RunKind = 'trial' | 'campaign';
export const FIRST_RUN_SECONDS = 180;
export const FIXED_STEP = 1 / 60;
export const OBSTACLES = [
  { x: -9, z: -6, radius: 1 }, { x: 9, z: 7, radius: 1.1 },
  { x: 13, z: -12, radius: 1 }, { x: -15, z: 12, radius: 1.2 },
  { x: -22, z: -17, radius: 1 }, { x: 23, z: 18, radius: 1.1 },
];

/** Practice and campaign share the upstream combat, progression and bounded pools. */
export class FirstRun {
  readonly combat: Combat;
  readonly player = { x: 0, z: 0 };
  kind: RunKind = 'trial';
  run?: RunFlow;
  mode: Mode = 'menu';
  elapsed = 0;
  version = 0;
  victory = false;
  moving = false;
  velocity = { x: 0, z: 0 };
  dashCooldown = 0;
  preparationFailed = false;
  private dashTime = 0;
  private dashDirection = { x: 0, z: 1 };
  private spawnClock = 1.5;
  private pausedFrom: 'playing' | 'rest' = 'playing';
  constructor(private random: () => number = Math.random) {
    this.combat = new Combat(OBSTACLES, ARENA_HALF_EXTENT, random);
  }
  get remaining() { return this.run?.remaining ?? Math.max(0, FIRST_RUN_SECONDS - this.elapsed); }
  get stage() { return this.run?.wave ?? Math.min(3, 1 + Math.floor(this.elapsed / 60)); }
  setMode(mode: Mode) { if (this.mode !== mode) { this.mode = mode; this.version++; this.moving = false; this.velocity.x = this.velocity.z = 0; } }
  start(kind: RunKind = 'trial') {
    this.kind = kind;
    this.combat.party = kind === 'campaign' ? new PartySystem() : undefined;
    this.combat.fusionEnabled = kind === 'campaign';
    this.combat.startingAttack = kind === 'campaign' ? 'flame-sweep' : undefined;
    this.combat.progression.allowedSkills = kind === 'campaign' ? CAMPAIGN_SKILLS : undefined;
    this.combat.reset('classic');
    this.run = kind === 'campaign' ? new RunFlow(this.random, 'campaign') : undefined;
    this.combat.automaticSpawning = false;
    this.player.x = this.player.z = this.elapsed = this.dashCooldown = this.dashTime = 0;
    this.spawnClock = 1.5; this.victory = false; this.dashDirection = { x: 0, z: 1 };
    this.moving = false; this.velocity.x = this.velocity.z = 0; this.version++;
    this.run?.prepare(this.combat, this.player);
    this.setMode('playing');
  }
  pause() { if (this.mode === 'playing' || this.mode === 'rest') { this.pausedFrom = this.mode; this.setMode('paused'); } }
  resume() { if (this.mode === 'paused') this.setMode(this.pausedFrom); }
  buy(index: number, token: string) {
    if (this.mode !== 'shop' || !this.run?.buy(index, token)) return false;
    this.version++; return true;
  }
  refreshShop(token: string) {
    if (this.mode !== 'shop' || !this.run?.refresh(token)) return false;
    this.version++; return true;
  }
  nextWave(token: string) {
    if (this.mode !== 'shop' || !this.run?.nextWave(token, this.combat)) return false;
    this.run.prepare(this.combat, this.player); this.setMode('playing'); return true;
  }
  choose(id: SkillId) {
    if (this.mode !== 'upgrade' || !this.combat.chooseUpgrade(id)) return false;
    this.version++;
    if (!this.combat.progression.awaitingChoice) this.setMode('playing');
    if (this.run && !this.combat.progression.awaitingChoice) { this.run.resolveBoundary(this.combat); this.syncRun(); }
    return true;
  }
  dash() {
    if (this.mode !== 'playing' || this.dashCooldown > 0) return;
    if (this.moving) {
      const length = Math.hypot(this.velocity.x, this.velocity.z);
      this.dashDirection = { x: this.velocity.x / length, z: this.velocity.z / length };
    }
    this.dashTime = .16; this.dashCooldown = 3;
  }
  step(dt: number, input: { x: number; z: number }, beforeCombat?: () => boolean) {
    if (dt <= 0 || dt > .1) return;
    if ((this.mode === 'rest' || this.mode === 'shop') && this.run) {
      this.run.updateRest(dt, this.combat); this.syncRun(); return;
    }
    if (this.mode !== 'playing') return;
    if (this.combat.hp <= 0) { this.setMode('result'); return; }
    if (this.combat.progression.awaitingChoice && !this.combat.encounters.dying) { this.setMode('upgrade'); return; }
    if (this.run) {
      this.run.resolveBoundary(this.combat);
      if (this.syncRun()) return;
      this.run.prepare(this.combat, this.player);
    }
    // Boundary resolution can grant new content before this same tick's attacks.
    if (beforeCombat && !beforeCombat()) return;
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    const length = Math.max(1, Math.hypot(input.x, input.z));
    const speed = (this.run ? 4.6 : 5.2) * this.combat.stats.moveMultiplier;
    const dashing = this.dashTime > 0;
    this.velocity.x = dashing ? this.dashDirection.x * 16 : input.x / length * speed;
    this.velocity.z = dashing ? this.dashDirection.z * 16 : input.z / length * speed;
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.moving = Math.hypot(this.velocity.x, this.velocity.z) > .1;
    this.player.x += this.velocity.x * dt; this.player.z += this.velocity.z * dt;
    for (const obstacle of OBSTACLES) {
      const dx = this.player.x - obstacle.x, dz = this.player.z - obstacle.z;
      const distance = Math.hypot(dx, dz), radius = obstacle.radius + PLAYER_COLLISION_RADIUS;
      if (distance < radius) { this.player.x = obstacle.x + (distance > .001 ? dx / distance : 1) * radius; this.player.z = obstacle.z + (distance > .001 ? dz / distance : 0) * radius; }
    }
    clampToRectangularBoundary(this.player, ARENA_HALF_EXTENT, PLAYER_COLLISION_RADIUS);
    this.combat.party?.syncLeader(this.player, Math.atan2(this.velocity.x, this.velocity.z));
    this.spawnClock -= dt;
    if (!this.run && this.spawnClock <= 0) {
      this.spawnClock += Math.max(.32, 1.15 - this.elapsed * .004);
      if (this.combat.enemies.filter(enemy => enemy.active).length < 120) {
        const angle = this.random() * Math.PI * 2, radius = 13 + this.random() * 3;
        const p = { x: this.player.x + Math.sin(angle) * radius, z: this.player.z + Math.cos(angle) * radius };
        clampToRectangularBoundary(p, ARENA_HALF_EXTENT, 1);
        // Boundary spawns must still give the player time to react.
        if (Math.hypot(p.x - this.player.x, p.z - this.player.z) > 5) {
          const roll = this.random();
          const kind: EnemyKind = this.elapsed > 60 && roll < .18 ? 'tank' : this.elapsed > 20 && roll < .45 ? 'fast' : 'normal';
          this.combat.spawn(kind, p.x, p.z, .75);
        }
      }
    }
    this.combat.update(dt, this.player);
    if (this.run) {
      this.run.update(dt, this.combat, this.player); this.elapsed = this.run.combatElapsed;
      this.syncRun(); return;
    }
    this.elapsed = Math.min(FIRST_RUN_SECONDS, this.elapsed + dt);
    if (this.combat.hp <= 0) this.setMode('result');
    else if (this.elapsed >= FIRST_RUN_SECONDS) { this.victory = true; this.setMode('result'); }
    else if (this.combat.progression.awaitingChoice) this.setMode('upgrade');
  }
  private syncRun() {
    if (!this.run) return false;
    if (this.combat.hp <= 0 || this.run.phase === 'lost') { this.victory = false; this.setMode('result'); return true; }
    if (this.run.phase === 'won') { this.victory = true; this.setMode('result'); return true; }
    if (this.combat.progression.awaitingChoice && !this.combat.encounters.dying) { this.setMode('upgrade'); return true; }
    if (this.run.phase === 'intermission') { this.setMode('rest'); return true; }
    if (this.run.phase === 'shop') { this.setMode('shop'); return true; }
    if (this.mode === 'rest' || this.mode === 'shop') this.setMode('playing');
    return false;
  }
  inspect() {
    return { mode: this.mode, kind: this.kind, elapsed: this.elapsed, remaining: this.remaining, stage: this.stage,
      hp: this.combat.hp, kills: this.combat.kills, level: this.combat.progression.level,
      enemies: this.combat.enemies.filter(e => e.active).length, offers: [...this.combat.progression.offers],
      player: { ...this.player }, victory: this.victory, dashCooldown: this.dashCooldown,
      coins: this.run?.coins ?? 0, phase: this.run?.phase, failure: this.run?.failure,
      skillEffects: { ice: { ...this.combat.iceSkills.telemetry }, dream: { ...this.combat.dream.telemetry },
        water: { ...this.combat.waterAoe.telemetry }, thunder: { ...this.combat.thunder.telemetry },
        frost: { ...this.combat.frost.telemetry }, blades: { ...this.combat.blades.telemetry },
        position: { ...this.combat.positionAoe.telemetry }, areaAttacks: { ...this.combat.areaAttacks.telemetry } },
      boss: this.combat.encounters.bossState, bossHP: this.combat.encounters.boss?.hp ?? 0,
      shop: this.run?.shop ? { token: this.run.shop.token, items: this.run.shop.items.map(item => ({ ...item })) } : undefined };
  }
}
