/**
 * ProjectCircle - GameState 狀態定義
 * 定義局內狀態和帳號狀態的介面
 */

// 怪物擁有狀態 (帳號永久)
export interface MonsterOwnership {
  monsterId: string
  duplicateCount: number // 抽到的重複次數
  unlockedEvoPaths: string[] // 已解鎖的進化路線
}

// 戰鬥中的怪物實例
export interface MonsterInstance {
  monsterId: string // 基礎怪物ID
  currentHP: number
  maxHP: number
  currentXP: number
  maxXP: number
  slotIndex: number // 部署位置
  evolutionPath?: string // 當前進化路線
  buffs?: string[] // 增益效果
}

// 戰鬥狀態
export interface BattleState {
  isActive: boolean
  currentWave: number
  totalWaves: number
  enemiesRemaining: number
}

// 局內狀態 (每局重置)
export interface RunState {
  currentRoomIndex: number
  conqueredRooms: string[] // 已征服的房間ID列表
  monsters: MonsterInstance[] // 當前部署的怪物
  gold: number
  phase: 'explore' | 'battle' | 'result'
  battleState: BattleState
}

// 帳號狀態 (永久)
export interface AccountState {
  monsterCollection: Record<string, MonsterOwnership> // monsterId -> ownership
  totalPullCount: number // 總抽卡次數
  completedRuns: number // 完成的局數
  highestRoomReached: number // 最高抵達房間
}

// 完整遊戲狀態
export interface GameState {
  readonly run: RunState
  readonly account: AccountState
}

// 初始狀態工廠函式
export function createInitialRunState(): RunState {
  return {
    currentRoomIndex: 0,
    conqueredRooms: [],
    monsters: [],
    gold: 0,
    phase: 'explore',
    battleState: {
      isActive: false,
      currentWave: 0,
      totalWaves: 0,
      enemiesRemaining: 0,
    },
  }
}

export function createInitialAccountState(): AccountState {
  return {
    monsterCollection: {},
    totalPullCount: 0,
    completedRuns: 0,
    highestRoomReached: 0,
  }
}

export function createInitialGameState(): GameState {
  return {
    run: createInitialRunState(),
    account: createInitialAccountState(),
  }
}
