/**
 * ResultPhase - Battle result display, evolution, and room selection
 *
 * Flow (Battle Won):
 * 1. Summary panel: gold earned, XP gained per monster (~2s)
 * 2. Evolution check: if any monster >= 30 XP, offer 2 paths
 * 3. Room selection: 3-pick-1 from treasury/training_ground/chicken_coop
 * 4. Apply room to grid, emit 'result-complete'
 *
 * Flow (Battle Lost):
 * 1. "Run Over" text + final stats
 * 2. "Try Again" button → emit 'run-over'
 */

import Phaser from 'phaser'
import type { Phase } from './phase-manager'
import type { RoomDefinition, EvolutionDefinition } from '../data/schemas'
import { DATA_CONSTANTS } from '../data/schemas'
import { DataRegistry } from '../data/registry'
import { eventBus } from '../systems/event-bus'
import { gameStore } from '../state/game-store'
import { addConqueredRoom, evolveMonster, checkAndUnlockMonsters } from '../state/actions'
import type { DungeonGrid } from '../systems/dungeon-grid'
import {
  GAME_WIDTH,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  UI_TEXT,
  UI_TEXT_DIM,
  UI_ACCENT,
  UI_GOLD,
  ALLY_COLOR,
} from '../config/constants'
import { drawPanel } from '../utils/visual-factory'

// Layout constants
const ROOM_X = (GAME_WIDTH - ROOM_WIDTH) / 2
const ROOM_Y = 20
const RESULT_Y = ROOM_Y + ROOM_HEIGHT + 20  // Below room area (y=440)
const PANEL_WIDTH = ROOM_WIDTH
const PANEL_PADDING = 12

// Sub-phase flow for battle won
type ResultSubPhase =
  | 'summary'
  | 'evolution'
  | 'room_selection'
  | 'done'

export class ResultPhase implements Phase {
  private readonly scene: Phaser.Scene

  // All created GameObjects for cleanup
  private gameObjects: Phaser.GameObjects.GameObject[] = []

  // State
  private battleResult: 'won' | 'lost' = 'won'
  private subPhase: ResultSubPhase = 'summary'
  private summaryTimer: number = 0
  private summaryAdvanced: boolean = false

  // Evolution state
  private pendingEvolutions: Array<{
    monsterId: string
    routeA: EvolutionDefinition
    routeB: EvolutionDefinition
  }> = []
  private currentEvoIndex: number = 0

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  enter(): void {
    this.resetState()

    this.battleResult = (this.scene.data.get('battleResult') as 'won' | 'lost') ?? 'won'

    if (this.battleResult === 'won') {
      this.startSummary()
    } else {
      this.showRunOver()
    }
  }

  update(_time: number, delta: number): void {
    if (this.battleResult !== 'won') return

    if (this.subPhase === 'summary' && !this.summaryAdvanced) {
      this.summaryTimer += delta
      if (this.summaryTimer >= 2000) {
        this.advanceSummary()
      }
    }
  }

  exit(): void {
    this.cleanup()
  }

  // ============ State Management ============

  private resetState(): void {
    this.gameObjects = []
    this.subPhase = 'summary'
    this.summaryTimer = 0
    this.summaryAdvanced = false
    this.pendingEvolutions = []
    this.currentEvoIndex = 0
  }

  // ============ Summary Panel (Battle Won) ============

