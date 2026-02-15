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
  UI_BG,
  UI_PANEL,
  UI_BORDER,
  UI_TEXT,
  UI_TEXT_DIM,
  ALLY_COLOR,
} from '../config/constants'

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
    const bg = this.scene.add.rectangle(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + panelHeight / 2,
      PANEL_WIDTH,
      panelHeight,
      UI_PANEL
    )
    bg.setStrokeStyle(2, UI_BORDER)
    this.gameObjects.push(bg)

    // Title
    const title = this.scene.add.text(
      ROOM_X + PANEL_PADDING,
      RESULT_Y + PANEL_PADDING,
      '-- Battle Summary --',
      { fontSize: '16px', color: '#44ff44', fontStyle: 'bold' }
    )
    this.gameObjects.push(title)

    // Gold earned
    const goldText = this.scene.add.text(
      ROOM_X + PANEL_PADDING,
      RESULT_Y + PANEL_PADDING + 28,
      `Gold earned: +${goldEarned}`,
      { fontSize: '14px', color: `#${UI_TEXT.toString(16)}` }
    )
    this.gameObjects.push(goldText)

    // Monsters XP info
    let yOffset = RESULT_Y + PANEL_PADDING + 52
    for (const monster of monsters) {
      const monsterDef = DataRegistry.getMonsterById(monster.monsterId)
      const name = monsterDef?.name ?? monster.monsterId
      const xpLine = this.scene.add.text(
        ROOM_X + PANEL_PADDING,
        yOffset,
        `${name}: XP ${monster.currentXP} / ${DATA_CONSTANTS.EVOLUTION_XP_THRESHOLD}`,
        { fontSize: '13px', color: `#${UI_TEXT_DIM.toString(16)}` }
      )
      this.gameObjects.push(xpLine)
      yOffset += 20
    }

    // Tap hint
    const hint = this.scene.add.text(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + panelHeight - PANEL_PADDING,
      'Tap to continue',
      { fontSize: '12px', color: `#${UI_TEXT_DIM.toString(16)}` }
    )
    hint.setOrigin(0.5, 1)
    this.gameObjects.push(hint)

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

    // Panel
    const panelHeight = 260
    const bg = this.scene.add.rectangle(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + panelHeight / 2,
      PANEL_WIDTH,
      panelHeight,
      UI_PANEL
    )
    bg.setStrokeStyle(2, UI_BORDER)
    this.gameObjects.push(bg)

    // Title
    const title = this.scene.add.text(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + PANEL_PADDING,
      `${monsterName} is ready to evolve!`,
      { fontSize: '15px', color: '#ffcc44', fontStyle: 'bold' }
    )
    title.setOrigin(0.5, 0)
    this.gameObjects.push(title)

    // Two evolution cards side by side
    const cardWidth = (PANEL_WIDTH - PANEL_PADDING * 3) / 2
    const cardHeight = 180
    const cardY = RESULT_Y + 44

    this.createEvoCard(
      evo.routeA,
      'Route A',
      ROOM_X + PANEL_PADDING,
      cardY,
      cardWidth,
      cardHeight,
      evo.monsterId
    )
    this.createEvoCard(
      evo.routeB,
      'Route B',
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
    const cardBg = this.scene.add.rectangle(
      x + w / 2, y + h / 2,
      w, h,
      UI_BG
    )
    cardBg.setStrokeStyle(1, UI_BORDER)
    cardBg.setInteractive({ useHandCursor: true })
    this.gameObjects.push(cardBg)

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

    // Stats
    const stats = evoDef.evolvedStats
    const statsText = [
      `HP: ${stats.hp}`,
      `ATK: ${stats.attack}`,
      `SPD: ${stats.attackInterval}s`,
    ].join('\n')

    const statsDisplay = this.scene.add.text(
      x + 8, y + 52,
      statsText,
      {
        fontSize: '12px',
        color: `#${UI_TEXT_DIM.toString(16)}`,
        lineSpacing: 4,
      }
    )
    this.gameObjects.push(statsDisplay)

    // Ability
    const abilityText = this.scene.add.text(
      x + 8, y + 110,
      evoDef.specialAbility.description,
      {
        fontSize: '11px',
        color: '#88ccff',
        wordWrap: { width: w - 16 },
      }
    )
    this.gameObjects.push(abilityText)

    // Select button text
    const selectText = this.scene.add.text(
      x + w / 2, y + h - 16,
      'Select',
      { fontSize: '13px', color: '#44ff44', fontStyle: 'bold' }
    )
    selectText.setOrigin(0.5, 1)
    this.gameObjects.push(selectText)

    // Hover effect
    cardBg.on('pointerover', () => {
      cardBg.setStrokeStyle(2, ALLY_COLOR)
    })
    cardBg.on('pointerout', () => {
      cardBg.setStrokeStyle(1, UI_BORDER)
    })

    // Click handler
    cardBg.on('pointerup', () => {
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

    // Panel
    const panelHeight = 240
    const bg = this.scene.add.rectangle(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + panelHeight / 2,
      PANEL_WIDTH,
      panelHeight,
      UI_PANEL
    )
    bg.setStrokeStyle(2, UI_BORDER)
    this.gameObjects.push(bg)

    // Title
    const title = this.scene.add.text(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + PANEL_PADDING,
      'Choose a Room',
      { fontSize: '16px', color: '#ffcc44', fontStyle: 'bold' }
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
    const cardBg = this.scene.add.rectangle(
      x + w / 2, y + h / 2,
      w, h,
      UI_BG
    )
    cardBg.setStrokeStyle(1, UI_BORDER)
    cardBg.setInteractive({ useHandCursor: true })
    this.gameObjects.push(cardBg)

    // Room name
    const name = this.scene.add.text(
      x + w / 2, y + 10,
      room.name,
      { fontSize: '13px', color: `#${UI_TEXT.toString(16)}`, fontStyle: 'bold' }
    )
    name.setOrigin(0.5, 0)
    this.gameObjects.push(name)

    // Room effect
    const effectText = this.scene.add.text(
      x + 4, y + 34,
      room.effect.description,
      {
        fontSize: '11px',
        color: '#88ccff',
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
        lineSpacing: 2,
      }
    )
    this.gameObjects.push(desc)

    // Hover effect
    cardBg.on('pointerover', () => {
      cardBg.setStrokeStyle(2, ALLY_COLOR)
    })
    cardBg.on('pointerout', () => {
      cardBg.setStrokeStyle(1, UI_BORDER)
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

    // Dark overlay on room area
    const overlay = this.scene.add.rectangle(
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2,
      ROOM_WIDTH,
      ROOM_HEIGHT,
      0x000000,
      0.6
    )
    this.gameObjects.push(overlay)

    // "Run Over" title
    const title = this.scene.add.text(
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2 - 40,
      'Run Over',
      { fontSize: '28px', color: '#ff4444', fontStyle: 'bold' }
    )
    title.setOrigin(0.5)
    this.gameObjects.push(title)

    // Panel below room area
    const panelHeight = 140
    const bg = this.scene.add.rectangle(
      ROOM_X + PANEL_WIDTH / 2,
      RESULT_Y + panelHeight / 2,
      PANEL_WIDTH,
      panelHeight,
      UI_PANEL
    )
    bg.setStrokeStyle(2, UI_BORDER)
    this.gameObjects.push(bg)

    // Final stats
    const statsText = this.scene.add.text(
      ROOM_X + PANEL_PADDING,
      RESULT_Y + PANEL_PADDING,
      `Rooms conquered: ${roomsConquered}\nGold earned: ${totalGold}`,
      {
        fontSize: '14px',
        color: `#${UI_TEXT.toString(16)}`,
        lineSpacing: 6,
      }
    )
    this.gameObjects.push(statsText)

    // "Try Again" button
    const btnWidth = 160
    const btnHeight = 40
    const btnX = ROOM_X + PANEL_WIDTH / 2
    const btnY = RESULT_Y + panelHeight - PANEL_PADDING - btnHeight / 2

    const btnBg = this.scene.add.rectangle(
      btnX, btnY,
      btnWidth, btnHeight,
      ALLY_COLOR
    )
    btnBg.setStrokeStyle(2, UI_BORDER)
    btnBg.setInteractive({ useHandCursor: true })
    this.gameObjects.push(btnBg)

    const btnText = this.scene.add.text(
      btnX, btnY,
      'Try Again',
      { fontSize: '16px', color: `#${UI_TEXT.toString(16)}`, fontStyle: 'bold' }
    )
    btnText.setOrigin(0.5)
    this.gameObjects.push(btnText)

    btnBg.on('pointerover', () => {
      btnBg.setFillStyle(0xaa66cc)
    })
    btnBg.on('pointerout', () => {
      btnBg.setFillStyle(ALLY_COLOR)
    })
    btnBg.on('pointerup', () => {
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
