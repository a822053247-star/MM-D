import { build } from 'vite';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';

// One focused migration path: wave boundaries -> shop -> Boss kill -> restart/timeout.
await build({ configFile: false, publicDir: false, logLevel: 'silent',
  define: { 'import.meta.env.BASE_URL': JSON.stringify('./') },
  build: { outDir: 'test-results/campaign', emptyOutDir: true, minify: false,
    lib: { entry: resolve('src/model.ts'), formats: ['es'], fileName: () => 'model.mjs' } } });
const { FirstRun, FIXED_STEP } = await import(pathToFileURL(resolve('test-results/campaign/model.mjs')));
const run = new FirstRun(() => .5), zero = { x: 0, z: 0 }, passed = [];
run.start('campaign');
assert.equal(run.combat.runBuild.attacks[0].attackId, 'flame-sweep');
assert.equal(run.combat.progression.ranks['flame-sweep-weapon'], 1);
for (let wave = 1; wave <= 5; wave++) {
  assert.equal(run.stage, wave);
  run.run.waveElapsed = run.run.definition.seconds;
  run.step(FIXED_STEP, zero);
}
assert.equal(run.mode, 'rest');
for (let i = 0; i < 220; i++) run.step(FIXED_STEP, zero);
assert.equal(run.mode, 'shop');
const token = run.run.shop.token;
const item = run.run.shop.items.findIndex((_, i) => run.run.shop.canBuy(i, run.run.coins));
assert.ok(item >= 0); const coins = run.run.coins;
assert.equal(run.buy(item, token), true); assert.ok(run.run.coins < coins);
assert.equal(run.buy(item, token), false);
assert.equal(run.nextWave(token), false);
assert.equal(run.nextWave(run.run.shop.token), true);
assert.equal(run.stage, 6); assert.ok(run.combat.encounters.boss);
passed.push('five wave boundaries, rest, purchase, stale token rejection, Boss entry');
const boss = run.combat.encounters.boss;
boss.x = 0; boss.z = 2; boss.hp = 1; boss.spawnTime = 0;
for (let i = 0; i < 180 && run.mode !== 'result'; i++) run.step(FIXED_STEP, zero);
assert.equal(run.mode, 'result'); assert.equal(run.victory, true);
passed.push('automatic flame sweep kills Boss; death transition resolves victory');
run.start('campaign'); assert.equal(run.stage, 1); assert.equal(run.combat.kills, 0); assert.equal(run.run.coins, 0);
run.run.waveIndex = 5; run.run.waveElapsed = run.run.definition.seconds;
run.step(FIXED_STEP, zero);
assert.equal(run.mode, 'result'); assert.equal(run.victory, false); assert.equal(run.run.failure, 'boss-timeout');
passed.push('restart clears run and wallet; Boss timeout fails');
run.start('campaign');
assert.ok(run.combat.progression.skills.every(skill => run.combat.progression.allowedSkills.has(skill.id)));
passed.push('reward pool contains only supported content');
await writeFile('docs/campaign-check.json', JSON.stringify({ verification: 'Headless deterministic shortcut; not a natural full-length or real-device run', passed }, null, 2));
console.log(`Campaign critical path: ${passed.length} checks passed`);
