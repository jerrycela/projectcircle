/**
 * UnitSprite - 統一的戰鬥單位 sprite（怪物和英雄共用）
 * 使用 Phaser.Physics.Arcade.Sprite + generateTexture 方案
 */

import Phaser from 'phaser'
import type { UnitAI } from '../systems/ai-system'
import { createUnitAI } from '../systems/ai-system'
import {
  ALLY_COLOR,
  ALLY_OUTLINE,
  ENEMY_COLOR,
  ENEMY_OUTLINE,
  TILE_SIZE,
} from '../config/constants'

export type UnitFaction = 'ally' | 'enemy'

export interface UnitConfig {
  readonly id: string
  readonly definitionId: string
  readonly faction: UnitFaction
  readonly maxHP: number
  readonly attack: number
  readonly attackInterval: number
  readonly moveSpeed: number
  readonly attackRange: number
  readonly aiType: string
  readonly x: number
  readonly y: number
}

// HP bar 尺寸
const HP_BAR_WIDTH = 30
const HP_BAR_HEIGHT = 3
const HP_BAR_OFFSET_Y = 20

// 進化型的 fromMonsterId 對照（用於決定形狀）
const EVOLVED_BASE_MAP: Readonly<Record<string, string>> = {
  goblin_assassin: 'goblin',
  goblin_captain: 'goblin',
  skeleton_archer: 'skeleton',
  skeleton_mage: 'skeleton',
  berserker_ogre: 'ogre',
  ironclad_ogre: 'ogre',
}

/**
 * 取得 definitionId 對應的基礎形狀 ID
 */
function getBaseShapeId(definitionId: string): string {
  return EVOLVED_BASE_MAP[definitionId] ?? definitionId
}

/**
 * 判斷是否為進化型（顏色會稍亮）
 */
function isEvolved(definitionId: string): boolean {
  return definitionId in EVOLVED_BASE_MAP
}

/**
 * 產生 texture key（避免重複建立）
 */
function getTextureKey(definitionId: string, faction: UnitFaction): string {
  return `unit_${definitionId}_${faction}`
}

/**
 * 亮化顏色（進化型用）
 */
function brightenColor(color: number, amount: number): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + amount)
  const g = Math.min(255, ((color >> 8) & 0xff) + amount)
  const b = Math.min(255, (color & 0xff) + amount)
  return (r << 16) | (g << 8) | b
}

/**
 * 在 Graphics 上繪製單位形狀並生成 texture
 */
function generateUnitTexture(
  scene: Phaser.Scene,
  definitionId: string,
  faction: UnitFaction
): string {
  const key = getTextureKey(definitionId, faction)

  // 已有 texture 則不重複建立
  if (scene.textures.exists(key)) {
    return key
  }

  const size = TILE_SIZE / 2
  const textureSize = TILE_SIZE + 4 // 留邊距給描邊
  const center = textureSize / 2
  const evolved = isEvolved(definitionId)
  const baseId = getBaseShapeId(definitionId)

  let fillColor = faction === 'ally' ? ALLY_COLOR : ENEMY_COLOR
  let strokeColor = faction === 'ally' ? ALLY_OUTLINE : ENEMY_OUTLINE

  if (evolved) {
    fillColor = brightenColor(fillColor, 30)
    strokeColor = brightenColor(strokeColor, 30)
  }

  const graphics = scene.add.graphics()
  graphics.lineStyle(2, strokeColor, 1)
  graphics.fillStyle(fillColor, 1)

  switch (baseId) {
    case 'goblin': // 三角形
      graphics.beginPath()
      graphics.moveTo(center, center - size)
      graphics.lineTo(center + size, center + size)
      graphics.lineTo(center - size, center + size)
      graphics.closePath()
      graphics.fillPath()
      graphics.strokePath()
      break

    case 'skeleton': // 菱形
      graphics.beginPath()
      graphics.moveTo(center, center - size)
      graphics.lineTo(center + size, center)
      graphics.lineTo(center, center + size)
      graphics.lineTo(center - size, center)
      graphics.closePath()
      graphics.fillPath()
      graphics.strokePath()
      break

    case 'ogre': // 圓形
      graphics.fillCircle(center, center, size)
      graphics.strokeCircle(center, center, size)
      break

    case 'adventurer': // 正方形
      graphics.fillRect(center - size, center - size, size * 2, size * 2)
      graphics.strokeRect(center - size, center - size, size * 2, size * 2)
      break

    case 'paladin': { // 六邊形
      graphics.beginPath()
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i
        const px = center + Math.cos(angle) * size * 1.2
        const py = center + Math.sin(angle) * size * 1.2
        if (i === 0) {
          graphics.moveTo(px, py)
        } else {
          graphics.lineTo(px, py)
        }
      }
      graphics.closePath()
      graphics.fillPath()
      graphics.strokePath()
      break
    }

    default: // 預設圓形
      graphics.fillCircle(center, center, size)
      graphics.strokeCircle(center, center, size)
      break
  }

  graphics.generateTexture(key, textureSize, textureSize)
  graphics.destroy()

  return key
}

