import type { EffectAssets } from '../assets/effect-assets';
import type { FirstRun } from '../model';

type ReturnMode = 'upgrade' | 'shop' | 'playing';
interface PendingAction { skills: readonly string[]; perform: () => void; returnMode: ReturnMode }
interface PreparationHost {
  /** Reset input, timing and HUD, and update resource references after a transition. */
  changed(): void;
  interrupted(): boolean;
}

/** One confirmation gate for upgrades, purchases and already-granted treasure effects. */
export class ContentPreparation {
  private epoch = 0;
  private wasInterrupted = false;
  private pending?: PendingAction;
  constructor(private model: FirstRun, private assets: EffectAssets, private host: PreparationHost) {}
  get active() { return !!this.pending; }

  confirm(skills: readonly string[], perform: () => void, returnMode: ReturnMode) {
    const epoch = ++this.epoch;
    this.pending = undefined; this.model.preparationFailed = false;
    this.assets.setReferences('confirmation', skills);
    if (skills.every(skill => this.assets.ready(skill))) {
      if (this.model.mode === 'preparing') this.model.setMode(returnMode);
      perform(); this.host.changed(); this.assets.setReferences('confirmation', []); return;
    }
    this.pending = { skills: [...skills], perform, returnMode }; this.wasInterrupted = false;
    this.model.setMode('preparing'); this.host.changed();
    void this.assets.prepare(skills).then(() => {
      if (epoch !== this.epoch || this.model.mode !== 'preparing') return;
      this.pending = undefined; this.model.setMode(returnMode); perform();
      if (this.wasInterrupted || this.host.interrupted()) this.model.pause();
      this.host.changed(); this.assets.setReferences('confirmation', []);
    }).catch(error => {
      if (epoch !== this.epoch || this.model.mode !== 'preparing') return;
      this.model.preparationFailed = true; this.host.changed();
      console.warn('技能资源准备失败，可重试', error);
    });
  }
  retry() {
    if (!this.pending || !this.model.preparationFailed) return;
    const { skills, perform, returnMode } = this.pending;
    this.confirm(skills, perform, returnMode);
  }
  cancel() {
    if (!this.pending) return;
    const mode = this.pending.returnMode;
    this.reset();
    // Automatic grants have already changed the build and may only return to camp.
    this.model.setMode(mode === 'playing' ? 'menu' : mode); this.host.changed();
  }
  reset() {
    this.epoch++; this.pending = undefined; this.wasInterrupted = false;
    this.model.preparationFailed = false; this.assets.setReferences('confirmation', []);
  }
  interrupt() { if (this.pending) this.wasInterrupted = true; }
}
