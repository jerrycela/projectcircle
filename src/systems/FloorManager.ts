import { GAME_CONFIG } from '../config';

export interface FloorConfig {
  roomCount: { min: number; max: number };
  roomSize: { min: number; max: number };
  enemiesPerRoom: { min: number; max: number };
  enemyHpScale: number;
  enemyAtkScale: number;
}

export interface FloorState {
  currentFloor: number;
  highestFloor: number;
}

export class FloorManager {
  public currentFloor: number;
  public highestFloor: number;

  constructor(state?: FloorState) {
    this.currentFloor = state?.currentFloor ?? 1;
    this.highestFloor = state?.highestFloor ?? 1;
  }

  getFloorConfig(): FloorConfig {
    const f = this.currentFloor;
    return {
      roomCount: {
        min: Math.min(GAME_CONFIG.ROOM_COUNT.min + Math.floor(f / 3), 14),
        max: Math.min(GAME_CONFIG.ROOM_COUNT.max + Math.floor(f / 3), 16),
      },
      roomSize: {
        min: GAME_CONFIG.ROOM_SIZE.min,
        max: Math.min(GAME_CONFIG.ROOM_SIZE.max + Math.floor(f / 5), 14),
      },
      enemiesPerRoom: {
        min: Math.min(GAME_CONFIG.ENEMIES_PER_ROOM.min + Math.floor(f / 4), 8),
        max: Math.min(GAME_CONFIG.ENEMIES_PER_ROOM.max + Math.floor(f / 4), 12),
      },
      enemyHpScale: 1.0 + (f - 1) * 0.15,
      enemyAtkScale: 1.0 + (f - 1) * 0.10,
    };
  }

  advanceFloor(): void {
    this.currentFloor++;
    this.highestFloor = Math.max(this.highestFloor, this.currentFloor);
  }

  resetToFloor1(): void {
    this.currentFloor = 1;
  }

  exportState(): FloorState {
    return { currentFloor: this.currentFloor, highestFloor: this.highestFloor };
  }
}