export class UnitSprite extends Phaser.Physics.Arcade.Sprite {
  // 公開屬性
  readonly unitId: string
  readonly definitionId: string
  readonly faction: UnitFaction

  // 戰鬥屬性
  maxHP: number
  currentHP: number
  attack: number
  attackInterval: number
  moveSpeed: number
  attackRange: number
  aiType: string

  // AI 狀態（由外部系統管理）
  ai: UnitAI

  // 視覺元件
  private hpBar: Phaser.GameObjects.Graphics

  constructor(scene: Phaser.Scene, config: UnitConfig) {
    const textureKey = generateUnitTexture(scene, config.definitionId, config.faction)
    super(scene, config.x, config.y, textureKey)

    // 初始化屬性
    this.unitId = config.id
    this.definitionId = config.definitionId
    this.faction = config.faction
    this.maxHP = config.maxHP
    this.currentHP = config.maxHP
    this.attack = config.attack
    this.attackInterval = config.attackInterval
    this.moveSpeed = config.moveSpeed
    this.attackRange = config.attackRange
    this.aiType = config.aiType
    this.ai = createUnitAI()

    // 加入場景
    scene.add.existing(this)
    scene.physics.add.existing(this)

    // 設定 physics body
    const body = this.body as Phaser.Physics.Arcade.Body
    body.setSize(TILE_SIZE, TILE_SIZE)
    body.setOffset(2, 2) // 補償 texture 邊距

    // 建立 HP 條
    this.hpBar = scene.add.graphics()
    this.updateHPBar()
  }

  /**
   * 更新 HP 條顯示
   */
  updateHPBar(): void {
    this.hpBar.clear()

    const hpPercent = Math.max(0, this.currentHP / this.maxHP)
    const barX = this.x - HP_BAR_WIDTH / 2
    const barY = this.y + HP_BAR_OFFSET_Y

    // 背景（暗灰）
    this.hpBar.fillStyle(0x333333, 0.8)
    this.hpBar.fillRect(barX, barY, HP_BAR_WIDTH, HP_BAR_HEIGHT)

    // 前景（依 HP 百分比變色）
    let barColor: number
    if (hpPercent > 0.5) {
      barColor = 0x44cc44 // 綠色
    } else if (hpPercent > 0.25) {
      barColor = 0xcccc44 // 黃色
    } else {
      barColor = 0xcc4444 // 紅色
    }

    this.hpBar.fillStyle(barColor, 1)
    this.hpBar.fillRect(barX, barY, HP_BAR_WIDTH * hpPercent, HP_BAR_HEIGHT)
  }

  /**
   * 受擊閃白效果（0.1s）
   */
  flashWhite(): void {
    this.setTintFill(0xffffff)
    this.scene.time.delayedCall(100, () => {
      this.clearTint()
    })
  }

  /**
   * 死亡動畫（0.4s alpha+scale 淡出）
   */
  playDeathAnimation(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 400,
        ease: 'Power2',
        onComplete: () => {
          resolve()
        },
      })

      // HP 條也一起淡出
      this.scene.tweens.add({
        targets: this.hpBar,
        alpha: 0,
        duration: 400,
        ease: 'Power2',
      })
    })
  }

  /**
   * 部署動畫（0.5s scale 0 -> 1 + 停頓）
   */
  playSpawnAnimation(): Promise<void> {
    this.setScale(0)
    this.hpBar.setAlpha(0)

    return new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: this,
        scaleX: 1,
        scaleY: 1,
        duration: 500,
        ease: 'Back.easeOut',
        onComplete: () => {
          resolve()
        },
      })

      this.scene.tweens.add({
        targets: this.hpBar,
        alpha: 1,
        duration: 500,
        ease: 'Power2',
      })
    })
  }

  /**
   * 是否存活
   */
  isAlive(): boolean {
    return this.currentHP > 0 && this.active
  }

  /**
   * 每幀更新（同步 HP 條位置）
   */
  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta)
    this.updateHPBar()
  }

  /**
   * 清理所有資源
   */
  cleanup(): void {
    this.scene.tweens.killTweensOf(this)
    this.scene.tweens.killTweensOf(this.hpBar)
    this.hpBar.destroy()
    this.destroy()
  }
}
