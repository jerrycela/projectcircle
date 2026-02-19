/**
 * ProjectCircle - State Actions
 * 純函式，所有狀態更新使用不可變模式
 */

import type { RunState, MonsterInstance, GameState, AccountState } from './game-state'
import { createInitialRunState } from './game-state'

/**
 * 開始新局
 */
export function startNewRun(): RunState {
  return createInitialRunState()
}

/**
 * 獲得金幣
 */
export function earnGold(state: RunState, amount: number): RunState {
  return {
    ...state,
    gold: state.gold + amount,
  }
}

/**
 * 消費金幣
 */
export function spendGold(state: RunState, amount: number): RunState {
  if (state.gold < amount) {
    console.warn('Not enough gold to spend')
    return state
  }

  return {
    ...state,
    gold: state.gold - amount,
  }
}

/**
 * 新增已征服房間
 */
export function addConqueredRoom(state: RunState, roomId: string): RunState {
  return {
    ...state,
    conqueredRooms: [...state.conqueredRooms, roomId],
    currentRoomIndex: state.currentRoomIndex + 1,
  }
}

/**
 * 部署怪物到戰場
 */
export function deployMonster(
  state: RunState,
  monsterId: string,
  slotIndex: number,
  maxHP: number = 100,
  maxXP: number = 100
): RunState {
  // 檢查該位置是否已有怪物
  const existingMonsterIndex = state.monsters.findIndex(m => m.slotIndex === slotIndex)

  const newMonster: MonsterInstance = {
    monsterId,
    currentHP: maxHP,
    maxHP,
    currentXP: 0,
    maxXP,
    slotIndex,
  }

  let newMonsters: MonsterInstance[]
  if (existingMonsterIndex >= 0) {
    // 替換現有怪物
    newMonsters = [...state.monsters]
    newMonsters[existingMonsterIndex] = newMonster
  } else {
    // 新增怪物
    newMonsters = [...state.monsters, newMonster]
  }

  return {
    ...state,
    monsters: newMonsters,
  }
}

/**
 * 怪物進化
 */
export function evolveMonster(
  state: RunState,
  monsterId: string,
  evolutionPath: string
): RunState {
  const monsterIndex = state.monsters.findIndex(m => m.monsterId === monsterId)
  if (monsterIndex === -1) {
    console.warn(`Monster ${monsterId} not found`)
    return state
  }

  const newMonsters = [...state.monsters]
  newMonsters[monsterIndex] = {
    ...newMonsters[monsterIndex],
    evolutionPath,
    currentXP: 0, // 進化後XP歸零
  }

  return {
    ...state,
    monsters: newMonsters,
  }
}

/**
 * 怪物受到傷害
 */
export function damageMonster(state: RunState, monsterId: string, damage: number): RunState {
  const monsterIndex = state.monsters.findIndex(m => m.monsterId === monsterId)
  if (monsterIndex === -1) {
    console.warn(`Monster ${monsterId} not found`)
    return state
  }

  const monster = state.monsters[monsterIndex]
  const newHP = Math.max(0, monster.currentHP - damage)

  const newMonsters = [...state.monsters]
  newMonsters[monsterIndex] = {
    ...monster,
    currentHP: newHP,
  }

  // 如果怪物死亡，從列表中移除
  if (newHP === 0) {
    newMonsters.splice(monsterIndex, 1)
  }

  return {
    ...state,
    monsters: newMonsters,
  }
}

/**
 * 怪物治療
 */
export function healMonster(state: RunState, monsterId: string, healPercent: number): RunState {
  const monsterIndex = state.monsters.findIndex(m => m.monsterId === monsterId)
  if (monsterIndex === -1) {
    console.warn(`Monster ${monsterId} not found`)
    return state
  }

  const monster = state.monsters[monsterIndex]
  const healAmount = monster.maxHP * (healPercent / 100)
  const newHP = Math.min(monster.maxHP, monster.currentHP + healAmount)

  const newMonsters = [...state.monsters]
  newMonsters[monsterIndex] = {
    ...monster,
    currentHP: newHP,
  }

  return {
    ...state,
    monsters: newMonsters,
  }
}

/**
 * 怪物獲得經驗值
 */
export function gainMonsterXP(state: RunState, monsterId: string, xpAmount: number): RunState {
  const monsterIndex = state.monsters.findIndex(m => m.monsterId === monsterId)
  if (monsterIndex === -1) {
    console.warn(`Monster ${monsterId} not found`)
    return state
  }

  const monster = state.monsters[monsterIndex]
  const newXP = Math.min(monster.maxXP, monster.currentXP + xpAmount)

  const newMonsters = [...state.monsters]
  newMonsters[monsterIndex] = {
    ...monster,
    currentXP: newXP,
  }

  return {
    ...state,
    monsters: newMonsters,
  }
}

/**
 * 改變遊戲階段
 */
export function changePhase(
  state: RunState,
  newPhase: 'explore' | 'battle' | 'result'
): RunState {
  return {
    ...state,
    phase: newPhase,
  }
}

/**
 * 開始戰鬥波次
 */
