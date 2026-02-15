/**
 * Seeded RNG - 使用 mulberry32 算法
 * 確保可重播性（PvP replay）
 */

export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /**
   * mulberry32 算法
   * 返回 [0, 1) 的浮點數
   */
  next(): number {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * 返回 [min, max) 的整數
   */
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min)) + min;
  }

  /**
   * 返回 [min, max) 的浮點數
   */
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /**
   * 重設 seed
   */
  setSeed(seed: number): void {
    this.state = seed;
  }

  /**
   * 取得當前狀態（用於序列化）
   */
  getState(): number {
    return this.state;
  }
}
