/**
 * TrapSystem - Enhanced trap placement & trigger system
 * Supports 5 trap types: spike, swamp, bouncer, totem, alarm
 *
 * Types:
 * - instant_damage (spike): One-time % HP damage, consumed on trigger
 * - persistent_area (swamp): Continuous slow effect, NOT consumed
 * - persistent_area (totem): Continuous damage multiplier, NOT consumed
 * - displacement (bouncer): One-time knockback, consumed on trigger, enemy-only
 * - buff_trigger (alarm): One-time ally buff, consumed on trigger
 */

import type { TrapDefinition } from '../data/schemas'

// ============ Trap Instance (runtime) ============

export type TrapType = 'spike_trap' | 'slow_swamp' | 'bouncer' | 'weaken_totem' | 'alarm_bell'

export interface TrapInstance {
  readonly id: string
  readonly definitionId: TrapType
  readonly x: number
  readonly y: number
  readonly triggerRadius: number
  readonly definition: TrapDefinition
  triggered: boolean            // For one-time traps: has been consumed
}

// ============ Trigger Results ============

export interface SpikeTriggerResult {
  readonly type: 'spike'
  readonly trapId: string
  readonly enemyIndex: number
  readonly damage: number
}

export interface SwampEffect {
  readonly type: 'swamp'
  readonly trapId: string
  readonly enemyIndex: number
  readonly slowPercent: number   // 0-1, e.g. 0.5 = 50% speed reduction
}

export interface BouncerTriggerResult {
  readonly type: 'bouncer'
  readonly trapId: string
  readonly enemyIndex: number
  readonly forceX: number        // Knockback direction X component
  readonly forceY: number        // Knockback direction Y component
  readonly force: number         // Knockback magnitude
}

export interface TotemEffect {
  readonly type: 'totem'
  readonly trapId: string
  readonly enemyIndex: number
  readonly damageMultiplier: number  // e.g. 1.5 = +50% damage taken
}

export interface AlarmTriggerResult {
  readonly type: 'alarm'
  readonly trapId: string
  readonly x: number             // Alarm position (for finding nearby allies)
  readonly y: number
  readonly attackSpeedMultiplier: number
  readonly duration: number      // ms
  readonly buffRadius: number    // pixels
}

export type TrapTriggerResult = SpikeTriggerResult | BouncerTriggerResult | AlarmTriggerResult
export type FieldEffect = SwampEffect | TotemEffect

// ============ TrapSystem ============

export class TrapSystem {
  private traps: TrapInstance[] = []
  private nextTrapId = 0

  /**
   * Place a trap from a TrapDefinition
   */
  placeTrap(x: number, y: number, definition: TrapDefinition): TrapInstance {
    const trap: TrapInstance = {
      id: `trap_${this.nextTrapId}`,
      definitionId: definition.id as TrapType,
      x,
      y,
      triggerRadius: definition.triggerRadius,
      definition,
      triggered: false,
    }
    this.nextTrapId += 1
    this.traps = [...this.traps, trap]
    return trap
  }

  /**
   * Place a trap with a specific instance ID (for restoring from state)
   */
  placeTrapWithId(instanceId: string, x: number, y: number, definition: TrapDefinition): TrapInstance {
    const trap: TrapInstance = {
      id: instanceId,
      definitionId: definition.id as TrapType,
      x,
      y,
      triggerRadius: definition.triggerRadius,
      definition,
      triggered: false,
    }
    this.traps = [...this.traps, trap]
    return trap
  }

