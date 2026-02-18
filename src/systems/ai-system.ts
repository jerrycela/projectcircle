/**
 * AISystem - AI 行為狀態機
 * 使用 if-else 實作簡單狀態轉換，不需行為樹
 * 所有函式使用不可變模式
 */

import { findNearestEnemy, findWeakestEnemy, isInAttackRange } from './combat-system'

// ============ 狀態定義 ============

export enum AIState {
  SPAWNING = 'SPAWNING',
  IDLE = 'IDLE',
  MOVING_TO_TARGET = 'MOVING_TO_TARGET',
  ATTACKING = 'ATTACKING',
}

export interface UnitAI {
  readonly state: AIState
  readonly targetIndex: number | null
  readonly lastAttackTime: number
  readonly spawnTimer: number
}

export interface UpdateAIResult {
  readonly newAI: UnitAI
  readonly moveToX: number | null
  readonly moveToY: number | null
  readonly shouldAttack: boolean
}

// ============ 工廠函式 ============

export function createUnitAI(): UnitAI {
  return {
    state: AIState.SPAWNING,
    targetIndex: null,
    lastAttackTime: 0,
    spawnTimer: 500, // 預設 500ms 部署動畫
  }
}

// ============ 狀態更新 ============

/**
 * 更新 AI 狀態（每幀呼叫）
 * 返回新的 AI 狀態和行為指令
 */
export function updateAI(
  ai: UnitAI,
  aiType: string,
  unitX: number,
  unitY: number,
  moveSpeed: number,
  attackRange: number,
  attackInterval: number,
  enemies: readonly { x: number; y: number; hp: number }[],
  currentTime: number,
  delta: number
): UpdateAIResult {
  const noAction: UpdateAIResult = {
    newAI: ai,
    moveToX: null,
    moveToY: null,
    shouldAttack: false,
  }

  if (ai.state === AIState.SPAWNING) {
    return handleSpawning(ai, delta)
  }

  if (ai.state === AIState.IDLE) {
    return handleIdle(ai, aiType, unitX, unitY, attackRange, enemies)
  }

  if (ai.state === AIState.MOVING_TO_TARGET) {
    return handleMovingToTarget(
      ai, unitX, unitY, moveSpeed, attackRange, enemies, delta
    )
  }

  if (ai.state === AIState.ATTACKING) {
    return handleAttacking(
      ai, unitX, unitY, attackRange, attackInterval, enemies, currentTime
    )
  }

  return noAction
}

// ============ 各狀態處理函式 ============

function handleSpawning(ai: UnitAI, delta: number): UpdateAIResult {
  const remaining = ai.spawnTimer - delta

  if (remaining <= 0) {
    return {
      newAI: { ...ai, state: AIState.IDLE, spawnTimer: 0 },
      moveToX: null,
      moveToY: null,
      shouldAttack: false,
    }
  }

  return {
    newAI: { ...ai, spawnTimer: remaining },
    moveToX: null,
    moveToY: null,
    shouldAttack: false,
  }
}

function handleIdle(
  ai: UnitAI,
  aiType: string,
  unitX: number,
  unitY: number,
  attackRange: number,
  enemies: readonly { x: number; y: number; hp: number }[]
): UpdateAIResult {
  // ranged_stationary: 不移動，只在射程內找目標
  if (aiType === 'ranged_stationary') {
    const targetIdx = findNearestEnemyInRange(unitX, unitY, attackRange, enemies)

    if (targetIdx !== null) {
      return {
        newAI: { ...ai, state: AIState.ATTACKING, targetIndex: targetIdx },
        moveToX: null,
        moveToY: null,
        shouldAttack: false,
      }
    }

    return {
      newAI: ai,
      moveToX: null,
      moveToY: null,
      shouldAttack: false,
    }
  }

  // melee_aggressive: 找最弱敵人
  if (aiType === 'melee_aggressive') {
    const targetIdx = findWeakestEnemy(enemies)

    if (targetIdx !== null) {
      return {
        newAI: { ...ai, state: AIState.MOVING_TO_TARGET, targetIndex: targetIdx },
        moveToX: null,
        moveToY: null,
        shouldAttack: false,
      }
    }

    return {
      newAI: ai,
      moveToX: null,
      moveToY: null,
      shouldAttack: false,
    }
  }

  // melee_tank / support: 找最近敵人
  const targetIdx = findNearestEnemy(unitX, unitY, enemies)

  if (targetIdx !== null) {
    return {
      newAI: { ...ai, state: AIState.MOVING_TO_TARGET, targetIndex: targetIdx },
      moveToX: null,
      moveToY: null,
      shouldAttack: false,
    }
  }

  return {
    newAI: ai,
    moveToX: null,
    moveToY: null,
    shouldAttack: false,
  }
}

