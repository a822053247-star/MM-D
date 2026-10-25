export interface Touch { identifier: number; clientX: number; clientY: number }
export interface TouchEvent { touches: Touch[]; changedTouches: Touch[] }
export interface SystemInfo {
  windowWidth: number; windowHeight: number; pixelRatio: number;
  safeArea?: { left: number; right: number; top: number; bottom: number };
}
/** Some IDE/device versions report portrait safeArea after rotating the game. */
export function normalizeSafeArea(info: SystemInfo) {
  const w = info.windowWidth, h = info.windowHeight, area = info.safeArea;
  if (!area) return { left: 0, right: w, top: 0, bottom: h };
  if (area.left >= 0 && area.top >= 0 && area.right <= w && area.bottom <= h
    && area.right > area.left && area.bottom > area.top) return area;
  if (w > h && area.right <= h && area.bottom <= w && area.bottom > h) {
    // Use the larger portrait vertical inset on both landscape sides. This is
    // conservative for either rotation and does not depend on a guessed home side.
    const inset = Math.max(0, area.top, w - area.bottom);
    if (inset < w * .2) return { left: inset, right: w - inset, top: 0, bottom: h };
  }
  return { left: 0, right: w, top: 0, bottom: h };
}
export interface InnerAudio {
  src: string; loop: boolean; volume: number;
  play(): void; pause(): void; stop(): void; destroy(): void;
  onError?(cb: (error: unknown) => void): void;
}
export interface DouyinAPI {
  createCanvas(): HTMLCanvasElement;
  createImage(): HTMLImageElement;
  getSystemInfoSync(): SystemInfo;
  loadSubpackage(options: { name: string; success(): void; fail(error: unknown): void }): {
    onProgressUpdate?(cb: (event: { progress: number }) => void): void;
  };
  onTouchStart(cb: (event: TouchEvent) => void): void;
  onTouchMove(cb: (event: TouchEvent) => void): void;
  onTouchEnd(cb: (event: TouchEvent) => void): void;
  onTouchCancel(cb: (event: TouchEvent) => void): void;
  onHide(cb: () => void): void;
  onShow(cb: () => void): void;
  onWindowResize?(cb: () => void): void;
  onAudioInterruptionBegin?(cb: () => void): void;
  createInnerAudioContext(): InnerAudio;
  getStorageSync(key: string): unknown;
  setStorageSync(key: string, value: unknown): void;
  showModal(options: { title: string; content: string; showCancel: boolean }): void;
}
declare global { var tt: DouyinAPI; }

export class DouyinPlatform {
  readonly canvas = tt.createCanvas(); // The first canvas is the only on-screen canvas.
  info = tt.getSystemInfoSync();
  createCanvas() { return tt.createCanvas(); }
  refresh() { this.info = tt.getSystemInfoSync(); }
  loadFirstPlay(progress: (percent: number) => void) {
    return new Promise<void>((resolve, reject) => {
      const watchdog = setTimeout(() => reject(new Error('首局资源下载超时，请点击重试')), 30000);
      const task = tt.loadSubpackage({ name: 'first-play',
        success: () => { clearTimeout(watchdog); progress(100); resolve(); },
        fail: error => { clearTimeout(watchdog); reject(new Error(`首局资源下载失败：${JSON.stringify(error)}`)); },
      });
      task.onProgressUpdate?.(event => progress(event.progress));
    });
  }
  image(path: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const image = tt.createImage();
      const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error(`图片加载超时：${path}`)); }, 15000);
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); reject(new Error(`图片无法解码：${path}`)); };
      image.src = path;
    });
  }
  read<T>(key: string, fallback: T): T {
    try { return (tt.getStorageSync(key) as T) ?? fallback; } catch { return fallback; }
  }
  write(key: string, value: unknown) { try { tt.setStorageSync(key, value); } catch { /* Storage cannot block play. */ } }
}