export function startWave(state: RunState, waveNumber: number, totalWaves: number): RunState {
  return {
    ...state,
    battleState: {
      isActive: true,
      currentWave: waveNumber,
      totalWaves,
      enemiesRemaining: 0, // 會由實際系統設定
    },
  }
}

/**
 * 結束戰鬥波次
 */
export function endWave(state: RunState): RunState {
  return {
    ...state,
    battleState: {
      ...state.battleState,
      isActive: false,
      enemiesRemaining: 0,
    },
  }
}

/**
 * 更新敵人剩餘數量
 */
export function updateEnemiesRemaining(state: RunState, count: number): RunState {
  return {
    ...state,
    battleState: {
      ...state.battleState,
      enemiesRemaining: count,
    },
  }
}

/**
 * 從庫存移除一隻怪物實例（發射後消耗）
 * 找到第一個符合 monsterId 的實例並移除
 */
export function consumeMonsterFromInventory(
  state: RunState,
  monsterId: string
): RunState {
  const index = state.monsters.findIndex(m => m.monsterId === monsterId)
  if (index === -1) {
    console.warn(`consumeMonsterFromInventory: monster ${monsterId} not found`)
    return state
  }

  const newMonsters = [...state.monsters]
  newMonsters.splice(index, 1)

  return {
    ...state,
    monsters: newMonsters,
  }
}

/**
 * 新增怪物到局內（房間組合解鎖）
 * 如果同 ID 已存在則跳過
 */
export function addMonsterToRun(
  state: RunState,
  monsterId: string,
  maxHP: number,
  maxXP: number
): RunState {
  // 已存在則跳過
  if (state.monsters.some(m => m.monsterId === monsterId)) {
    return state
  }

  const newMonster: MonsterInstance = {
    monsterId,
    currentHP: maxHP,
    maxHP,
    currentXP: 0,
    maxXP,
    slotIndex: -1,
  }

  return {
    ...state,
    monsters: [...state.monsters, newMonster],
  }
}

/**
 * 檢查房間組合並解鎖怪物
 * - 任何 1 個非起始房間 → 骷髏兵
 * - 養雞場 + 任何其他非起始房間 → 食人魔
 */
export function checkAndUnlockMonsters(
  state: RunState,
  monsterDefs: ReadonlyArray<{ id: string; hp: number; maxXP: number }>
): RunState {
  const nonStarterRooms = state.conqueredRooms.filter(r => r !== 'heartland')
  let updatedState = state

  // 任何 1 個非起始房間 → 解鎖骷髏兵
  if (nonStarterRooms.length >= 1) {
    const skeleton = monsterDefs.find(m => m.id === 'skeleton')
    if (skeleton) {
      updatedState = addMonsterToRun(updatedState, 'skeleton', skeleton.hp, skeleton.maxXP)
    }
  }

  // 養雞場 + 任何其他非起始房間 → 解鎖食人魔
  const hasChickenCoop = nonStarterRooms.includes('chicken_coop')
  const otherNonStarter = nonStarterRooms.filter(r => r !== 'chicken_coop')
  if (hasChickenCoop && otherNonStarter.length >= 1) {
    const ogre = monsterDefs.find(m => m.id === 'ogre')
    if (ogre) {
      updatedState = addMonsterToRun(updatedState, 'ogre', ogre.hp, ogre.maxXP)
    }
  }

  return updatedState
}

/**
 * 新增怪物到收藏 (帳號狀態)
 */
export function addMonsterToCollection(state: AccountState, monsterId: string): AccountState {
  const existing = state.monsterCollection[monsterId]

  return {
    ...state,
    monsterCollection: {
      ...state.monsterCollection,
      [monsterId]: existing
        ? {
            ...existing,
            duplicateCount: existing.duplicateCount + 1,
          }
        : {
            monsterId,
            duplicateCount: 0,
            unlockedEvoPaths: [],
          },
    },
    totalPullCount: state.totalPullCount + 1,
  }
}

/**
 * 解鎖進化路線 (帳號狀態)
 */
export function unlockEvolutionPath(
  state: AccountState,
  monsterId: string,
  evolutionPath: string
): AccountState {
  const existing = state.monsterCollection[monsterId]
  if (!existing) {
    console.warn(`Monster ${monsterId} not in collection`)
    return state
  }

  // 避免重複解鎖
  if (existing.unlockedEvoPaths.includes(evolutionPath)) {
    return state
  }

  return {
    ...state,
    monsterCollection: {
      ...state.monsterCollection,
      [monsterId]: {
        ...existing,
        unlockedEvoPaths: [...existing.unlockedEvoPaths, evolutionPath],
      },
    },
  }
}

/**
 * 更新最高抵達房間 (帳號狀態)
 */
export function updateHighestRoom(state: GameState, roomIndex: number): GameState {
  if (roomIndex <= state.account.highestRoomReached) {
    return state
  }

  return {
    ...state,
    account: {
      ...state.account,
      highestRoomReached: roomIndex,
    },
  }
}

/**
 * 完成一局 (帳號狀態)
 */
export function completeRun(state: AccountState): AccountState {
  return {
    ...state,
    completedRuns: state.completedRuns + 1,
  }
}
