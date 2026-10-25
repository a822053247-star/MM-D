// Additional compatibility harness: no window, document, HTMLImageElement or HTMLCanvasElement.
// Native tt image/canvas objects are approximated using worker OffscreenCanvas.
const callbacks = {};
const on = name => cb => (callbacks[name] ??= []).push(cb);
const emit = (name, event) => (callbacks[name] ?? []).forEach(cb => cb(event));
globalThis.requestAnimationFrame = cb => setTimeout(() => cb(performance.now()), 16);
globalThis.cancelAnimationFrame = id => clearTimeout(id);
globalThis.tt = {
  createCanvas: () => new OffscreenCanvas(960, 540),
  createImage() {
    const image = new OffscreenCanvas(1, 1);
    Object.defineProperty(image, 'src', { set(url) {
      fetch(url).then(response => response.blob()).then(createImageBitmap).then(bitmap => {
        image.width = bitmap.width; image.height = bitmap.height;
        image.getContext('2d').drawImage(bitmap, 0, 0); bitmap.close(); image.onload?.();
      }).catch(error => image.onerror?.(error));
    } });
    return image;
  },
  getSystemInfoSync: () => ({ windowWidth: 960, windowHeight: 540, pixelRatio: 1 }),
  loadSubpackage({ success }) { setTimeout(success, 1); return {}; },
  onTouchStart: on('start'), onTouchMove: on('move'), onTouchEnd: on('end'), onTouchCancel: on('cancel'),
  onHide: on('hide'), onShow: on('show'), onWindowResize: on('resize'),
  createInnerAudioContext: () => ({ play() {}, pause() {}, stop() {}, destroy() {} }),
  getStorageSync() {}, setStorageSync() {},
  showModal(options) { postMessage({ type: 'fatal', error: options.content }); },
};
addEventListener('error', event => postMessage({ type: 'error', error: event.message }));
const consoleError = console.error;
console.error = (...args) => { postMessage({ type: 'console-error', error: args.map(String).join(' ') }); consoleError(...args); };
importScripts('/game.js');
let started = false;
setInterval(() => {
  const test = globalThis.__MM_DOUYIN_TEST__;
  if (!test?.inspect().ready) return;
  if (!started) {
    const b = test.hud.buttons.find(b => b.action === 'start');
    if (!b) return;
    const touch = { identifier: 1, clientX: b.x + b.w / 2, clientY: b.y + b.h / 2 };
    emit('start', { touches: [touch], changedTouches: [touch] });
    emit('end', { touches: [], changedTouches: [touch] }); started = true;
    test.model.combat.spawn('normal', 0, 4, 0); test.model.combat.spawn('tank', -4, 4, 0);
  }
  postMessage({ type: 'status', state: test.inspect(), noDOM: typeof window === 'undefined' && typeof document === 'undefined' });
}, 100);
