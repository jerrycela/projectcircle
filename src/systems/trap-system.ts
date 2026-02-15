/**
 * TrapSystem - 陷阱放置與觸發系統
 * 規則：每個敵人只觸發一個陷阱 (v12)
 * 傷害基於目標最大 HP 百分比
 */

export interface TrapInstance {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly damagePercent: number   // 0.3 = 30% max HP
  readonly triggerRadius: number   // 30px
  triggered: boolean
}

export interface TrapTriggerResult {
  readonly trapId: string
  readonly enemyIndex: number
  readonly damage: number
}

export class TrapSystem {
  private traps: TrapInstance[] = []
  private nextTrapId = 0

  /**
   * 放置陷阱
   */
  placeTrap(
    x: number,
    y: number,
    damagePercent: number,
    triggerRadius: number
  ): TrapInstance {
    const trap: TrapInstance = {
      id: `trap_${this.nextTrapId}`,
      x,
      y,
      damagePercent,
      triggerRadius,
      triggered: false,
    }
    this.nextTrapId += 1
    this.traps = [...this.traps, trap]
    return trap
  }

  /**
   * 檢查敵人是否觸發陷阱（每幀呼叫）
   * 規則：每個敵人只觸發一個陷阱（v12）
   * 如果一個敵人同時踩到多個陷阱，只觸發最近的那個
   */
  checkTriggers(
    enemies: readonly { x: number; y: number; maxHP: number; triggeredTrap?: boolean }[]
  ): TrapTriggerResult[] {
    const results: TrapTriggerResult[] = []

    for (let enemyIdx = 0; enemyIdx < enemies.length; enemyIdx++) {
      const enemy = enemies[enemyIdx]

      // 已觸發過陷阱的敵人跳過
      if (enemy.triggeredTrap) continue

      let closestTrap: TrapInstance | null = null
      let closestDistSq = Infinity

      for (const trap of this.traps) {
        if (trap.triggered) continue

        const dx = enemy.x - trap.x
        const dy = enemy.y - trap.y
        const distSq = dx * dx + dy * dy
        const radiusSq = trap.triggerRadius * trap.triggerRadius

        if (distSq <= radiusSq && distSq < closestDistSq) {
          closestDistSq = distSq
          closestTrap = trap
        }
      }

      if (closestTrap !== null) {
        closestTrap.triggered = true
        const damage = Math.floor(enemy.maxHP * closestTrap.damagePercent)
        results.push({
          trapId: closestTrap.id,
          enemyIndex: enemyIdx,
          damage,
        })
      }
    }

    return results
  }

  /**
   * 取得所有陷阱（唯讀）
   */
  getTraps(): readonly TrapInstance[] {
    return this.traps
  }

  /**
   * 移除已觸發的陷阱
   */
  removeTriggered(): void {
    this.traps = this.traps.filter(t => !t.triggered)
  }

  /**
   * 清理所有陷阱
   */
  cleanup(): void {
    this.traps = []
    this.nextTrapId = 0
  }
}
