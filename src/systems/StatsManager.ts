import { GAME_CONFIG, UPGRADE_DEFS } from '../config';

export interface StatBlock {
  attackMin: number;
  attackMax: number;
  armor: number;
  critChance: number;
  critDamage: number;
  recovery: number;
  moveSpeed: number;
  maxHp: number;
}

type StatKey = keyof StatBlock;

export class StatsManager {
  private baseStats: StatBlock;
  private bonuses: StatBlock;
  private levels: Record<string, number> = {};

  constructor() {
    this.baseStats = {
      attackMin: GAME_CONFIG.PLAYER_ATTACK.min,
      attackMax: GAME_CONFIG.PLAYER_ATTACK.max,
      armor: GAME_CONFIG.PLAYER_ARMOR,
      critChance: GAME_CONFIG.PLAYER_CRIT_CHANCE,
      critDamage: GAME_CONFIG.PLAYER_CRIT_DAMAGE,
      recovery: GAME_CONFIG.PLAYER_RECOVERY,
      moveSpeed: GAME_CONFIG.PLAYER_SPEED,
      maxHp: GAME_CONFIG.PLAYER_HP,
    };

    this.bonuses = {
      attackMin: 0,
      attackMax: 0,
      armor: 0,
      critChance: 0,
      critDamage: 0,
      recovery: 0,
      moveSpeed: 0,
      maxHp: 0,
    };

    // Initialize upgrade levels to 0
    for (const key of Object.keys(UPGRADE_DEFS)) {
      this.levels[key] = 0;
    }
  }

  getStat(key: StatKey): number {
    return this.baseStats[key] + this.bonuses[key];
  }

  addBonus(key: StatKey, amount: number): void {
    this.bonuses[key] += amount;
  }

  getLevel(upgradeType: string): number {
    return this.levels[upgradeType] ?? 0;
  }

  incrementLevel(upgradeType: string): void {
    this.levels[upgradeType] = (this.levels[upgradeType] ?? 0) + 1;
  }

  exportState(): { bonuses: StatBlock; levels: Record<string, number> } {
    return {
      bonuses: { ...this.bonuses },
      levels: { ...this.levels },
    };
  }

  importState(state: { bonuses: StatBlock; levels: Record<string, number> }): void {
    this.bonuses = { ...state.bonuses };
    this.levels = { ...state.levels };
  }
}