  /**
   * Check one-time triggers (spike, bouncer, alarm)
   * Called every frame. Returns events for traps that fired this frame.
   * Each enemy triggers at most one one-time trap per frame.
   */
  checkOneTimeTriggers(
    enemies: readonly { x: number; y: number; maxHP: number; triggeredTrap?: boolean }[]
  ): TrapTriggerResult[] {
    const results: TrapTriggerResult[] = []

    for (let enemyIdx = 0; enemyIdx < enemies.length; enemyIdx++) {
      const enemy = enemies[enemyIdx]
      if (enemy.triggeredTrap) continue

      let closestTrap: TrapInstance | null = null
      let closestDistSq = Infinity

      for (const trap of this.traps) {
        if (trap.triggered) continue
        // Only check one-time trap categories
        const cat = trap.definition.category
        if (cat !== 'instant_damage' && cat !== 'displacement' && cat !== 'buff_trigger') continue

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
        const def = closestTrap.definition

        if (def.category === 'instant_damage' && def.damagePercent !== undefined) {
          results.push({
            type: 'spike',
            trapId: closestTrap.id,
            enemyIndex: enemyIdx,
            damage: Math.floor(enemy.maxHP * def.damagePercent),
          })
        } else if (def.category === 'displacement' && def.displacement) {
          // Calculate knockback direction: away from trap center
          const dx = enemy.x - closestTrap.x
          const dy = enemy.y - closestTrap.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const nx = dist > 0 ? dx / dist : 0
          const ny = dist > 0 ? dy / dist : -1 // Default: push upward
          results.push({
            type: 'bouncer',
            trapId: closestTrap.id,
            enemyIndex: enemyIdx,
            forceX: nx * def.displacement.force,
            forceY: ny * def.displacement.force,
            force: def.displacement.force,
          })
        } else if (def.category === 'buff_trigger' && def.buffEffect) {
          results.push({
            type: 'alarm',
            trapId: closestTrap.id,
            x: closestTrap.x,
            y: closestTrap.y,
            attackSpeedMultiplier: def.buffEffect.attackSpeedMultiplier,
            duration: def.buffEffect.duration,
            buffRadius: def.buffEffect.radius,
          })
        }
      }
    }

    return results
  }

  /**
   * Get active field effects (swamp slow, totem weaken)
   * Called every frame. Returns all persistent effects currently affecting enemies.
   * Persistent traps are NOT consumed.
   */
  getActiveFieldEffects(
    enemies: readonly { x: number; y: number }[]
  ): FieldEffect[] {
    const effects: FieldEffect[] = []

    for (const trap of this.traps) {
      if (trap.triggered) continue
      if (trap.definition.category !== 'persistent_area') continue

      const radiusSq = trap.triggerRadius * trap.triggerRadius

      for (let enemyIdx = 0; enemyIdx < enemies.length; enemyIdx++) {
        const enemy = enemies[enemyIdx]
        const dx = enemy.x - trap.x
        const dy = enemy.y - trap.y
        const distSq = dx * dx + dy * dy

        if (distSq <= radiusSq) {
          if (trap.definition.slowPercent !== undefined) {
            effects.push({
              type: 'swamp',
              trapId: trap.id,
              enemyIndex: enemyIdx,
              slowPercent: trap.definition.slowPercent,
            })
          }
          if (trap.definition.damageMultiplier !== undefined) {
            effects.push({
              type: 'totem',
              trapId: trap.id,
              enemyIndex: enemyIdx,
              damageMultiplier: trap.definition.damageMultiplier,
            })
          }
        }
      }
    }

    return effects
  }

  /**
   * Get all traps (read-only)
   */
  getTraps(): readonly TrapInstance[] {
    return this.traps
  }

  /**
   * Get active (non-triggered) traps
   */
  getActiveTraps(): readonly TrapInstance[] {
    return this.traps.filter(t => !t.triggered)
  }

  /**
   * Remove triggered one-time traps
   */
  removeTriggered(): void {
    this.traps = this.traps.filter(t => !t.triggered)
  }

  /**
   * Remove a specific trap by ID
   */
  removeTrap(trapId: string): void {
    this.traps = this.traps.filter(t => t.id !== trapId)
  }

  /**
   * Cleanup all traps
   */
  cleanup(): void {
    this.traps = []
    this.nextTrapId = 0
  }
}
