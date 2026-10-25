export const PATH_POINTS = 6;

/** Fixed six-point histories. Callers own object identity; this module owns ring indexing. */
export class PathHistory {
  private xs: Float32Array;
  private zs: Float32Array;
  private times: Float64Array;
  private counts: Uint8Array;
  private heads: Uint8Array;
  constructor(capacity: number) {
    this.xs = new Float32Array(capacity * PATH_POINTS); this.zs = new Float32Array(capacity * PATH_POINTS);
    this.times = new Float64Array(capacity * PATH_POINTS);
    this.counts = new Uint8Array(capacity); this.heads = new Uint8Array(capacity);
  }
  reset() { this.counts.fill(0); this.heads.fill(0); }
  clear(slot: number) { this.counts[slot] = 0; this.heads[slot] = 0; }
  count(slot: number) { return this.counts[slot]; }
  add(slot: number, x: number, z: number, time: number) {
    const head = this.heads[slot], index = slot * PATH_POINTS + head;
    this.xs[index] = x; this.zs[index] = z; this.times[index] = time;
    this.heads[slot] = (head + 1) % PATH_POINTS; this.counts[slot] = Math.min(PATH_POINTS, this.counts[slot] + 1);
  }
  private index(slot: number, back: number) {
    return slot * PATH_POINTS + (this.heads[slot] - 1 - back + PATH_POINTS * 2) % PATH_POINTS;
  }
  x(slot: number, back: number) { return this.xs[this.index(slot, back)]; }
  z(slot: number, back: number) { return this.zs[this.index(slot, back)]; }
  time(slot: number, back: number) { return this.times[this.index(slot, back)]; }
}
