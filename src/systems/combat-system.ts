/**
 * CombatSystem - 戰鬥傷害計算系統
 * 純函式，確保可測試性和可重播性
 */

/**
 * Calculate damage value
 * Supports damage multiplier for debuff effects (e.g. weaken totem: 1.5 = +50% damage)
 */
export function calculateDamage(attackerATK: number, damageMultiplier: number = 1.0): number {
  return Math.floor(attackerATK * damageMultiplier)
}

/**
 * 判斷兩單位是否在攻擊範圍內
 * 使用歐幾里德距離
 */
export function isInAttackRange(
  x1: number, y1: number,
  x2: number, y2: number,
  attackRange: number
): boolean {
  const dx = x2 - x1
  const dy = y2 - y1
  const distSq = dx * dx + dy * dy
  return distSq <= attackRange * attackRange
}

/**
 * 尋找最近敵人（給 melee_tank / ranged_stationary / support 用）
 * 返回 enemies 陣列中最近的 index，無活著的敵人則返回 null
 */
export function findNearestEnemy(
  x: number, y: number,
  enemies: readonly { x: number; y: number; hp: number }[]
): number | null {
  let nearestIndex: number | null = null
  let nearestDistSq = Infinity

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]
    if (enemy.hp <= 0) continue

    const dx = enemy.x - x
    const dy = enemy.y - y
    const distSq = dx * dx + dy * dy

    if (distSq < nearestDistSq) {
      nearestDistSq = distSq
      nearestIndex = i
    }
  }

  return nearestIndex
}

/**
 * 尋找最弱敵人（給 melee_aggressive 用）
 * 返回 HP 最低的活著敵人 index，無活著的敵人則返回 null
 */
export function findWeakestEnemy(
  enemies: readonly { hp: number }[]
): number | null {
  let weakestIndex: number | null = null
  let lowestHP = Infinity

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i]
    if (enemy.hp <= 0) continue

    if (enemy.hp < lowestHP) {
      lowestHP = enemy.hp
      weakestIndex = i
    }
  }

  return weakestIndex
}

/**
 * 陷阱傷害計算（v12：百分比制）
 * 基於目標最大 HP 的百分比
 */
export function calculateTrapDamage(targetMaxHP: number, damagePercent: number): number {
  return Math.floor(targetMaxHP * damagePercent)
}

/**
 * 狂暴食人魔損血增傷
 * 血量越低，攻擊力越高，有上限
 */
export function calculateBerserkerATK(
  baseATK: number,
  currentHP: number,
  maxHP: number,
  scaling: number,
  maxMultiplier: number
): number {
  const lostPercent = (maxHP - currentHP) / maxHP
  const bonus = baseATK * lostPercent * scaling
  return Math.min(baseATK + bonus, baseATK * maxMultiplier)
}