  private startSummary(): void {
    this.subPhase = 'summary'

    const goldEarned = (this.scene.data.get('goldEarned') as number) ?? 0
    const monsters = gameStore.getState().run.monsters

    // Panel background
    const panelHeight = 140
    const panelGfx = this.scene.add.graphics()
    drawPanel(panelGfx, ROOM_X, RESULT_Y, PANEL_WIDTH, panelHeight, 0.7, 8)
    this.gameObjects.push(panelGfx)

    // Title（帶入場動畫 + 描邊 — ProjectDK 風格）
    const title = this.scene.add.text(
      ROOM_X + PANEL_PADDING,
      RESULT_Y + PANEL_PADDING,
      '\u6230\u9B25\u7D50\u7B97',
      { fontSize: '18px', color: '#ffcc44', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3 }
    )
    title.setAlpha(0)
    this.scene.tweens.add({
      targets: title,
      alpha: 1,
      y: title.y,
      duration: 250,
      ease: 'Quad.easeOut',
    })
    this.gameObjects.push(title)

    // Gold earned（帶計數動畫 + 更大圖示）
    const goldIcon = this.scene.add.graphics()
    // 金幣外光
    goldIcon.fillStyle(UI_GOLD, 0.2)
    goldIcon.fillCircle(ROOM_X + PANEL_PADDING + 8, RESULT_Y + PANEL_PADDING + 40, 14)
    // 金幣本體
    goldIcon.fillStyle(UI_GOLD, 1)
    goldIcon.fillCircle(ROOM_X + PANEL_PADDING + 8, RESULT_Y + PANEL_PADDING + 40, 8)
    // 金幣高光
    goldIcon.fillStyle(0xffffff, 0.3)
    goldIcon.fillCircle(ROOM_X + PANEL_PADDING + 6, RESULT_Y + PANEL_PADDING + 38, 3)
    goldIcon.setAlpha(0)
    this.scene.tweens.add({
      targets: goldIcon,
      alpha: 1,
      delay: 200,
      duration: 200,
    })
    this.gameObjects.push(goldIcon)

    const goldText = this.scene.add.text(
      ROOM_X + PANEL_PADDING + 18,
      RESULT_Y + PANEL_PADDING + 28,
      '+0',
      { fontSize: '18px', color: '#ffdd44', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2 }
    )
    goldText.setAlpha(0)
    this.gameObjects.push(goldText)

    // 金幣計數動畫（200ms 延遲後開始，400ms 內數完）
    this.scene.tweens.add({
      targets: goldText,
      alpha: 1,
      delay: 200,
      duration: 200,
    })
    if (goldEarned > 0) {
      const counter = { val: 0 }
      this.scene.tweens.add({
        targets: counter,
        val: goldEarned,
        delay: 300,
        duration: 400,
        ease: 'Quad.easeOut',
        onUpdate: () => {
          if (goldText.active) {
            goldText.setText(`+${Math.floor(counter.val)}`)
          }
        },
      })
    }

    // Monsters XP info with animated progress bar
    let yOffset = RESULT_Y + PANEL_PADDING + 52
    for (let mi = 0; mi < monsters.length; mi++) {
      const monster = monsters[mi]
      const monsterDef = DataRegistry.getMonsterById(monster.monsterId)
      const name = monsterDef?.name ?? monster.monsterId
      const entryDelay = 400 + mi * 150

      const xpLine = this.scene.add.text(
        ROOM_X + PANEL_PADDING,
        yOffset,
        `${name}: XP ${monster.currentXP} / ${DATA_CONSTANTS.EVOLUTION_XP_THRESHOLD}`,
        { fontSize: '13px', color: `#${UI_TEXT_DIM.toString(16)}` }
      )
      xpLine.setAlpha(0)
      this.scene.tweens.add({
        targets: xpLine,
        alpha: 1,
        x: xpLine.x,
        delay: entryDelay,
        duration: 200,
        ease: 'Quad.easeOut',
      })
      this.gameObjects.push(xpLine)

      // XP progress bar（帶填充動畫）
      const barX = ROOM_X + PANEL_WIDTH - PANEL_PADDING - 80
      const barY = yOffset + 4
      const barWidth = 80
      const barHeight = 8
      const xpRatio = Math.min(monster.currentXP / DATA_CONSTANTS.EVOLUTION_XP_THRESHOLD, 1)

      const xpBarGfx = this.scene.add.graphics()
      // 背景
      xpBarGfx.fillStyle(0x222230, 1)
      xpBarGfx.fillRoundedRect(barX, barY, barWidth, barHeight, 3)
      xpBarGfx.setAlpha(0)
      this.gameObjects.push(xpBarGfx)

      this.scene.tweens.add({
        targets: xpBarGfx,
        alpha: 1,
        delay: entryDelay,
        duration: 200,
      })

      // 填充條（延遲後從 0 動畫到目標值）
      const fillGfx = this.scene.add.graphics()
      this.gameObjects.push(fillGfx)
      const fillAnim = { ratio: 0 }
      this.scene.tweens.add({
        targets: fillAnim,
        ratio: xpRatio,
        delay: entryDelay + 200,
        duration: 500,
        ease: 'Quad.easeOut',
        onUpdate: () => {
          fillGfx.clear()
          const fillW = barWidth * fillAnim.ratio
          if (fillW > 0) {
            // 底層暗色
            fillGfx.fillStyle(0x336688, 1)
            fillGfx.fillRoundedRect(barX, barY, fillW, barHeight, 3)
            // 上層亮色
            fillGfx.fillStyle(UI_ACCENT, 1)
            fillGfx.fillRoundedRect(barX, barY, fillW, Math.ceil(barHeight * 0.6), 3)
            // 頂部高光線
            fillGfx.fillStyle(0xaaddff, 0.4)
            fillGfx.fillRect(barX + 1, barY + 1, fillW - 2, 1)
          }
        },
      })

      yOffset += 20
    }

    // Tap hint with floating animation
    const hint = this.scene.add.text(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + panelHeight - PANEL_PADDING,
      'Tap to continue',
      { fontSize: '12px', color: `#${UI_TEXT_DIM.toString(16)}` }
    )
    hint.setOrigin(0.5, 1)
    this.gameObjects.push(hint)

    this.scene.tweens.add({
      targets: hint,
      y: hint.y - 3,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // Tap to advance
    const hitArea = this.scene.add.rectangle(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + panelHeight / 2,
      PANEL_WIDTH,
      panelHeight,
      0x000000,
      0
    )
    hitArea.setInteractive({ useHandCursor: true })
    hitArea.on('pointerup', () => {
      this.advanceSummary()
    })
    this.gameObjects.push(hitArea)
  }

  private advanceSummary(): void {
    if (this.summaryAdvanced) return
    this.summaryAdvanced = true

    this.clearGameObjects()
    this.checkEvolution()
  }

  // ============ Evolution Check ============

  private checkEvolution(): void {
    const monsters = gameStore.getState().run.monsters

    // Find monsters that qualify for evolution (XP >= threshold)
    this.pendingEvolutions = []
    for (const monster of monsters) {
      if (monster.currentXP >= DATA_CONSTANTS.EVOLUTION_XP_THRESHOLD && !monster.evolutionPath) {
        const routeA = DataRegistry.getEvolutionByPath(monster.monsterId, 'A')
        const routeB = DataRegistry.getEvolutionByPath(monster.monsterId, 'B')
        if (routeA && routeB) {
          this.pendingEvolutions = [
            ...this.pendingEvolutions,
            { monsterId: monster.monsterId, routeA, routeB },
          ]
        }
      }
    }

    this.currentEvoIndex = 0

    if (this.pendingEvolutions.length > 0) {
      this.subPhase = 'evolution'
      this.showEvolutionChoice()
    } else {
      this.showRoomSelection()
    }
  }

  private showEvolutionChoice(): void {
    if (this.currentEvoIndex >= this.pendingEvolutions.length) {
      this.showRoomSelection()
      return
    }

    const evo = this.pendingEvolutions[this.currentEvoIndex]
    const monsterDef = DataRegistry.getMonsterById(evo.monsterId)
    const monsterName = monsterDef?.name ?? evo.monsterId

    // Panel（ProjectDK 多層面板）
    const panelHeight = 260
    const bgGfx = this.scene.add.graphics()
    drawPanel(bgGfx, ROOM_X, RESULT_Y, PANEL_WIDTH, panelHeight, 0.85, 8)
    this.gameObjects.push(bgGfx)

    // Title（更大、帶描邊 + 金色光暈）
    const evoTitleGlow = this.scene.add.circle(
      ROOM_X + PANEL_WIDTH / 2, RESULT_Y + PANEL_PADDING + 8,
      60, 0xddaa44, 0.08
    )
    this.gameObjects.push(evoTitleGlow)
    this.scene.tweens.add({
      targets: evoTitleGlow,
      alpha: 0.15,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    const title = this.scene.add.text(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + PANEL_PADDING,
      `${monsterName} is ready to evolve!`,
      { fontSize: '17px', color: '#ffdd44', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3 }
    )
    title.setOrigin(0.5, 0)
    this.gameObjects.push(title)

    // Two evolution cards side by side
    const cardWidth = (PANEL_WIDTH - PANEL_PADDING * 3) / 2
    const cardHeight = 180
    const cardY = RESULT_Y + 44

    this.createEvoCard(
      evo.routeA,
      'A \u8DEF\u7DDA',
      ROOM_X + PANEL_PADDING,
      cardY,
      cardWidth,
      cardHeight,
      evo.monsterId
    )
    this.createEvoCard(
      evo.routeB,
      'B \u8DEF\u7DDA',
      ROOM_X + PANEL_PADDING * 2 + cardWidth,
      cardY,
      cardWidth,
      cardHeight,
      evo.monsterId
    )
  }

  private createEvoCard(
    evoDef: EvolutionDefinition,
    routeLabel: string,
    x: number,
    y: number,
    w: number,
    h: number,
    monsterId: string
  ): void {
    // Card background using drawPanel
    const cardGfx = this.scene.add.graphics()
    drawPanel(cardGfx, x, y, w, h, 0.7, 6)
    this.gameObjects.push(cardGfx)

    // Invisible hit area for interaction
    const hitArea = this.scene.add.rectangle(
      x + w / 2, y + h / 2,
      w, h,
      0x000000, 0
    )
    hitArea.setInteractive({ useHandCursor: true })
    this.gameObjects.push(hitArea)

    // Route label
    const label = this.scene.add.text(
      x + w / 2, y + 10,
      routeLabel,
      { fontSize: '12px', color: `#${UI_TEXT_DIM.toString(16)}` }
    )
    label.setOrigin(0.5, 0)
    this.gameObjects.push(label)

    // Evolution name
    const name = this.scene.add.text(
      x + w / 2, y + 28,
      evoDef.path.name,
      { fontSize: '14px', color: `#${UI_TEXT.toString(16)}`, fontStyle: 'bold' }
    )
    name.setOrigin(0.5, 0)
    this.gameObjects.push(name)

    // Stats（彩色數值 + 描邊 — ProjectDK 風格）
    const stats = evoDef.evolvedStats
    const hpText = this.scene.add.text(
      x + 8, y + 52,
      `HP: ${stats.hp}`,
      { fontSize: '12px', color: '#44cc66', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2 }
    )
    this.gameObjects.push(hpText)
    const atkText = this.scene.add.text(
      x + 8, y + 68,
      `ATK: ${stats.attack}`,
      { fontSize: '12px', color: '#ff8866', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2 }
    )
    this.gameObjects.push(atkText)
    const spdText = this.scene.add.text(
      x + 8, y + 84,
      `SPD: ${stats.attackInterval}s`,
      { fontSize: '12px', color: '#88bbff', fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2 }
    )
    this.gameObjects.push(spdText)

    // Ability（更亮的文字）
    const abilityText = this.scene.add.text(
      x + 8, y + 104,
      evoDef.specialAbility.description,
      {
        fontSize: '11px',
        color: '#aaddff',
        wordWrap: { width: w - 16 },
        stroke: '#000000',
        strokeThickness: 1,
      }
    )
    this.gameObjects.push(abilityText)

    // Select button text（更大 + 脈動）
    const selectText = this.scene.add.text(
      x + w / 2, y + h - 16,
      '\u9078\u64C7',
      { fontSize: '14px', color: '#44ff44', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2 }
    )
    selectText.setOrigin(0.5, 1)
    this.gameObjects.push(selectText)
    this.scene.tweens.add({
      targets: selectText,
      alpha: { from: 1, to: 0.6 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // Hover effect: 背景亮化 + 邊框高亮 + 輕微放大
    hitArea.on('pointerover', () => {
      cardGfx.clear()
      drawPanel(cardGfx, x, y, w, h, 0.85, 6)
      cardGfx.lineStyle(2, ALLY_COLOR, 0.8)
      cardGfx.strokeRoundedRect(x, y, w, h, 6)
      this.scene.tweens.add({
        targets: hitArea,
        scaleX: 1.04,
        scaleY: 1.04,
        duration: 120,
        ease: 'Back.easeOut',
      })
    })
    hitArea.on('pointerout', () => {
      cardGfx.clear()
      drawPanel(cardGfx, x, y, w, h, 0.7, 6)
      this.scene.tweens.add({
        targets: hitArea,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
      })
    })

    // Click handler（帶閃光回饋）
    hitArea.on('pointerup', () => {
      const flash = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0xffffff, 0.2)
      flash.setOrigin(0.5)
      this.scene.tweens.add({
        targets: flash,
        alpha: 0,
        duration: 200,
        onComplete: () => flash.destroy(),
      })
      this.onEvolutionChosen(monsterId, evoDef)
    })
  }

  private onEvolutionChosen(monsterId: string, evoDef: EvolutionDefinition): void {
    // Update game store with evolution
    gameStore.dispatchRunState(run => evolveMonster(run, monsterId, evoDef.id))

    eventBus.emit({
      type: 'EVOLUTION_CHOSEN',
      monsterId,
      path: evoDef.id,
    })

    // Move to next pending evolution
    this.currentEvoIndex += 1
    this.clearGameObjects()

    if (this.currentEvoIndex < this.pendingEvolutions.length) {
      this.showEvolutionChoice()
    } else {
      this.showRoomSelection()
    }
  }

  // ============ Room Selection (3-pick-1) ============

  private showRoomSelection(): void {
    this.subPhase = 'room_selection'

    // Generate 3 random room options
    const roomPool: readonly RoomDefinition[] = [
      DataRegistry.getRoomById('treasury'),
      DataRegistry.getRoomById('training_ground'),
      DataRegistry.getRoomById('chicken_coop'),
    ].filter((r): r is RoomDefinition => r !== undefined)

    // Shuffle and pick 3 (with possible duplicates since pool is exactly 3)
    const options = this.shuffleArray([...roomPool]).slice(0, 3)

    // Panel（ProjectDK 多層面板）
    const panelHeight = 240
    const bgGfx = this.scene.add.graphics()
    drawPanel(bgGfx, ROOM_X, RESULT_Y, PANEL_WIDTH, panelHeight, 0.85, 8)
    this.gameObjects.push(bgGfx)

    // Title（更大、帶描邊）
    const title = this.scene.add.text(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + PANEL_PADDING,
      '\u9078\u64C7\u623F\u9593',
      { fontSize: '18px', color: '#ffcc44', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3 }
    )
    title.setOrigin(0.5, 0)
    this.gameObjects.push(title)

    // Room cards
    const cardWidth = (PANEL_WIDTH - PANEL_PADDING * 4) / 3
    const cardHeight = 170
    const cardY = RESULT_Y + 40

    for (let i = 0; i < options.length; i++) {
      const room = options[i]
      const cardX = ROOM_X + PANEL_PADDING + i * (cardWidth + PANEL_PADDING)
      this.createRoomCard(room, cardX, cardY, cardWidth, cardHeight)
    }
  }

  private createRoomCard(
    room: RoomDefinition,
    x: number,
    y: number,
    w: number,
    h: number
  ): void {
    // Card background using drawPanel
    const cardGfx = this.scene.add.graphics()
    drawPanel(cardGfx, x, y, w, h, 0.7, 6)
    this.gameObjects.push(cardGfx)

    // Invisible hit area for interaction
    const cardBg = this.scene.add.rectangle(
      x + w / 2, y + h / 2,
      w, h,
      0x000000, 0
    )
    cardBg.setInteractive({ useHandCursor: true })
    this.gameObjects.push(cardBg)

    // Room type icon at top（更大 + 發光底圈）
    const iconGfx = this.scene.add.graphics()
    const iconCx = x + w / 2
    const iconCy = y + 16
    let iconColor = UI_ACCENT
    if (room.type === 'treasury') {
      iconColor = UI_GOLD
      // 金幣底光
      iconGfx.fillStyle(UI_GOLD, 0.15)
      iconGfx.fillCircle(iconCx, iconCy, 14)
      // Gold circle
      iconGfx.fillStyle(UI_GOLD, 1)
      iconGfx.fillCircle(iconCx, iconCy, 8)
      // 金幣高光
      iconGfx.fillStyle(0xffffff, 0.3)
      iconGfx.fillCircle(iconCx - 2, iconCy - 2, 3)
    } else if (room.type === 'training_ground') {
      iconColor = UI_ACCENT
      iconGfx.fillStyle(UI_ACCENT, 0.15)
      iconGfx.fillCircle(iconCx, iconCy, 14)
      iconGfx.fillStyle(UI_ACCENT, 1)
      iconGfx.beginPath()
      iconGfx.moveTo(iconCx, iconCy - 9)
      iconGfx.lineTo(iconCx + 8, iconCy + 6)
      iconGfx.lineTo(iconCx - 8, iconCy + 6)
      iconGfx.closePath()
      iconGfx.fillPath()
    } else if (room.type === 'chicken_coop') {
      iconColor = 0xeeddcc
      iconGfx.fillStyle(0xeeddcc, 0.15)
      iconGfx.fillCircle(iconCx, iconCy, 14)
      iconGfx.fillStyle(0xeeddcc, 1)
      iconGfx.fillEllipse(iconCx, iconCy, 12, 16)
    }
    this.gameObjects.push(iconGfx)

    // Room name（加描邊，用房間類型色）
    const nameColorHex = `#${iconColor.toString(16).padStart(6, '0')}`
    const name = this.scene.add.text(
      x + w / 2, y + 30,
      room.name,
      { fontSize: '13px', color: nameColorHex, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2 }
    )
    name.setOrigin(0.5, 0)
    this.gameObjects.push(name)

    // Room effect
    const effectText = this.scene.add.text(
      x + 4, y + 48,
      room.effect.description,
      {
        fontSize: '11px',
        color: '#aaddff',
        wordWrap: { width: w - 8 },
      }
    )
    this.gameObjects.push(effectText)

    // Diminishing values info
    const dimValues = room.diminishing.values
    const countOfThisType = this.countOwnedRoomsOfType(room.type)
    const nextValue = dimValues[Math.min(countOfThisType, dimValues.length - 1)]
    const dimText = this.scene.add.text(
      x + 4, y + 80,
      `Next bonus: ${this.formatDimValue(room, nextValue)}`,
      {
        fontSize: '10px',
        color: `#${UI_TEXT_DIM.toString(16)}`,
        wordWrap: { width: w - 8 },
      }
    )
    this.gameObjects.push(dimText)

    // Owned count
    const ownedText = this.scene.add.text(
      x + 4, y + 100,
      `Owned: ${countOfThisType}`,
      { fontSize: '10px', color: `#${UI_TEXT_DIM.toString(16)}` }
    )
    this.gameObjects.push(ownedText)

    // Description
    const desc = this.scene.add.text(
      x + 4, y + 118,
      room.description,
      {
        fontSize: '9px',
        color: `#${UI_TEXT_DIM.toString(16)}`,
        wordWrap: { width: w - 8 },
        lineSpacing: 4,
      }
    )
    this.gameObjects.push(desc)

    // Hover effect
    cardBg.on('pointerover', () => {
      cardGfx.clear()
      drawPanel(cardGfx, x, y, w, h, 0.7, 6)
      cardGfx.lineStyle(2, ALLY_COLOR, 1)
      cardGfx.strokeRoundedRect(x, y, w, h, 6)
    })
    cardBg.on('pointerout', () => {
      cardGfx.clear()
      drawPanel(cardGfx, x, y, w, h, 0.7, 6)
    })

    // Click handler
    cardBg.on('pointerup', () => {
      this.onRoomChosen(room)
    })
  }

  private onRoomChosen(room: RoomDefinition): void {
    // Get conquered position from scene data
    const conqueredPosition = this.scene.data.get('conqueredPosition') as
      | { x: number; y: number }
      | undefined

    // Add room to dungeon grid
    const grid = this.scene.data.get('dungeonGrid') as DungeonGrid | undefined
    if (grid && conqueredPosition) {
      grid.conquerRoom(conqueredPosition, room.type)
    }

    // Update game store
    gameStore.dispatchRunState(run => addConqueredRoom(run, room.id))

    // Update current position to the conquered room
    if (conqueredPosition) {
      this.scene.data.set('currentPosition', conqueredPosition)
    }

    eventBus.emit({ type: 'ROOM_PLACED', roomId: room.id })

    // 檢查房間組合，解鎖新怪物
    const monsterDefs = DataRegistry.getAllMonsters().map(m => ({
      id: m.id,
      hp: m.stats.hp,
      maxXP: DATA_CONSTANTS.EVOLUTION_XP_THRESHOLD,
    }))
    gameStore.dispatchRunState(run => checkAndUnlockMonsters(run, monsterDefs))

    this.subPhase = 'done'
    this.clearGameObjects()

    // Emit result-complete for the scene to transition
    this.scene.events.emit('result-complete')
  }

  // ============ Battle Lost ============

  private showRunOver(): void {
    const state = gameStore.getState()
    const roomsConquered = state.run.conqueredRooms.length
    const totalGold = state.run.gold

    // 畫面震動
    this.scene.cameras.main.shake(300, 0.008)

    // Dark overlay（漸入）
    const overlay = this.scene.add.rectangle(
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2,
      ROOM_WIDTH,
      ROOM_HEIGHT,
      0x000000,
      0
    )
    this.scene.tweens.add({
      targets: overlay,
      fillAlpha: 0.75,
      duration: 500,
      ease: 'Quad.easeIn',
    })
    this.gameObjects.push(overlay)

    // 紅色危險光暈（ProjectDK 遊戲結束氛圍）
    const dangerGlow = this.scene.add.circle(
      ROOM_X + ROOM_WIDTH / 2, ROOM_Y + ROOM_HEIGHT / 2,
      120, 0xff2222, 0.1
    )
    this.scene.tweens.add({
      targets: dangerGlow,
      alpha: 0.2,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.gameObjects.push(dangerGlow)

    // Title（延遲入場 + 縮放衝擊 + 更大字體）
    const title = this.scene.add.text(
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2 - 40,
      '\u63A2\u7D22\u7D50\u675F',
      { fontSize: '32px', color: '#ff4444', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4 }
    )
    title.setOrigin(0.5)
    title.setAlpha(0)
    title.setScale(1.8)
    this.scene.tweens.add({
      targets: title,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      delay: 300,
      duration: 400,
      ease: 'Back.easeOut',
    })
    this.gameObjects.push(title)
    // 標題呼吸
    this.scene.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.8 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      delay: 800,
      ease: 'Sine.easeInOut',
    })

    // Panel（延遲淡入 + 更大）
    const panelHeight = 160
    const panelGfx = this.scene.add.graphics()
    drawPanel(panelGfx, ROOM_X, RESULT_Y, PANEL_WIDTH, panelHeight, 0.85, 8)
    panelGfx.setAlpha(0)
    this.scene.tweens.add({
      targets: panelGfx,
      alpha: 1,
      delay: 600,
      duration: 300,
    })
    this.gameObjects.push(panelGfx)

    // Final stats（延遲入場 + 更大字 + 描邊）
    const statsText = this.scene.add.text(
      ROOM_X + PANEL_PADDING,
      RESULT_Y + PANEL_PADDING,
      `\u5F81\u670D\u623F\u9593: ${roomsConquered}\n\u7372\u5F97\u91D1\u5E63: ${totalGold}`,
      {
        fontSize: '16px',
        color: `#${UI_TEXT.toString(16)}`,
        lineSpacing: 8,
        stroke: '#000000',
        strokeThickness: 2,
      }
    )
    statsText.setAlpha(0)
    this.scene.tweens.add({
      targets: statsText,
      alpha: 1,
      delay: 700,
      duration: 300,
    })
    this.gameObjects.push(statsText)

    // Button（更大 + 脈動邊框 — ProjectDK 風格）
    const btnWidth = 180
    const btnHeight = 48
    const btnX = ROOM_X + PANEL_WIDTH / 2 - btnWidth / 2
    const btnY = RESULT_Y + panelHeight - PANEL_PADDING - btnHeight

    // 按鈕底部光暈
    const btnGlow = this.scene.add.circle(
      btnX + btnWidth / 2, btnY + btnHeight / 2,
      50, UI_ACCENT, 0.08
    )
    this.gameObjects.push(btnGlow)
    this.scene.tweens.add({
      targets: btnGlow,
      alpha: 0.15,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const btnGfx = this.scene.add.graphics()
    drawPanel(btnGfx, btnX, btnY, btnWidth, btnHeight, 0.8, 8)
    this.gameObjects.push(btnGfx)

    // 脈動邊框
    const btnBorderGfx = this.scene.add.graphics()
    this.gameObjects.push(btnBorderGfx)
    const drawRetryBorder = (alpha: number) => {
      btnBorderGfx.clear()
      btnBorderGfx.lineStyle(2, UI_ACCENT, alpha)
      btnBorderGfx.strokeRoundedRect(btnX, btnY, btnWidth, btnHeight, 8)
    }
    drawRetryBorder(0.4)
    this.scene.tweens.addCounter({
      from: 0.3,
      to: 0.8,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => drawRetryBorder(tween.getValue() ?? 0.5),
    })

    // Invisible hit area for button interaction
    const btnHit = this.scene.add.rectangle(
      btnX + btnWidth / 2, btnY + btnHeight / 2,
      btnWidth, btnHeight,
      0x000000, 0
    )
    btnHit.setInteractive({ useHandCursor: true })
    this.gameObjects.push(btnHit)

    const btnText = this.scene.add.text(
      btnX + btnWidth / 2, btnY + btnHeight / 2,
      '\u518D\u8A66\u4E00\u6B21',
      { fontSize: '18px', color: '#ffffff', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3 }
    )
    btnText.setOrigin(0.5)
    this.gameObjects.push(btnText)

    btnHit.on('pointerover', () => {
      btnGfx.clear()
      drawPanel(btnGfx, btnX, btnY, btnWidth, btnHeight, 0.95, 8)
      btnGfx.lineStyle(2, UI_ACCENT, 1)
      btnGfx.strokeRoundedRect(btnX, btnY, btnWidth, btnHeight, 8)
    })
    btnHit.on('pointerout', () => {
      btnGfx.clear()
      drawPanel(btnGfx, btnX, btnY, btnWidth, btnHeight, 0.8, 8)
    })
    btnHit.on('pointerup', () => {
      this.scene.events.emit('run-over')
      eventBus.emit({ type: 'RUN_COMPLETED', success: false })
    })
  }

  // ============ Utility ============

  private countOwnedRoomsOfType(roomType: string): number {
    const grid = this.scene.data.get('dungeonGrid') as DungeonGrid | undefined
    if (!grid) return 0
    return grid.getConqueredRooms().filter(c => c.roomType === roomType).length
  }

  private formatDimValue(room: RoomDefinition, value: number): string {
    switch (room.effect.type) {
      case 'gold_bonus':
        return `+${Math.round(value * 100)}% gold`
      case 'attack_speed':
        return `+${Math.round(value * 100)}% ATK SPD`
      case 'spawn_minions':
        return `${value} minions`
      default:
        return `${value}`
    }
  }

  private shuffleArray<T>(array: T[]): T[] {
    const result = [...array]
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const temp = result[i]
      result[i] = result[j]
      result[j] = temp
    }
    return result
  }

  private clearGameObjects(): void {
    for (const obj of this.gameObjects) {
      if (obj.active) {
        this.scene.tweens.killTweensOf(obj)
        obj.destroy()
      }
    }
    this.gameObjects = []
  }

  private cleanup(): void {
    this.clearGameObjects()
  }
}