function handleMovingToTarget(
  ai: UnitAI,
  unitX: number,
  unitY: number,
  moveSpeed: number,
  attackRange: number,
  enemies: readonly { x: number; y: number; hp: number }[],
  delta: number
): UpdateAIResult {
  // 目標不存在或已死亡 → 回 IDLE
  if (
    ai.targetIndex === null ||
    ai.targetIndex >= enemies.length ||
    enemies[ai.targetIndex].hp <= 0
  ) {
    return {
      newAI: { ...ai, state: AIState.IDLE, targetIndex: null },
      moveToX: null,
      moveToY: null,
      shouldAttack: false,
    }
  }

  const target = enemies[ai.targetIndex]

  // 已到達攻擊範圍 → ATTACKING
  if (isInAttackRange(unitX, unitY, target.x, target.y, attackRange)) {
    return {
      newAI: { ...ai, state: AIState.ATTACKING },
      moveToX: null,
      moveToY: null,
      shouldAttack: false,
    }
  }

  // 計算移動目標位置
  const dx = target.x - unitX
  const dy = target.y - unitY
  const dist = Math.sqrt(dx * dx + dy * dy)

  // 避免除以零
  if (dist === 0) {
    return {
      newAI: { ...ai, state: AIState.ATTACKING },
      moveToX: null,
      moveToY: null,
      shouldAttack: false,
    }
  }

  const moveAmount = moveSpeed * (delta / 1000)
  const moveToX = unitX + (dx / dist) * moveAmount
  const moveToY = unitY + (dy / dist) * moveAmount

  return {
    newAI: ai,
    moveToX,
    moveToY,
    shouldAttack: false,
  }
}

function handleAttacking(
  ai: UnitAI,
  unitX: number,
  unitY: number,
  attackRange: number,
  attackInterval: number,
  enemies: readonly { x: number; y: number; hp: number }[],
  currentTime: number
): UpdateAIResult {
  // 目標不存在或已死亡 → 回 IDLE
  if (
    ai.targetIndex === null ||
    ai.targetIndex >= enemies.length ||
    enemies[ai.targetIndex].hp <= 0
  ) {
    return {
      newAI: { ...ai, state: AIState.IDLE, targetIndex: null },
      moveToX: null,
      moveToY: null,
      shouldAttack: false,
    }
  }

  const target = enemies[ai.targetIndex]

  // 超出攻擊範圍 → MOVING_TO_TARGET（使用遲滯閾值避免振盪）
  const exitRange = attackRange * 1.5
  if (!isInAttackRange(unitX, unitY, target.x, target.y, exitRange)) {
    return {
      newAI: { ...ai, state: AIState.MOVING_TO_TARGET },
      moveToX: null,
      moveToY: null,
      shouldAttack: false,
    }
  }

  // 檢查攻擊冷卻
  const intervalMs = attackInterval * 1000
  if (currentTime - ai.lastAttackTime >= intervalMs) {
    return {
      newAI: { ...ai, lastAttackTime: currentTime },
      moveToX: null,
      moveToY: null,
      shouldAttack: true,
    }
  }

  return {
    newAI: ai,
    moveToX: null,
    moveToY: null,
    shouldAttack: false,
  }
}

// ============ 輔助函式 ============

/**
 * 在射程內尋找最近敵人（供 ranged_stationary 使用）
 */
function findNearestEnemyInRange(
  x: number,
  y: number,
  attackRange: number,
  enemies: readonly { x: number; y: number; hp: number }[]
): number | null {
  let nearestIndex: number | null = null
  let nearestDistSq = Infinity
  const rangeSq = attackRange * attackRange

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]
    if (enemy.hp <= 0) continue

    const dx = enemy.x - x
    const dy = enemy.y - y
    const distSq = dx * dx + dy * dy

    if (distSq <= rangeSq && distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearestIndex = i
    }
  }

  return nearestIndex
}
