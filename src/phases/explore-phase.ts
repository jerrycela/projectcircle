import Phaser from 'phaser'
import type { Phase } from './phase-manager'
import type { Direction } from '../systems/dungeon-grid'
import { DungeonGrid } from '../systems/dungeon-grid'
import { DataRegistry } from '../data/registry'
import type { ConsumableDefinition } from '../data/schemas'
import { gameStore } from '../state/game-store'
import {
  GAME_WIDTH,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  ROOM_FLOOR,
  ROOM_WALL,
  ROOM_ACCENT,
  DEPLOY_SLOTS,
  UI_BG,
  UI_PANEL,
  UI_BORDER,
  UI_TEXT,
  UI_TEXT_DIM,
} from '../config/constants'

// 房間渲染區域
const ROOM_X = (GAME_WIDTH - ROOM_WIDTH) / 2   // 水平居中
const ROOM_Y = 20                                // 頂部留 20px
const WALL_THICKNESS = 6
const DOOR_WIDTH = 60
const DOOR_HEIGHT = 12

// 部署槽位位置（相對於房間左上角）
const SLOT_POSITIONS = [
  { x: ROOM_WIDTH / 2, y: ROOM_HEIGHT * 0.6, label: '前排' },         // 前排中央
  { x: ROOM_WIDTH * 0.25, y: ROOM_HEIGHT * 0.8, label: '左後' },      // 左後
  { x: ROOM_WIDTH * 0.75, y: ROOM_HEIGHT * 0.8, label: '右後' },      // 右後
]

const SLOT_RADIUS = 18

// 消耗品欄位配置
const CONSUMABLE_BAR_Y = ROOM_Y + ROOM_HEIGHT + 20   // 房間下方 20px
const CONSUMABLE_CARD_WIDTH = 80
const CONSUMABLE_CARD_HEIGHT = 60
const CONSUMABLE_CARD_GAP = 6
const CONSUMABLE_BAR_LABEL_HEIGHT = 18

interface PurchasedConsumable {
  readonly id: string
  readonly type: string
}

export class ExplorePhase implements Phase {
  private readonly scene: Phaser.Scene
  private roomGraphics: Phaser.GameObjects.Graphics | null = null
  private doorObjects: Phaser.GameObjects.Rectangle[] = []
  private slotGraphics: Phaser.GameObjects.Graphics | null = null
  private uiElements: Phaser.GameObjects.GameObject[] = []

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  enter(): void {
    console.log('[ExplorePhase] enter() called')
    this.drawRoom()
    this.drawSlots()
    this.drawDoors()
    this.drawConsumableBar()
    console.log('[ExplorePhase] enter() complete')
  }

  update(_time: number, _delta: number): void {
    // 門的脈動動畫由 Tween 處理，不需 update 邏輯
  }

  exit(): void {
    this.cleanup()
  }

  private drawRoom(): void {
    const g = this.scene.add.graphics()
    this.roomGraphics = g

    // 地板
    g.fillStyle(ROOM_FLOOR, 1)
    g.fillRect(ROOM_X, ROOM_Y, ROOM_WIDTH, ROOM_HEIGHT)

    // 牆壁（四邊）
    g.fillStyle(ROOM_WALL, 1)
    // 上牆
    g.fillRect(ROOM_X, ROOM_Y, ROOM_WIDTH, WALL_THICKNESS)
    // 下牆
    g.fillRect(ROOM_X, ROOM_Y + ROOM_HEIGHT - WALL_THICKNESS, ROOM_WIDTH, WALL_THICKNESS)
    // 左牆
    g.fillRect(ROOM_X, ROOM_Y, WALL_THICKNESS, ROOM_HEIGHT)
    // 右牆
    g.fillRect(ROOM_X + ROOM_WIDTH - WALL_THICKNESS, ROOM_Y, WALL_THICKNESS, ROOM_HEIGHT)

    // 角落裝飾
    const cs = 10
    g.fillStyle(ROOM_ACCENT, 1)
    g.fillRect(ROOM_X, ROOM_Y, cs, cs)
    g.fillRect(ROOM_X + ROOM_WIDTH - cs, ROOM_Y, cs, cs)
    g.fillRect(ROOM_X, ROOM_Y + ROOM_HEIGHT - cs, cs, cs)
    g.fillRect(ROOM_X + ROOM_WIDTH - cs, ROOM_Y + ROOM_HEIGHT - cs, cs, cs)
  }

