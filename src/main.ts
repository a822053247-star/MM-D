import { DouyinPlatform } from './platform';
import { FirstRun, FIXED_STEP } from './model';
import { HUD } from './hud';
import { GameView } from './view';
import { TouchInput } from './input';
import { Music } from './audio';
import type { SkillId } from './core/progression';
import { ContentPreparation } from './game/content-preparation';
import { activeEffectContents } from './content/enabled';

declare const __MM_TEST__: boolean;

function boot() {
  const platform = new DouyinPlatform();
  const view = new GameView(platform), hud = new HUD(platform), model = new FirstRun();
  const music = new Music(platform);
  const savedBest = platform.read<unknown>('mm-douyin-best', 0);
  let best = typeof savedBest === 'number' && Number.isFinite(savedBest) ? Math.max(0, savedBest) : 0;
  let ready = false, hidden = false, contextLost = false, loading = false;
  let progress = 0, loadError = '', background: HTMLImageElement | undefined;
  let last = 0, accumulator = 0, hudAge = Infinity, lastVersion = -1, lastMode = model.mode;
  let telemetryAge = 0;
  const activeContents = () => model.run && model.mode !== 'menu' && model.mode !== 'result'
    ? activeEffectContents(model.combat.progression.ranks, id => model.combat.runBuild.hasOrigin(id)) : [];
  const preparation = new ContentPreparation(model, view.effectAssets, {
    changed: () => {
      view.effectAssets.setReferences('build', activeContents());
      input.reset(); accumulator = 0; last = 0; hudAge = Infinity;
      music.setActive(!hidden && !contextLost && model.mode === 'playing');
    },
    interrupted: () => hidden || contextLost || platform.info.windowHeight > platform.info.windowWidth,
  });
  function ensureBuildAssets() {
    const required = activeContents();
    view.effectAssets.setReferences('build', required);
    if (model.mode === 'playing' && required.some(skill => !view.effectAssets.ready(skill))) {
      preparation.confirm(required, () => {}, 'playing'); return false;
    }
    return true;
  }
  const frameTimes: number[] = [];
  // Read-only diagnostics for IDE/device verification. No state mutation or test controls.
  Object.defineProperty(globalThis, '__MM_DOUYIN_STATUS__', { configurable: true, value: () => {
    const sorted = [...frameTimes].sort((a, b) => a - b);
    const average = frameTimes.reduce((sum, value) => sum + value, 0) / Math.max(1, frameTimes.length);
    return { ...model.inspect(), ready, hidden, contextLost, loading, progress, loadError,
      skillResources: view.skillVfx.inspect(),
      projectileEffects: view.projectileVfx.inspect(),
      waterEffects: view.waterVfx.inspect(),
      thunderEffects: view.thunderVfx.inspect(),
      frostEffects: view.frostVfx.inspect(),
      bladeEffects: view.bladeVfx.inspect(),
      positionEffects: view.positionVfx.inspect(),
      areaAttackEffects: view.areaAttackVfx.inspect(),
      dreamEffects: view.dreamVfx.inspect(),
      viewport: { width: platform.info.windowWidth, height: platform.info.windowHeight },
      performance: { samples: sorted.length, averageFPS: average ? +(1000 / average).toFixed(1) : null,
        p95FrameMs: sorted.length ? +sorted[Math.floor((sorted.length - 1) * .95)].toFixed(2) : null,
        drawCalls: view.renderer.info.render.calls, textures: view.renderer.info.memory.textures,
        geometries: view.renderer.info.memory.geometries, programs: view.renderer.info.programs?.length ?? 0 } };
  } });
  const input: TouchInput = new TouchInput(model,
    () => ({ width: platform.info.windowWidth, height: platform.info.windowHeight }), () => hud.buttons, action => {
      if (!ready) { if (action === 'retry' && !loading) void load(); return; }
      if (hidden || contextLost || platform.info.windowHeight > platform.info.windowWidth) return;
      if (action === 'start' || action === 'trial' || action === 'restart') { preparation.reset(); model.start(action === 'restart' ? model.kind : action === 'trial' ? 'trial' : 'campaign'); view.reset(); }
      else if (action === 'pause') model.pause();
      else if (action === 'resume') model.resume();
      else if (action === 'menu') { preparation.reset(); model.setMode('menu'); }
      else if (action === 'dash') model.dash();
      else if (action === 'music') music.toggle();
      else if (action === 'skill-retry') preparation.retry();
      else if (action === 'skill-cancel') preparation.cancel();
      else if (action.startsWith('buy:')) {
        const [, index, ...token] = action.split(':'), item = model.run?.shop?.items[Number(index)];
        preparation.confirm(item?.skill ? [item.skill] : [], () => { model.buy(Number(index), token.join(':')); }, 'shop');
      }
      else if (action.startsWith('refresh:')) model.refreshShop(action.slice(8));
      else if (action.startsWith('next:')) model.nextWave(action.slice(5));
      else if (action.startsWith('choose:')) {
        const skill = action.slice(7) as SkillId;
        preparation.confirm([skill], () => { model.choose(skill); }, 'upgrade');
      }
      ensureBuildAssets();
      if (model.version !== lastVersion) { input.reset(); accumulator = 0; }
      music.setActive(model.mode === 'playing'); hudAge = Infinity;
    });
  tt.onTouchStart(input.start); tt.onTouchMove(input.move); tt.onTouchEnd(input.end); tt.onTouchCancel(input.cancel);
  const suspend = () => { preparation.interrupt(); model.pause(); input.reset(); music.setActive(false); accumulator = 0; last = 0; hudAge = Infinity; };
  tt.onHide(() => { hidden = true; suspend(); });
  tt.onShow(() => { hidden = false; last = 0; resize(); });
  tt.onAudioInterruptionBegin?.(suspend);
  const resize = () => {
    platform.refresh(); input.reset(); accumulator = 0;
    view.resize(); hud.resize(); hudAge = Infinity;
    if (platform.info.windowHeight > platform.info.windowWidth) suspend();
  };
  tt.onWindowResize?.(resize);
  platform.canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; view.effectAssets.setContextAvailable(false); suspend(); });
  platform.canvas.addEventListener('webglcontextrestored', () => { contextLost = false; view.effectAssets.setContextAvailable(true); last = 0; hudAge = Infinity; });
  async function load() {
    if (loading) return;
    loading = true; loadError = ''; progress = 0; input.reset();
    try {
      await platform.loadFirstPlay(percent => { if (loading) progress = percent * .85; });
      view.effectAssets.markDownloaded();
      background = await view.loadImages(); progress = 100; ready = true; hudAge = Infinity;
      console.info('[mm-ready]', JSON.stringify({ ready, mode: model.mode,
        viewport: { width: platform.info.windowWidth, height: platform.info.windowHeight }, safeArea: platform.info.safeArea }));
    } catch (error) { loadError = error instanceof Error ? error.message : String(error); console.error(loadError); }
    finally { loading = false; }
  }
  function frame(timestamp: number) {
    requestAnimationFrame(frame);
    if (hidden || contextLost) return;
    const now = timestamp / 1000;
    const rawDelta = last ? Math.max(0, now - last) : 0;
    const delta = Math.min(.1, rawDelta); last = now;
    if (ready && rawDelta > 0) { frameTimes.push(rawDelta * 1000); if (frameTimes.length > 300) frameTimes.shift(); }
    if (!ready) {
      hud.boot(progress, loadError || undefined); view.render(hud); return;
    }
    if (model.version !== lastVersion) { input.reset(); accumulator = 0; lastVersion = model.version; hudAge = Infinity; }
    ensureBuildAssets();
    let simulated = 0;
    if (model.mode === 'playing' || model.mode === 'rest' || model.mode === 'shop') {
      accumulator += delta;
      for (let steps = 0; accumulator >= FIXED_STEP && steps < 5; steps++) {
        if (!ensureBuildAssets()) break;
        accumulator -= FIXED_STEP;
        model.step(FIXED_STEP, input.movement, ensureBuildAssets);
        view.sampleEffects(model);
        if (!preparation.active) simulated += FIXED_STEP;
        if (!['playing', 'rest', 'shop'].includes(model.mode)) { accumulator = 0; input.reset(); break; }
      }
      accumulator = Math.min(accumulator, FIXED_STEP);
    } else accumulator = 0;
    ensureBuildAssets();
    if (model.mode !== lastMode) {
      if (model.mode === 'result') { best = Math.max(best, model.combat.kills); platform.write('mm-douyin-best', best); }
      lastMode = model.mode; music.setActive(model.mode === 'playing'); hudAge = Infinity;
      if (model.mode === 'upgrade') void view.effectAssets.prepare(model.combat.progression.offers).catch(() => {});
      if (model.mode === 'shop' && model.run?.shop) void view.effectAssets.prepare(model.run.shop.items.flatMap(item => item.skill ? [item.skill] : [])).catch(() => {});
      console.info('[mm-mode]', JSON.stringify((globalThis as unknown as { __MM_DOUYIN_STATUS__: () => unknown }).__MM_DOUYIN_STATUS__()));
    }
    view.update(model, simulated); hudAge += delta;
    if (hudAge >= 1 / 30) { hud.draw(model, input, music.enabled, best, background); hudAge = 0; }
    view.render(hud);
    if (model.mode === 'playing') {
      telemetryAge += delta;
      if (telemetryAge >= 5) {
        telemetryAge = 0;
        console.info('[mm-telemetry]', JSON.stringify((globalThis as unknown as { __MM_DOUYIN_STATUS__: () => unknown }).__MM_DOUYIN_STATUS__()));
      }
    } else telemetryAge = 0;
  }
  if (__MM_TEST__) {
    Object.assign(globalThis, { __MM_DOUYIN_TEST__: { model, input, view, hud, inspect: () => ({ ...model.inspect(), ready, hidden, best, progress, loadError, music: music.enabled }) } });
  }
  requestAnimationFrame(frame); void load();
}

try { boot(); } catch (error) {
  console.error('抖音小游戏启动失败', error);
  tt.showModal({ title: '暂时无法启动', content: error instanceof Error ? error.message : String(error), showCancel: false });
}
