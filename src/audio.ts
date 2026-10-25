import { assetPath, ASSETS } from './assets';
import type { DouyinPlatform, InnerAudio } from './platform';

export class Music {
  enabled: boolean;
  private audio?: InnerAudio;
  private active = false;
  private playing = false;
  constructor(private platform: DouyinPlatform) {
    this.enabled = platform.read<unknown>('mm-douyin-music', true) !== false;
  }
  toggle() { this.enabled = !this.enabled; this.platform.write('mm-douyin-music', this.enabled); this.sync(); }
  setActive(active: boolean) { this.active = active; this.sync(); }
  private sync() {
    const shouldPlay = this.active && this.enabled;
    if (shouldPlay === this.playing) return;
    try {
      if (shouldPlay && !this.audio) {
        this.audio = tt.createInnerAudioContext(); this.audio.src = assetPath(ASSETS.music);
        this.audio.loop = true; this.audio.volume = .35;
        this.audio.onError?.(error => { this.playing = false; console.warn('音乐播放失败', error); });
      }
      if (shouldPlay) this.audio?.play(); else this.audio?.pause();
      this.playing = shouldPlay;
    } catch (error) { this.playing = false; console.warn('音乐暂不可用', error); }
  }
}
