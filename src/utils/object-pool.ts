/**
 * 物件池實作
 * 用於重複使用遊戲物件，減少 GC 壓力
 */

export class ObjectPool<T> {
  private available: T[] = [];
  private active: Set<T> = new Set();
  private factory: () => T;
  private reset?: (obj: T) => void;

  constructor(factory: () => T, reset?: (obj: T) => void) {
    this.factory = factory;
    this.reset = reset;
  }

  /**
   * 預熱物件池
   */
  preWarm(count: number): void {
    for (let i = 0; i < count; i++) {
      this.available.push(this.factory());
    }
  }

  /**
   * 取得物件
   */
  acquire(): T | null {
    let obj: T;

    if (this.available.length > 0) {
      obj = this.available.pop()!;
    } else {
      obj = this.factory();
    }

    this.active.add(obj);
    return obj;
  }

  /**
   * 釋放物件回池中
   */
  release(obj: T): void {
    if (!this.active.has(obj)) {
      return;
    }

    this.active.delete(obj);

    if (this.reset) {
      this.reset(obj);
    }

    this.available.push(obj);
  }

  /**
   * 取得活躍物件數量
   */
  get activeCount(): number {
    return this.active.size;
  }

  /**
   * 取得可用物件數量
   */
  get availableCount(): number {
    return this.available.length;
  }

  /**
   * 清空物件池
   */
  clear(): void {
    this.available = [];
    this.active.clear();
  }
}
