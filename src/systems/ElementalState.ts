import { Element, ELEMENTAL_CONFIG } from '../config';

export class ElementalState {
  public element: Element | null = null;
  public remainingMs: number | null = null;
  private isPermanent: boolean;

  constructor(permanent: boolean) {
    this.isPermanent = permanent;
  }

  apply(element: Element): void {
    if (this.element === element && this.isPermanent) return;
    this.element = element;
    if (!this.isPermanent) {
      this.remainingMs = ELEMENTAL_CONFIG.ELEMENT_ATTACH_DURATION_MS;
    }
  }

  clear(): void {
    this.element = null;
    this.remainingMs = null;
  }

  update(delta: number): boolean {
    if (this.isPermanent || this.element === null || this.remainingMs === null) return false;
    this.remainingMs -= delta;
    if (this.remainingMs <= 0) {
      this.clear();
      return true;
    }
    return false;
  }

  isFlickering(): boolean {
    if (this.remainingMs === null || this.element === null) return false;
    return this.remainingMs <= ELEMENTAL_CONFIG.ELEMENT_FLICKER_START_MS;
  }

  snapshot(): { element: string | null; remainingMs: number | null } {
    return { element: this.element, remainingMs: this.remainingMs };
  }
}
