import * as THREE from 'three';
import { assetPath } from '../assets';
import { effectDependencies } from '../content/enabled';
import { EFFECT_ATLASES, EFFECT_TEXTURE_BUDGET_BYTES, type EffectAtlasId } from '../content/effect-recipes';
import type { DouyinPlatform } from '../platform';

interface Entry {
  texture?: THREE.Texture;
  decoded: boolean;
  drawable: boolean;
  pending?: Promise<void>;
  preparing: number;
  used: number;
  error?: string;
}

/** Sole owner of effect textures. References are replaced per owner, never per prepare call. */
export class EffectAssets {
  private entries = new Map<EffectAtlasId, Entry>();
  private owners = new Map<string, Set<EffectAtlasId>>();
  private downloaded = false;
  private contextAvailable = true;
  private serial = 0;
  constructor(private platform: DouyinPlatform, private upload: (texture: THREE.Texture) => void,
    private budget = EFFECT_TEXTURE_BUDGET_BYTES) {}

  markDownloaded() { this.downloaded = true; }
  setContextAvailable(available: boolean) {
    this.contextAvailable = available;
    if (!available) for (const entry of this.entries.values()) entry.drawable = false;
  }
  ready(contentId: string) {
    return this.contextAvailable && effectDependencies([contentId]).every(id => this.entries.get(id)?.drawable);
  }
  texture(id: EffectAtlasId) {
    const entry = this.entries.get(id);
    if (!this.contextAvailable || !entry?.drawable) return undefined;
    entry.used = ++this.serial;
    return entry.texture;
  }
  setReferences(owner: string, contentIds: readonly string[]) {
    const ids = new Set(effectDependencies(contentIds));
    const previous = this.owners.get(owner);
    if ((!previous && !ids.size) || (previous && previous.size === ids.size && [...ids].every(id => previous.has(id)))) return;
    if (ids.size) this.owners.set(owner, ids); else this.owners.delete(owner);
    this.trim();
  }
  async prepare(contentIds: readonly string[]) {
    const ids = effectDependencies(contentIds);
    // Pin the whole request until every dependency settles, including failures.
    const entries = ids.map(id => {
      let entry = this.entries.get(id);
      if (!entry) { entry = { decoded: false, drawable: false, preparing: 0, used: ++this.serial }; this.entries.set(id, entry); }
      entry.preparing++; return entry;
    });
    try {
      const results = await Promise.allSettled(ids.map((id, index) => this.prepareAtlas(id, entries[index])));
      const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failed) throw failed.reason;
    } finally {
      for (const entry of entries) entry.preparing--;
      // Consumers acquire an owner reference before prepare; unowned preloads are LRU candidates.
      this.trim();
    }
  }
  private prepareAtlas(id: EffectAtlasId, entry: Entry): Promise<void> {
    entry.used = ++this.serial;
    if (entry.drawable && this.contextAvailable) return Promise.resolve();
    if (entry.pending) return entry.pending;
    const request = (async () => {
      if (!this.downloaded) throw new Error('首局分包尚未下载完成');
      entry.error = undefined;
      if (!entry.texture) {
        const spec = EFFECT_ATLASES[id];
        const image = await this.platform.image(assetPath(spec.url));
        if (image.width !== spec.width || image.height !== spec.height) throw new Error(`特效图集尺寸不符：${id}`);
        const texture = new THREE.Texture(image);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false; texture.needsUpdate = true;
        entry.texture = texture; entry.decoded = true;
      }
      if (!this.contextAvailable) throw new Error('画面恢复后请重试技能资源准备');
      entry.texture.needsUpdate = true;
      this.upload(entry.texture);
      entry.drawable = true;
    })();
    entry.pending = request.catch(error => {
      entry.drawable = false; entry.error = error instanceof Error ? error.message : String(error); throw error;
    }).finally(() => { entry.pending = undefined; });
    return entry.pending;
  }
  private referenced(id: EffectAtlasId) {
    for (const ids of this.owners.values()) if (ids.has(id)) return true;
    return false;
  }
  private bytes(id: EffectAtlasId) { const spec = EFFECT_ATLASES[id]; return spec.width * spec.height * 4; }
  private residentBytes() {
    let bytes = 0;
    for (const [id, entry] of this.entries) if (entry.texture) bytes += this.bytes(id);
    return bytes;
  }
  /** Explicit release only evicts unreferenced, settled atlases and invalidates ready. */
  release(contentIds: readonly string[]) {
    for (const id of effectDependencies(contentIds)) {
      const entry = this.entries.get(id);
      if (!entry || entry.preparing || entry.pending || this.referenced(id)) continue;
      entry.texture?.dispose(); this.entries.delete(id);
    }
  }
  private trim() {
    let bytes = this.residentBytes();
    if (bytes <= this.budget) return;
    const candidates = [...this.entries].filter(([id, entry]) => entry.texture && !entry.preparing && !entry.pending && !this.referenced(id))
      .sort((a, b) => a[1].used - b[1].used);
    for (const [id, entry] of candidates) {
      if (bytes <= this.budget) break;
      entry.texture!.dispose(); this.entries.delete(id); bytes -= this.bytes(id);
    }
  }
  inspect() {
    const residentBytes = this.residentBytes();
    return { downloaded: this.downloaded, contextAvailable: this.contextAvailable, residentBytes, budgetBytes: this.budget,
      overBudget: residentBytes > this.budget, loaded: [...this.entries].filter(([, entry]) => entry.drawable).map(([id]) => id),
      pending: [...this.entries.values()].filter(entry => entry.pending).length,
      atlases: [...this.entries].map(([id, entry]) => ({ id, downloaded: this.downloaded, decoded: entry.decoded,
        drawable: entry.drawable, referenced: this.referenced(id), preparing: entry.preparing, error: entry.error })) };
  }
}
