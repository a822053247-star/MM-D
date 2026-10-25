import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createPreviewServer } from '../scripts/preview.mjs';
import { spawnSync } from 'node:child_process';

const built = spawnSync(process.execPath, ['scripts/build.mjs', '--test'], { encoding: 'utf8' });
if (built.status !== 0) throw new Error(built.stdout + built.stderr);
const server = createPreviewServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}`;
let browser; const results = [], errors = [];
try {
  browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon.ico')) errors.push(message.text()); });
  await page.goto(url);
  await page.waitForFunction(() => globalThis.__MM_DOUYIN_TEST__?.inspect().ready, { timeout: 20000 });
  const inspect = () => page.evaluate(() => globalThis.__MM_DOUYIN_TEST__.inspect());
  const click = async action => {
    const button = await page.evaluate(id => globalThis.__MM_DOUYIN_TEST__.hud.buttons.find(b => b.action === id), action);
    assert.ok(button, `Visible button ${action}`);
    const viewport = page.viewportSize();
    await page.mouse.click((button.x + button.w / 2) * viewport.width / 960, (button.y + button.h / 2) * viewport.width / 960);
  };
  await mkdir('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/menu.png' });
  assert.equal((await inspect()).mode, 'menu'); results.push('loadSubpackage + all images decoded + menu');
  await click('trial');
  await page.waitForFunction(() => globalThis.__MM_DOUYIN_TEST__.inspect().elapsed > .3);
  await page.evaluate(() => {
    const t = { identifier: 91, clientX: 100, clientY: 400 };
    __TT_MOCK__.emit('touchStart', { touches: [t], changedTouches: [t] });
    const move = { ...t, clientX: 155 };
    __TT_MOCK__.emit('touchMove', { touches: [move], changedTouches: [move] });
  });
  await page.waitForTimeout(450); assert.ok((await inspect()).player.x > 1);
  await click('dash'); assert.ok((await inspect()).dashCooldown > 2); results.push('joystick + second-finger dash');
  await page.evaluate(() => __TT_MOCK__.emit('hide'));
  const paused = await inspect(); await page.waitForTimeout(150);
  assert.equal((await inspect()).elapsed, paused.elapsed); assert.equal(paused.mode, 'paused');
  await page.evaluate(() => __TT_MOCK__.emit('show')); await page.waitForTimeout(100);
  assert.equal((await inspect()).mode, 'paused'); results.push('hide/show freezes time and requires manual resume');
  await click('resume');
  await page.evaluate(() => {
    const { model } = __MM_DOUYIN_TEST__; model.combat.spawn('normal', 0, 4, 0); model.combat.spawn('fast', 4, 4, 0); model.combat.spawn('tank', -4, 4, 0);
  });
  await page.waitForTimeout(350);
  await page.screenshot({ path: 'docs/screenshots/playing.png' });
  await page.evaluate(() => __MM_DOUYIN_TEST__.model.combat.progression.gainExperience(8));
  await page.waitForFunction(() => __MM_DOUYIN_TEST__.inspect().mode === 'upgrade');
  await page.waitForTimeout(80);
  await page.screenshot({ path: 'docs/screenshots/upgrade.png' });
  const upgrading = await inspect(); await page.waitForTimeout(100); assert.equal((await inspect()).elapsed, upgrading.elapsed);
  await click(`choose:${upgrading.offers[0]}`); await page.waitForTimeout(100);
  assert.equal((await inspect()).mode, 'playing'); results.push('upgrade pauses simulation; fresh tap selects the original reward');
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(100);
  assert.equal((await inspect()).mode, 'paused');
  await page.setViewportSize({ width: 844, height: 390 }); await page.waitForTimeout(100);
  await page.screenshot({ path: 'docs/screenshots/phone-landscape.png' });
  const overlaps = await page.evaluate(() => {
    const { hud } = __MM_DOUYIN_TEST__;
    return hud.buttons.some(b => b.x < hud.left || b.x + b.w > hud.right || b.y < 0 || b.y + b.h > hud.height);
  });
  assert.equal(overlaps, false); results.push('portrait pauses; phone landscape buttons stay within canvas');
  await click('restart'); await page.waitForTimeout(100);
  assert.equal((await inspect()).level, 1); assert.equal((await inspect()).kills, 0); assert.equal((await inspect()).dashCooldown, 0);
  await page.evaluate(() => { const { model } = __MM_DOUYIN_TEST__; model.combat.kills = 42; model.combat.hp = 0; });
  await page.waitForFunction(() => __MM_DOUYIN_TEST__.inspect().mode === 'result'); await page.waitForTimeout(80);
  assert.equal((await inspect()).best, 42);
  await page.screenshot({ path: 'docs/screenshots/result.png' }); results.push('restart resets state; result persists best score');
  // Package errors remain retryable, without turning the loading screen into a fatal boot.
  const retry = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await retry.addInitScript(() => localStorage.setItem('mock-fail-package', 'true'));
  await retry.route('**/mock-tt.js', async route => {
    const response = await route.fetch();
    const code = (await response.text()).replace('failPackage: false', 'failPackage: true');
    await route.fulfill({ response, body: code });
  });
  await retry.goto(url); await retry.waitForFunction(() => __MM_DOUYIN_TEST__?.inspect().loadError);
  await retry.evaluate(() => { __TT_MOCK__.failPackage = false; const t = __MM_DOUYIN_TEST__; const b = t.hud.buttons.find(b => b.action === 'retry');
    const touch = { identifier: 15, clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 };
    __TT_MOCK__.emit('touchStart', { touches: [touch], changedTouches: [touch] });
    __TT_MOCK__.emit('touchEnd', { touches: [], changedTouches: [touch] }); });
  await retry.waitForFunction(() => __MM_DOUYIN_TEST__?.inspect().ready);
  assert.equal(await retry.evaluate(() => __TT_MOCK__.downloads.length), 2); await retry.close();
  results.push('subpackage failure can retry successfully');
  await page.evaluate(() => {
    globalThis.__WORKER_RESULT__ = []; const worker = new Worker('/native-worker.js');
    globalThis.__NATIVE_WORKER__ = worker;
    worker.onmessage = event => __WORKER_RESULT__.push(event.data);
    worker.onerror = event => __WORKER_RESULT__.push({ type: 'error', error: event.message });
  });
  await page.waitForFunction(() => __WORKER_RESULT__.some(r => r.type === 'status' && r.state.elapsed > .2) || __WORKER_RESULT__.some(r => /error|fatal/.test(r.type)), null, { timeout: 20000 });
  const native = await page.evaluate(() => { __NATIVE_WORKER__.terminate(); return __WORKER_RESULT__; });
  assert.deepEqual(native.filter(r => /error|fatal/.test(r.type)), []);
  assert.ok(native.some(r => r.type === 'status' && r.noDOM && r.state.elapsed > .2));
  results.push('worker runtime without window/document renders and starts combat');
  // Verify the real production bundle, with no test hooks or DOM shim available to it.
  const production = createPreviewServer('dist'); await new Promise(resolve => production.listen(0, '127.0.0.1', resolve));
  try {
    const p = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const productionErrors = []; p.on('pageerror', e => productionErrors.push(e.message));
    await p.goto(`http://127.0.0.1:${production.address().port}`);
    await p.waitForTimeout(900);
    assert.equal(await p.evaluate(() => !!globalThis.__MM_DOUYIN_TEST__), false);
    assert.equal(await p.evaluate(() => !!__TT_MOCK__.fatal), false);
    assert.deepEqual(productionErrors, []); await p.close();
    results.push('production bundle boots with test controls stripped');
  } finally { await new Promise(resolve => production.close(resolve)); }
  assert.deepEqual(errors, []);
  await writeFile('docs/browser-verification.json', JSON.stringify({ environment: 'Chromium WebGL2 + browser tt API mock; NOT Douyin IDE or device verification', results, errors }, null, 2));
  console.log(results.map(r => `PASS ${r}`).join('\n'));
} catch (error) { console.error('Browser errors:', errors); throw error; }
finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
