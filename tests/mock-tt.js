// Browser-only developer fixture. Never included in dist or the Douyin upload.
(() => {
  const callbacks = {}, pointerTouches = new Map(); let screen;
  const emit = (name, event) => (callbacks[name] ?? []).forEach(cb => cb(event));
  const register = name => cb => (callbacks[name] ??= []).push(cb);
  const touch = e => ({ identifier: e.pointerId, clientX: e.clientX, clientY: e.clientY });
  window.__TT_MOCK__ = { emit, downloads: [], audio: { plays: 0, pauses: 0 }, failPackage: false };
  window.tt = {
    createCanvas() {
      const canvas = document.createElement('canvas');
      if (!screen) {
        screen = canvas; document.body.append(canvas);
        for (const [eventName, apiName] of [['pointerdown','touchStart'], ['pointermove','touchMove'], ['pointerup','touchEnd'], ['pointercancel','touchCancel']]) {
          canvas.addEventListener(eventName, e => {
            e.preventDefault();
            if (eventName === 'pointermove' && !pointerTouches.has(e.pointerId)) return;
            const t = touch(e);
            if (eventName === 'pointerdown') { pointerTouches.set(e.pointerId, t); canvas.setPointerCapture(e.pointerId); }
            if (eventName === 'pointermove') pointerTouches.set(e.pointerId, t);
            if (eventName === 'pointerup' || eventName === 'pointercancel') pointerTouches.delete(e.pointerId);
            emit(apiName, { touches: [...pointerTouches.values()], changedTouches: [t] });
          });
        }
      }
      return canvas;
    },
    createImage: () => new Image(),
    getSystemInfoSync: () => ({ windowWidth: innerWidth, windowHeight: innerHeight, pixelRatio: devicePixelRatio,
      safeArea: { left: 0, right: innerWidth, top: 0, bottom: innerHeight } }),
    loadSubpackage({ name, success, fail }) {
      window.__TT_MOCK__.downloads.push(name);
      let progress;
      setTimeout(() => {
        if (window.__TT_MOCK__.failPackage) { fail({ errMsg: 'Simulated offline package failure' }); return; }
        progress?.({ progress: 100 }); success();
      }, 40);
      return { onProgressUpdate: cb => { progress = cb; } };
    },
    onTouchStart: register('touchStart'), onTouchMove: register('touchMove'),
    onTouchEnd: register('touchEnd'), onTouchCancel: register('touchCancel'),
    onHide: register('hide'), onShow: register('show'), onWindowResize: register('resize'),
    onAudioInterruptionBegin: register('audioInterruption'),
    createInnerAudioContext() {
      const audio = new Audio(); const stats = window.__TT_MOCK__.audio;
      return { set src(value) { audio.src = value; }, set loop(value) { audio.loop = value; }, set volume(value) { audio.volume = value; },
        play() { stats.plays++; void audio.play().catch(() => {}); }, pause() { stats.pauses++; audio.pause(); },
        stop() { audio.pause(); audio.currentTime = 0; }, destroy() { audio.pause(); audio.src = ''; }, onError() {} };
    },
    getStorageSync: key => { const value = localStorage.getItem(key); return value === null ? undefined : JSON.parse(value); },
    setStorageSync: (key, value) => localStorage.setItem(key, JSON.stringify(value)),
    showModal: options => { window.__TT_MOCK__.fatal = options; console.error(options.content); },
  };
  addEventListener('resize', () => emit('resize'));
  addEventListener('pagehide', () => emit('hide'));
})();
