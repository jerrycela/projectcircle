/**
 * SpawnSystem - 生成系統
 * 管理英雄從破口湧入和怪物部署
 */

import type Phaser from 'phaser'
import { UnitSprite } from '../entities/unit-sprite'
import {
  GAME_WIDTH,
  ROOM_WIDTH,
  ROOM_HEIGHT,
} from '../config/constants'

// 房間渲染常數（與 explore-phase 同步）
const ROOM_X = (GAME_WIDTH - ROOM_WIDTH) / 2 // 20
const ROOM_Y = 20

// 部署槽位世界座標
export const DEPLOY_SLOT_POSITIONS: readonly { readonly x: number; readonly y: number }[] = [
  { x: ROOM_X + ROOM_WIDTH / 2, y: ROOM_Y + ROOM_HEIGHT * 0.6 },     // 前排
  { x: ROOM_X + ROOM_WIDTH * 0.25, y: ROOM_Y + ROOM_HEIGHT * 0.8 },  // 左後
  { x: ROOM_X + ROOM_WIDTH * 0.75, y: ROOM_Y + ROOM_HEIGHT * 0.8 },  // 右後
]

/**
 * 取得破口位置（英雄進場點，依方向）
 */
export function getBreachPosition(direction: string): { readonly x: number; readonly y: number } {
  switch (direction) {
    case 'up':
      return { x: ROOM_X + ROOM_WIDTH / 2, y: ROOM_Y + 20 }
    case 'left':
      return { x: ROOM_X + 20, y: ROOM_Y + ROOM_HEIGHT / 2 }
    case 'right':
      return { x: ROOM_X + ROOM_WIDTH - 20, y: ROOM_Y + ROOM_HEIGHT / 2 }
    default:
      return { x: ROOM_X + ROOM_WIDTH / 2, y: ROOM_Y + 20 }
  }
}

export interface SpawnStats {
  readonly hp: number
  readonly attack: number
  readonly attackInterval: number
  readonly moveSpeed: number
  readonly attackRange: number
  readonly aiType: string
}

export class SpawnSystem {
  private readonly scene: Phaser.Scene
  private allies: UnitSprite[] = []
  private enemies: UnitSprite[] = []
  private nextUnitId = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  /**
   * 生成怪物到指定槽位
   * 返回 null 表示槽位不合法
   */
  spawnMonster(
    definitionId: string,
    slotIndex: number,
    stats: SpawnStats
  ): UnitSprite | null {
    if (slotIndex < 0 || slotIndex >= DEPLOY_SLOT_POSITIONS.length) {
      return null
    }

    const pos = DEPLOY_SLOT_POSITIONS[slotIndex]
    const config = {
      id: this.generateUnitId(),
      definitionId,
      faction: 'ally' as const,
      maxHP: stats.hp,
      attack: stats.attack,
      attackInterval: stats.attackInterval,
      moveSpeed: stats.moveSpeed,
      attackRange: stats.attackRange,
      aiType: stats.aiType,
      x: pos.x,
      y: pos.y,
    }

    const unit = new UnitSprite(this.scene, config)
    void unit.playSpawnAnimation()
    this.allies = [...this.allies, unit]

    return unit
  }

  /**
   * 生成英雄從破口進入
   */
  spawnHero(
    definitionId: string,
    breachDirection: string,
    stats: SpawnStats
  ): UnitSprite {
    const pos = getBreachPosition(breachDirection)
    const config = {
      id: this.generateUnitId(),
      definitionId,
      faction: 'enemy' as const,
      maxHP: stats.hp,
      attack: stats.attack,
      attackInterval: stats.attackInterval,
      moveSpeed: stats.moveSpeed,
      attackRange: stats.attackRange,
      aiType: stats.aiType,
      x: pos.x,
      y: pos.y,
    }

    const unit = new UnitSprite(this.scene, config)
    this.enemies = [...this.enemies, unit]

    return unit
  }

  /**
   * 取得所有我方單位（唯讀）
   */
  getAllies(): readonly UnitSprite[] {
    return this.allies
  }

  /**
   * 取得所有敵方單位（唯讀）
   */
  getEnemies(): readonly UnitSprite[] {
    return this.enemies
  }

  /**
   * 移除已死亡的單位
   */
  removeDeadUnits(): void {
    const deadAllies = this.allies.filter((u) => !u.isAlive())
    const deadEnemies = this.enemies.filter((u) => !u.isAlive())

    for (const unit of deadAllies) {
      unit.cleanup()
    }
    for (const unit of deadEnemies) {
      unit.cleanup()
    }

    this.allies = this.allies.filter((u) => u.isAlive())
    this.enemies = this.enemies.filter((u) => u.isAlive())
  }

  /**
   * 清理所有 sprites
   */
  cleanup(): void {
    for (const unit of this.allies) {
      unit.cleanup()
    }
    for (const unit of this.enemies) {
      unit.cleanup()
    }
    this.allies = []
    this.enemies = []
  }

  private generateUnitId(): string {
    const id = `unit_${this.nextUnitId}`
    this.nextUnitId += 1
    return id
  }
}
