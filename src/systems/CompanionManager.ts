import { COMPANION_DEFS, COMPANION_CONFIG, TOKEN_DROP_TABLE } from '../config';
import type { CompanionDef } from '../config';
import EventBus from './EventBus';

export interface CompanionState {
  unlocked: boolean;
  affection: number;
  tokens: number;
}

export interface CompanionSaveData {
  version: 1;
  companions: Record<string, CompanionState>;
}

const STORAGE_KEY = 'darkdungeon_companions';

export class CompanionManager {
  private state: Record<string, CompanionState>;
  private floorAssignment: Map<number, string>;
  private highestFloorRef: () => number;

  constructor(highestFloorGetter: () => number) {
    this.highestFloorRef = highestFloorGetter;
    this.state = {};
    this.floorAssignment = new Map();
    this.load();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: CompanionSaveData = JSON.parse(raw);
        this.state = parsed.companions ?? {};
      }
    } catch {
      this.state = {};
    }

    // Ensure all companions exist in state
    for (const def of COMPANION_DEFS) {
      if (!this.state[def.id]) {
        this.state[def.id] = { unlocked: false, affection: 0, tokens: 0 };
      }
    }
  }

  private save(): void {
    const data: CompanionSaveData = {
      version: 1,
      companions: this.state,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  assignFloors(): void {
    const ids = COMPANION_DEFS.map((d) => d.id);

    // Fisher-Yates shuffle
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }

    this.floorAssignment.clear();
    for (let floor = 1; floor <= 5; floor++) {
      this.floorAssignment.set(floor, ids[floor - 1]);
    }
  }

  getCompanionForFloor(floor: number): string {
    if (floor <= 5) {
      return this.floorAssignment.get(floor) ?? COMPANION_DEFS[0].id;
    }
    // Floor 6+ random
    const idx = Math.floor(Math.random() * COMPANION_DEFS.length);
    return COMPANION_DEFS[idx].id;
  }

  exportFloorAssignment(): Record<number, string> {
    const result: Record<number, string> = {};
    this.floorAssignment.forEach((companionId, floor) => {
      result[floor] = companionId;
    });
    return result;
  }

  importFloorAssignment(data: Record<number, string>): void {
    this.floorAssignment.clear();
    for (const [floor, companionId] of Object.entries(data)) {
      this.floorAssignment.set(Number(floor), companionId);
    }
  }

  rescue(companionId: string): void {
    const cs = this.state[companionId];
    if (!cs) return;

    const isFirst = !cs.unlocked;
    const gain = isFirst
      ? COMPANION_CONFIG.RESCUE_AFFECTION_FIRST
      : COMPANION_CONFIG.RESCUE_AFFECTION_REPEAT;

    if (isFirst) {
      cs.unlocked = true;
      EventBus.emit('companion-unlocked', { companionId });
    }

    cs.affection = Math.min(cs.affection + gain, COMPANION_CONFIG.AFFECTION_CAP);
    this.save();

    EventBus.emit('companion-rescued', { companionId });
    EventBus.emit('companion-affection-changed', { companionId, affection: cs.affection });
    this.checkStageUnlock(companionId);
  }

  gift(
    companionId: string,
    type: 'token' | 'gold' | 'material',
    amount: number
  ): { affectionGained: number; resourceCost: number } {
    const cs = this.state[companionId];
    if (!cs || !cs.unlocked || cs.affection >= COMPANION_CONFIG.AFFECTION_CAP) {
      return { affectionGained: 0, resourceCost: 0 };
    }

    let affectionGained = 0;
    let resourceCost = 0;

    if (type === 'token') {
      const usable = Math.min(amount, cs.tokens);
      affectionGained = usable * COMPANION_CONFIG.TOKEN_AFFECTION;
      resourceCost = usable;
      cs.tokens -= usable;
    } else if (type === 'gold') {
      affectionGained = amount * COMPANION_CONFIG.GOLD_AFFECTION_PER_100;
      resourceCost = amount;
    } else if (type === 'material') {
      affectionGained = amount * COMPANION_CONFIG.MATERIAL_AFFECTION;
      resourceCost = amount;
    }

    const prevAffection = cs.affection;
    cs.affection = Math.min(cs.affection + affectionGained, COMPANION_CONFIG.AFFECTION_CAP);
    const actualGain = cs.affection - prevAffection;

    this.save();
    EventBus.emit('companion-affection-changed', { companionId, affection: cs.affection });
    this.checkStageUnlock(companionId);

    return { affectionGained: actualGain, resourceCost };
  }

  addTokens(companionId: string, count: number): void {
    const cs = this.state[companionId];
    if (!cs) return;
    cs.tokens += count;
    this.save();
    EventBus.emit('companion-token-collected', { companionId, tokens: cs.tokens });
  }

  getCompanion(id: string): CompanionState & { def: CompanionDef } {
    const cs = this.state[id] ?? { unlocked: false, affection: 0, tokens: 0 };
    const def = COMPANION_DEFS.find((d) => d.id === id)!;
    return { ...cs, def };
  }

  getAllCompanions(): Array<CompanionState & { def: CompanionDef }> {
    return COMPANION_DEFS.map((def) => {
      const cs = this.state[def.id] ?? { unlocked: false, affection: 0, tokens: 0 };
      return { ...cs, def };
    });
  }

  getCurrentStage(companionId: string): number {
    const cs = this.state[companionId];
    if (!cs || !cs.unlocked) return 0;

    const highestFloor = this.highestFloorRef();
    const thresholds = COMPANION_CONFIG.STAGE_THRESHOLDS;
    const floorGates = COMPANION_CONFIG.STAGE_FLOOR_GATES;

    let stage = 0;
    for (let i = 0; i < thresholds.length; i++) {
      if (cs.affection >= thresholds[i] && highestFloor >= floorGates[i]) {
        stage = i + 1;
      }
    }
    return stage;
  }

  private checkStageUnlock(companionId: string): void {
    const cs = this.state[companionId];
    if (!cs || !cs.unlocked) return;

    const highestFloor = this.highestFloorRef();
    const thresholds = COMPANION_CONFIG.STAGE_THRESHOLDS;
    const floorGates = COMPANION_CONFIG.STAGE_FLOOR_GATES;

    for (let i = 0; i < thresholds.length; i++) {
      if (cs.affection >= thresholds[i] && highestFloor >= floorGates[i]) {
        EventBus.emit('companion-stage-unlocked', { companionId, stage: i + 1 });
      }
    }
  }

  debugUnlock(id: string): void {
    const cs = this.state[id];
    if (!cs) return;
    cs.unlocked = true;
    this.save();
  }

  debugSetAffection(id: string, value: number): void {
    const cs = this.state[id];
    if (!cs) return;
    cs.affection = Math.min(value, COMPANION_CONFIG.AFFECTION_CAP);
    this.save();
  }

  debugGiveTokens(id: string, count: number): void {
    const cs = this.state[id];
    if (!cs) return;
    cs.tokens += count;
    this.save();
  }

  debugUnlockAll(): void {
    for (const def of COMPANION_DEFS) {
      const cs = this.state[def.id];
      if (cs) {
        cs.unlocked = true;
        cs.affection = COMPANION_CONFIG.AFFECTION_CAP;
      }
    }
    this.save();
  }

  destroy(): void {
    // no-op
  }
}
