import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'vite';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
await build({ configFile: false, publicDir: false, logLevel: 'silent',
  define: { 'import.meta.env.BASE_URL': JSON.stringify('./') },
  build: { outDir: 'test-results/unit', emptyOutDir: true, target: 'es2020', minify: false,
    lib: { entry: resolve('tests/entry.ts'), formats: ['es'], fileName: () => 'model.mjs' } } });
const { FirstRun, FIXED_STEP, FIRST_RUN_SECONDS, TouchInput, normalizeSafeArea } = await import(pathToFileURL(resolve('test-results/unit/model.mjs')));
const zero = { x: 0, z: 0 };

test('landscape controls do not use portrait safe-area right/bottom coordinates', () => {
  assert.deepEqual(normalizeSafeArea({ windowWidth: 852, windowHeight: 393, pixelRatio: 3,
    safeArea: { left: 0, right: 393, top: 47, bottom: 818 } }), { left: 47, right: 805, top: 0, bottom: 393 });
  const area = { left: 47, right: 805, top: 0, bottom: 393 };
  assert.deepEqual(normalizeSafeArea({ windowWidth: 852, windowHeight: 393, pixelRatio: 3, safeArea: area }), area);
  assert.deepEqual(normalizeSafeArea({ windowWidth: 852, windowHeight: 393, pixelRatio: 3 }), { left: 0, right: 852, top: 0, bottom: 393 });
});

test('original combat automatically targets, damages enemies and awards XP', () => {
  const run = new FirstRun(() => .5); run.start();
  run.combat.spawn('normal', 0, 4, 0);
  for (let i = 0; i < 180; i++) run.step(FIXED_STEP, zero);
  assert.ok(run.combat.shotsFired > 0); assert.ok(run.combat.kills >= 1);
  assert.ok(run.combat.orbs.some(o => o.active) || run.combat.collected > 0);
});

test('pause and upgrade freeze movement, combat, and the run clock', () => {
  const run = new FirstRun(() => .5); run.start(); run.step(FIXED_STEP, { x: 1, z: 0 }); run.pause();
  const paused = run.inspect(); run.step(FIXED_STEP, { x: 1, z: 0 }); assert.deepEqual(run.inspect(), paused);
  run.resume(); run.combat.progression.gainExperience(100); run.step(FIXED_STEP, zero);
  assert.equal(run.mode, 'upgrade');
  const upgrading = run.inspect(); run.step(FIXED_STEP, { x: 1, z: 1 }); assert.deepEqual(run.inspect(), upgrading);
  assert.equal(run.choose('not-an-offer'), false);
  let guard = 0;
  while (run.mode === 'upgrade' && ++guard < 30) assert.equal(run.choose(run.combat.progression.offers[0]), true);
  assert.equal(run.mode, 'playing'); assert.ok(run.combat.progression.level > 1);
});

test('restart clears enemies, shots, XP, upgrades, elapsed time and dash cooldown', () => {
  const run = new FirstRun(() => .5); run.start();
  run.combat.spawn('tank', 0, 3, 0); run.step(FIXED_STEP, { x: 1, z: 1 }); run.dash();
  run.combat.progression.gainExperience(100); run.start();
  assert.equal(run.combat.enemies.filter(e => e.active).length, 0);
  assert.equal(run.combat.projectiles.filter(p => p.active).length, 0);
  assert.equal(run.combat.progression.level, 1); assert.equal(run.combat.progression.awaitingChoice, false);
  assert.equal(run.elapsed, 0); assert.equal(run.dashCooldown, 0); assert.deepEqual(run.player, { x: 0, z: 0 });
  assert.equal(run.combat.hp, 100);
});

test('first-run victory is finite and death wins on the same tick', () => {
  const run = new FirstRun(() => .5); run.start(); run.elapsed = FIRST_RUN_SECONDS - FIXED_STEP;
  run.step(FIXED_STEP, zero); assert.equal(run.mode, 'result'); assert.equal(run.victory, true);
  run.start(); run.elapsed = FIRST_RUN_SECONDS - FIXED_STEP; run.combat.hp = 0;
  run.step(FIXED_STEP, zero); assert.equal(run.mode, 'result'); assert.equal(run.victory, false);
});

test('world bounds and obstacle separation hold while moving', () => {
  const run = new FirstRun(() => .5); run.start();
  run.player.x = -11; run.player.z = -6;
  for (let i = 0; i < 60; i++) run.step(FIXED_STEP, { x: 1, z: 0 });
  assert.ok(Math.hypot(run.player.x + 9, run.player.z + 6) >= 1.62 - 1e-6);
  run.player.x = 31.6; run.player.z = 0;
  for (let i = 0; i < 30; i++) run.step(FIXED_STEP, { x: 1, z: 0 });
  assert.ok(run.player.x <= 31.68 + 1e-6);
});

test('multitouch, canceled gestures and stale card touches never select a new UI', () => {
  const run = new FirstRun(() => .5); run.start(); const actions = [];
  const button = { x: 700, y: 350, w: 150, h: 100, action: 'dash' };
  const input = new TouchInput(run, () => ({ width: 960, height: 540 }), () => [button], id => actions.push(id));
  const event = (...touches) => ({ touches, changedTouches: touches });
  const t = (identifier, clientX, clientY) => ({ identifier, clientX, clientY });
  input.start(event(t(1, 120, 400))); input.move(event(t(1, 170, 400)));
  input.start(event(t(2, 750, 400))); input.end(event(t(2, 750, 400)));
  assert.deepEqual(actions, ['dash']); assert.ok(input.movement.x > .9);
  input.cancel(event(t(1, 170, 400))); assert.equal(input.movement.x, 0);
  input.start(event(t(3, 750, 400))); run.pause(); input.end(event(t(3, 750, 400)));
  assert.equal(actions.length, 1);
  run.resume(); input.start(event(t(4, 750, 400))); input.move(event(t(4, 780, 400))); input.end(event(t(4, 750, 400)));
  assert.equal(actions.length, 1);
});