  private drawSlots(): void {
    const g = this.scene.add.graphics()
    this.slotGraphics = g

    for (let i = 0; i < DEPLOY_SLOTS; i++) {
      const slot = SLOT_POSITIONS[i]
      const sx = ROOM_X + slot.x
      const sy = ROOM_Y + slot.y

      // 虛線圓圈
      g.lineStyle(2, ROOM_ACCENT, 0.6)
      const segments = 12
      for (let s = 0; s < segments; s++) {
        if (s % 2 === 0) {
          const startAngle = (s / segments) * Math.PI * 2
          const endAngle = ((s + 1) / segments) * Math.PI * 2
          g.beginPath()
          g.arc(sx, sy, SLOT_RADIUS, startAngle, endAngle)
          g.strokePath()
        }
      }

      // 槽位標籤
      const label = this.scene.add.text(sx, sy + SLOT_RADIUS + 8, slot.label, {
        fontSize: '11px',
        color: '#666688',
      })
      label.setOrigin(0.5, 0)
      this.uiElements.push(label)
    }
  }

  private drawDoors(): void {
    const grid = this.getDungeonGrid()
    const currentPos = this.getCurrentPosition()
    console.log('[ExplorePhase] drawDoors: currentPos=', currentPos, 'grid=', grid)
    const availableDirs = grid.getAvailableDirections(currentPos)
    console.log('[ExplorePhase] availableDirs:', availableDirs)

    for (const dir of availableDirs) {
      this.createDoor(dir, grid, currentPos)
    }
  }

  private createDoor(dir: Direction, grid: DungeonGrid, currentPos: { x: number; y: number }): void {
    let dx: number, dy: number, w: number, h: number

    switch (dir) {
      case 'up':
        dx = ROOM_X + ROOM_WIDTH / 2 - DOOR_WIDTH / 2
        dy = ROOM_Y
        w = DOOR_WIDTH
        h = DOOR_HEIGHT
        break
      case 'down':
        dx = ROOM_X + ROOM_WIDTH / 2 - DOOR_WIDTH / 2
        dy = ROOM_Y + ROOM_HEIGHT - DOOR_HEIGHT
        w = DOOR_WIDTH
        h = DOOR_HEIGHT
        break
      case 'left':
        dx = ROOM_X
        dy = ROOM_Y + ROOM_HEIGHT / 2 - DOOR_WIDTH / 2
        w = DOOR_HEIGHT
        h = DOOR_WIDTH
        break
      case 'right':
        dx = ROOM_X + ROOM_WIDTH - DOOR_HEIGHT
        dy = ROOM_Y + ROOM_HEIGHT / 2 - DOOR_WIDTH / 2
        w = DOOR_HEIGHT
        h = DOOR_WIDTH
        break
    }

    // 門矩形（可點擊）
    const door = this.scene.add.rectangle(
      dx + w / 2, dy + h / 2, w, h, ROOM_ACCENT, 0.8
    )
    door.setStrokeStyle(2, 0x666688)
    door.setInteractive({ useHandCursor: true })

    // 脈動動畫提示可點擊
    this.scene.tweens.add({
      targets: door,
      alpha: { from: 0.6, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    })

    // 難度星數
    const neighborPos = grid.getNeighborPosition(currentPos, dir)
    const distance = Math.abs(neighborPos.x) + Math.abs(neighborPos.y)
    const starText = '★'.repeat(Math.min(distance, 4))
    const starColor = distance >= 3 ? '#FFD700' : '#ffffff'  // 距離 3+ 金色（精英預告）

    let starX: number, starY: number
    switch (dir) {
      case 'up':
        starX = dx + w / 2
        starY = dy - 16
        break
      case 'down':
        starX = dx + w / 2
        starY = dy + h + 6
        break
      case 'left':
        starX = dx - 6
        starY = dy + h / 2
        break
      case 'right':
        starX = dx + w + 6
        starY = dy + h / 2
        break
    }

    const stars = this.scene.add.text(starX, starY, starText, {
      fontSize: '14px',
      color: starColor,
    })
    stars.setOrigin(0.5)
    this.uiElements.push(stars)

    // 門點擊事件
    door.on('pointerup', () => {
      this.onDoorClicked(dir, distance)
    })

    // hover 效果
    door.on('pointerover', () => {
      door.setFillStyle(0x888899, 1)
    })
    door.on('pointerout', () => {
      door.setFillStyle(ROOM_ACCENT, 0.8)
    })

    this.doorObjects.push(door)
  }

  private drawConsumableBar(): void {
    // 初始化已購買消耗品列表（不可變陣列）
    if (!this.scene.data.has('purchasedConsumables')) {
      this.scene.data.set('purchasedConsumables', [] as readonly PurchasedConsumable[])
    }

    const consumables = DataRegistry.getAllConsumables()
    const totalWidth = consumables.length * CONSUMABLE_CARD_WIDTH
      + (consumables.length - 1) * CONSUMABLE_CARD_GAP
    const startX = (GAME_WIDTH - totalWidth) / 2

    // 欄位標題
    const barLabel = this.scene.add.text(
      GAME_WIDTH / 2,
      CONSUMABLE_BAR_Y,
      '-- 戰前準備 --',
      { fontSize: '12px', color: `#${UI_TEXT.toString(16).padStart(6, '0')}` },
    )
    barLabel.setOrigin(0.5, 0)
    this.uiElements.push(barLabel)

    for (let i = 0; i < consumables.length; i++) {
      const def = consumables[i]
      const cardX = startX + i * (CONSUMABLE_CARD_WIDTH + CONSUMABLE_CARD_GAP)
      const cardY = CONSUMABLE_BAR_Y + CONSUMABLE_BAR_LABEL_HEIGHT
      this.createConsumableCard(def, cardX, cardY)
    }
  }

  private createConsumableCard(
    def: ConsumableDefinition,
    x: number,
    y: number,
  ): void {
    const gold = gameStore.getState().run.gold
    const purchased = this.getPurchasedConsumables()
    const purchasedCount = this.getPurchasedCountByType(def.type, purchased)
    const maxReached = def.maxPerBattle !== undefined && purchasedCount >= def.maxPerBattle
    const canAfford = gold >= def.cost
    const isDisabled = !canAfford || maxReached

    // 卡片背景
    const bg = this.scene.add.rectangle(
      x + CONSUMABLE_CARD_WIDTH / 2,
      y + CONSUMABLE_CARD_HEIGHT / 2,
      CONSUMABLE_CARD_WIDTH,
      CONSUMABLE_CARD_HEIGHT,
      isDisabled ? UI_BG : UI_PANEL,
      isDisabled ? 0.5 : 1,
    )
    bg.setStrokeStyle(1, UI_BORDER)
    this.uiElements.push(bg)

    // 名稱
    const nameColor = isDisabled
      ? `#${UI_TEXT_DIM.toString(16).padStart(6, '0')}`
      : `#${UI_TEXT.toString(16).padStart(6, '0')}`
    const nameText = this.scene.add.text(
      x + CONSUMABLE_CARD_WIDTH / 2,
      y + 12,
      def.name,
      { fontSize: '11px', color: nameColor },
    )
    nameText.setOrigin(0.5)
    this.uiElements.push(nameText)

    // 價格
    const costColor = canAfford ? '#FFD700' : '#FF4444'
    const costText = this.scene.add.text(
      x + CONSUMABLE_CARD_WIDTH / 2,
      y + 28,
      `${def.cost}g`,
      { fontSize: '11px', color: costColor },
    )
    costText.setOrigin(0.5)
    this.uiElements.push(costText)

    // 限購數量提示（僅有上限的品項）
    if (def.maxPerBattle !== undefined) {
      const limitText = this.scene.add.text(
        x + CONSUMABLE_CARD_WIDTH / 2,
        y + 44,
        `${purchasedCount}/${def.maxPerBattle}`,
        {
          fontSize: '10px',
          color: maxReached
            ? '#FF4444'
            : `#${UI_TEXT_DIM.toString(16).padStart(6, '0')}`,
        },
      )
      limitText.setOrigin(0.5)
      this.uiElements.push(limitText)
    }

    // 互動（僅在可購買時）
    if (!isDisabled) {
      bg.setInteractive({ useHandCursor: true })
      bg.on('pointerover', () => {
        bg.setFillStyle(UI_BORDER, 1)
      })
      bg.on('pointerout', () => {
        bg.setFillStyle(UI_PANEL, 1)
      })
      bg.on('pointerup', () => {
        this.purchaseConsumable(def)
      })
    }
  }

  private purchaseConsumable(def: ConsumableDefinition): void {
    const currentGold = gameStore.getState().run.gold
    if (currentGold < def.cost) {
      return
    }

    // 再次檢查限購上限
    const purchased = this.getPurchasedConsumables()
    const count = this.getPurchasedCountByType(def.type, purchased)
    if (def.maxPerBattle !== undefined && count >= def.maxPerBattle) {
      return
    }

    // 扣除金幣（不可變更新）
    gameStore.dispatchRunState(run => ({
      ...run,
      gold: run.gold - def.cost,
    }))

    // 記錄已購買消耗品（不可變陣列展開）
    const newPurchase: PurchasedConsumable = { id: def.id, type: def.type }
    const updatedPurchases = [...purchased, newPurchase]
    this.scene.data.set('purchasedConsumables', updatedPurchases)

    // 重繪整個消耗品欄（移除舊的後重建）
    this.refreshConsumableBar()
  }

  private refreshConsumableBar(): void {
    // 移除消耗品欄的 UI 元素並重繪
    // 保留房間、槽位、門相關的元素，只刷新消耗品區域
    // 簡單做法：清除全部 uiElements 後重繪所有非 graphics/door 元素
    // 但為避免影響其他 UI，這裡選擇全部清除再重繪
    this.cleanup()
    this.drawRoom()
    this.drawSlots()
    this.drawDoors()
    this.drawConsumableBar()
  }

  private getPurchasedConsumables(): readonly PurchasedConsumable[] {
    return (this.scene.data.get('purchasedConsumables') as readonly PurchasedConsumable[]) ?? []
  }

  private getPurchasedCountByType(
    type: string,
    purchased: readonly PurchasedConsumable[],
  ): number {
    return purchased.filter(p => p.type === type).length
  }

  private onDoorClicked(direction: Direction, distance: number): void {
    console.log('[ExplorePhase] door clicked:', direction, 'distance:', distance)
    // 發射事件，DungeonScene 接收後切換到 BattlePhase
    this.scene.events.emit('door-clicked', { direction, distance })
  }

  private getDungeonGrid(): DungeonGrid {
    // DungeonScene 會將 grid 存在 scene.data 中
    return this.scene.data.get('dungeonGrid') as DungeonGrid
  }

  private getCurrentPosition(): { x: number; y: number } {
    return this.scene.data.get('currentPosition') as { x: number; y: number } ?? { x: 0, y: 0 }
  }

  private cleanup(): void {
    this.roomGraphics?.destroy()
    this.roomGraphics = null

    this.slotGraphics?.destroy()
    this.slotGraphics = null

    for (const door of this.doorObjects) {
      this.scene.tweens.killTweensOf(door)
      door.destroy()
    }
    this.doorObjects = []

    for (const el of this.uiElements) {
      el.destroy()
    }
    this.uiElements = []
  }
}
