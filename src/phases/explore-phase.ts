import Phaser from 'phaser'
import type { Phase, PhaseExitOptions } from './phase-manager'
import type { Direction } from '../systems/dungeon-grid'
import { DungeonGrid } from '../systems/dungeon-grid'
import { DataRegistry } from '../data/registry'
import type { ConsumableDefinition } from '../data/schemas'
import { gameStore } from '../state/game-store'
import {
  GAME_WIDTH,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  ROOM_ACCENT,
  ROOM_SHADOW,
  DEPLOY_SLOTS,
  UI_TEXT,
  UI_TEXT_DIM,
  UI_ACCENT,
  UI_GOLD,
} from '../config/constants'
import { drawPanel } from '../utils/visual-factory'
import { TEXTURE_KEYS } from '../utils/texture-factory'

// 房間渲染區域
const ROOM_X = (GAME_WIDTH - ROOM_WIDTH) / 2   // 水平居中
const ROOM_Y = 20                                // 頂部留 20px
const WALL_THICKNESS = 8
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
  private roomTileSprites: Phaser.GameObjects.GameObject[] = []
  private doorObjects: Phaser.GameObjects.GameObject[] = []
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

    // 進場淡入動畫 — 所有房間元素從暗到亮
    if (this.roomGraphics) {
      this.roomGraphics.setAlpha(0)
      this.scene.tweens.add({
        targets: this.roomGraphics,
        alpha: 1, duration: 300, ease: 'Quad.easeOut',
      })
    }
    for (let ti = 0; ti < this.roomTileSprites.length; ti++) {
      const ts = this.roomTileSprites[ti] as Phaser.GameObjects.Components.Alpha & Phaser.GameObjects.GameObject
      ts.setAlpha(0)
      this.scene.tweens.add({
        targets: ts,
        alpha: 1, duration: 250, delay: 50 + ti * 30, ease: 'Quad.easeOut',
      })
    }

    console.log('[ExplorePhase] enter() complete')
  }

  update(_time: number, _delta: number): void {
    // 門的脈動動畫由 Tween 處理，不需 update 邏輯
  }

  exit(options?: PhaseExitOptions): void {
    this.cleanup(options?.preserveRoom ?? false)
  }

  private drawRoom(): void {
    const g = this.scene.add.graphics()
    this.roomGraphics = g

    // 地板（TileSprite 石板紋理）
    const floor = this.scene.add.tileSprite(ROOM_X, ROOM_Y, ROOM_WIDTH, ROOM_HEIGHT, TEXTURE_KEYS.FLOOR_TILE)
    floor.setOrigin(0, 0)
    floor.setTileScale(2, 2)
    this.roomTileSprites.push(floor)

    // 牆壁（TileSprite 磚牆紋理）
    const wallTop = this.scene.add.tileSprite(ROOM_X, ROOM_Y, ROOM_WIDTH, WALL_THICKNESS, TEXTURE_KEYS.BRICK_WALL)
    wallTop.setOrigin(0, 0)
    wallTop.setTileScale(2, 2)
    const wallBottom = this.scene.add.tileSprite(ROOM_X, ROOM_Y + ROOM_HEIGHT - WALL_THICKNESS, ROOM_WIDTH, WALL_THICKNESS, TEXTURE_KEYS.BRICK_WALL)
    wallBottom.setOrigin(0, 0)
    wallBottom.setTileScale(2, 2)
    const wallLeft = this.scene.add.tileSprite(ROOM_X, ROOM_Y, WALL_THICKNESS, ROOM_HEIGHT, TEXTURE_KEYS.BRICK_WALL)
    wallLeft.setOrigin(0, 0)
    wallLeft.setTileScale(2, 2)
    const wallRight = this.scene.add.tileSprite(ROOM_X + ROOM_WIDTH - WALL_THICKNESS, ROOM_Y, WALL_THICKNESS, ROOM_HEIGHT, TEXTURE_KEYS.BRICK_WALL)
    wallRight.setOrigin(0, 0)
    wallRight.setTileScale(2, 2)
    this.roomTileSprites.push(wallTop, wallBottom, wallLeft, wallRight)

    // 內側環境光遮蔽（8px 內縮陰影 — 加大加深）
    const aoInset = 8
    g.fillStyle(ROOM_SHADOW, 0.3)
    g.fillRect(ROOM_X + WALL_THICKNESS, ROOM_Y + WALL_THICKNESS, ROOM_WIDTH - WALL_THICKNESS * 2, aoInset)
    g.fillRect(ROOM_X + WALL_THICKNESS, ROOM_Y + ROOM_HEIGHT - WALL_THICKNESS - aoInset, ROOM_WIDTH - WALL_THICKNESS * 2, aoInset)
    g.fillRect(ROOM_X + WALL_THICKNESS, ROOM_Y + WALL_THICKNESS, aoInset, ROOM_HEIGHT - WALL_THICKNESS * 2)
    g.fillRect(ROOM_X + ROOM_WIDTH - WALL_THICKNESS - aoInset, ROOM_Y + WALL_THICKNESS, aoInset, ROOM_HEIGHT - WALL_THICKNESS * 2)
    // 第二層更淺的 AO（漸層效果）
    g.fillStyle(ROOM_SHADOW, 0.15)
    g.fillRect(ROOM_X + WALL_THICKNESS + aoInset, ROOM_Y + WALL_THICKNESS + aoInset, ROOM_WIDTH - WALL_THICKNESS * 2 - aoInset * 2, 4)
    g.fillRect(ROOM_X + WALL_THICKNESS + aoInset, ROOM_Y + ROOM_HEIGHT - WALL_THICKNESS - aoInset - 4, ROOM_WIDTH - WALL_THICKNESS * 2 - aoInset * 2, 4)

    // 中央氛圍光（房間中心的微弱暖色光源 — ProjectDK 風格）
    const roomCX = ROOM_X + ROOM_WIDTH / 2
    const roomCY = ROOM_Y + ROOM_HEIGHT / 2
    const ambientGlow = this.scene.add.circle(roomCX, roomCY, 120, 0x4466aa, 0.06)
    this.scene.tweens.add({
      targets: ambientGlow,
      alpha: 0.1,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 4000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.roomTileSprites.push(ambientGlow)

    // 角落裝飾：16x16 石柱 + 多層光效（更大更亮）
    const cs = 16
    const corners = [
      { x: ROOM_X, y: ROOM_Y },
      { x: ROOM_X + ROOM_WIDTH - cs, y: ROOM_Y },
      { x: ROOM_X, y: ROOM_Y + ROOM_HEIGHT - cs },
      { x: ROOM_X + ROOM_WIDTH - cs, y: ROOM_Y + ROOM_HEIGHT - cs },
    ]
    for (const c of corners) {
      // 石柱底色
      g.fillStyle(0x333344, 1)
      g.fillRect(c.x, c.y, cs, cs)
      // 石柱高光（頂部和左邊 — ProjectDK 等距光照）
      g.fillStyle(0x555566, 1)
      g.fillRect(c.x, c.y, cs, 2)
      g.fillRect(c.x, c.y, 2, cs)
      // 石柱暗面（底部和右邊）
      g.fillStyle(0x1a1a22, 1)
      g.fillRect(c.x, c.y + cs - 2, cs, 2)
      g.fillRect(c.x + cs - 2, c.y, 2, cs)
      // 中心寶石亮點
      g.fillStyle(UI_ACCENT, 0.8)
      g.fillRect(c.x + 6, c.y + 6, 4, 4)
      g.fillStyle(0xaaddff, 0.5)
      g.fillRect(c.x + 7, c.y + 6, 2, 1) // 寶石高光

      // 角落光暈（更大、更亮）
      const cornerGlow = this.scene.add.circle(c.x + cs / 2, c.y + cs / 2, 20, UI_ACCENT, 0.12)
      this.scene.tweens.add({
        targets: cornerGlow,
        alpha: { from: 0.06, to: 0.2 },
        duration: 2500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      this.roomTileSprites.push(cornerGlow)
    }

    // 將房間圖形存入 scene.data 供 BattlePhase 共用
    this.scene.data.set('sharedRoomGraphics', {
      roomGraphics: this.roomGraphics,
      roomTileSprites: [...this.roomTileSprites],
    })
  }

  private drawSlots(): void {
    const g = this.scene.add.graphics()
    this.slotGraphics = g

    for (let i = 0; i < DEPLOY_SLOTS; i++) {
      const slot = SLOT_POSITIONS[i]
      const sx = ROOM_X + slot.x
      const sy = ROOM_Y + slot.y

      // 槽位底部光暈圈（大範圍柔光）
      const slotBackGlow = this.scene.add.circle(sx, sy, SLOT_RADIUS + 6, UI_ACCENT, 0.06)
      this.uiElements.push(slotBackGlow)

      // 虛線圓圈（更粗）
      g.lineStyle(2.5, ROOM_ACCENT, 0.7)
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

      // 內圈填充（半透明暗色）
      g.fillStyle(0x1a1a2e, 0.3)
      g.fillCircle(sx, sy, SLOT_RADIUS - 4)

      // 槽位中心脈動光環（更明顯）
      const slotGlow = this.scene.add.circle(sx, sy, SLOT_RADIUS * 0.7, UI_ACCENT, 0.08)
      this.scene.tweens.add({
        targets: slotGlow,
        alpha: { from: 0.05, to: 0.15 },
        scaleX: { from: 0.9, to: 1.15 },
        scaleY: { from: 0.9, to: 1.15 },
        duration: 2000 + i * 300,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
      this.uiElements.push(slotGlow)

      // 槽位標籤（帶描邊）
      const label = this.scene.add.text(sx, sy + SLOT_RADIUS + 8, slot.label, {
        fontSize: '11px',
        color: '#8888aa',
        stroke: '#000000',
        strokeThickness: 2,
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

    // 門本體（Texture + Graphics 漸層效果）
    const doorImg = this.scene.add.tileSprite(dx, dy, w, h, TEXTURE_KEYS.DOOR)
    doorImg.setOrigin(0, 0)
    doorImg.setTileScale(2, 2)
    this.doorObjects.push(doorImg)

    const doorGfx = this.scene.add.graphics()
    // 內側發光點
    doorGfx.fillStyle(UI_ACCENT, 0.15)
    doorGfx.fillRect(dx + w * 0.25, dy + h * 0.25, w * 0.5, h * 0.5)

    // 點擊區域（透明 Rectangle 疊在上面接收事件）
    const hitArea = this.scene.add.rectangle(dx + w / 2, dy + h / 2, w, h, 0x000000, 0)
    hitArea.setInteractive({ useHandCursor: true })

    // 門口光線擴散效果 — 多層光環（大幅增強可見度）
    const doorCenterX = dx + w / 2
    const doorCenterY = dy + h / 2

    // 難度決定門光顏色
    const neighborPos2 = grid.getNeighborPosition(currentPos, dir)
    const dist2 = Math.abs(neighborPos2.x) + Math.abs(neighborPos2.y)
    const doorGlowColor = dist2 >= 3 ? 0xcc4444 : dist2 === 2 ? 0xddaa44 : UI_ACCENT

    // 外層光暈（大範圍、低透明度）
    const outerLight = this.scene.add.circle(doorCenterX, doorCenterY, 50, doorGlowColor, 0.06)
    this.scene.tweens.add({
      targets: outerLight,
      alpha: 0.12,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
    this.doorObjects.push(outerLight)

    // 中層光暈（中範圍、中透明度）
    const midLight = this.scene.add.circle(doorCenterX, doorCenterY, 30, doorGlowColor, 0.1)
    this.scene.tweens.add({
      targets: midLight,
      alpha: 0.2,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 200,
    })
    this.doorObjects.push(midLight)

    // 內層光暈（小範圍、高透明度）
    const innerLight = this.scene.add.circle(doorCenterX, doorCenterY, 14, 0xffffff, 0.08)
    this.scene.tweens.add({
      targets: innerLight,
      alpha: 0.15,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 400,
    })
    this.doorObjects.push(innerLight)

    // 門邊緣發光層（更亮的脈動邊框，3px 寬）
    const glowGfx = this.scene.add.graphics()
    glowGfx.lineStyle(3, doorGlowColor, 0.15)
    glowGfx.strokeRect(dx - 2, dy - 2, w + 4, h + 4)
    this.scene.tweens.add({
      targets: glowGfx,
      alpha: { from: 0.15, to: 0.5 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // 難度菱形指示器
    const neighborPos = grid.getNeighborPosition(currentPos, dir)
    const distance = Math.abs(neighborPos.x) + Math.abs(neighborPos.y)

    let indicatorX: number, indicatorY: number
    switch (dir) {
      case 'up':
        indicatorX = dx + w / 2
        indicatorY = dy - 12
        break
      case 'down':
        indicatorX = dx + w / 2
        indicatorY = dy + h + 12
        break
      case 'left':
        indicatorX = dx - 12
        indicatorY = dy + h / 2
        break
      case 'right':
        indicatorX = dx + w + 12
        indicatorY = dy + h / 2
        break
    }

    const diamondGfx = this.scene.add.graphics()
    const diamondColor = distance >= 3 ? 0xcc4444 : distance === 2 ? UI_GOLD : 0x888899
    const diamondSize = 5
    diamondGfx.fillStyle(diamondColor, 1)
    diamondGfx.beginPath()
    diamondGfx.moveTo(indicatorX, indicatorY - diamondSize)
    diamondGfx.lineTo(indicatorX + diamondSize, indicatorY)
    diamondGfx.lineTo(indicatorX, indicatorY + diamondSize)
    diamondGfx.lineTo(indicatorX - diamondSize, indicatorY)
    diamondGfx.closePath()
    diamondGfx.fillPath()
    // 高難度菱形脈動動畫
    if (distance >= 2) {
      this.scene.tweens.add({
        targets: diamondGfx,
        scaleX: 1.3,
        scaleY: 1.3,
        alpha: 0.6,
        duration: distance >= 3 ? 600 : 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }
    this.uiElements.push(diamondGfx)

    // 門點擊事件（帶閃光回饋）
    hitArea.on('pointerup', () => {
      const doorFlash = this.scene.add.rectangle(dx + w / 2, dy + h / 2, w * 1.2, h * 1.2, 0xffffff, 0.35)
      this.scene.tweens.add({
        targets: doorFlash,
        alpha: 0,
        scaleX: 1.3,
        scaleY: 1.3,
        duration: 250,
        onComplete: () => doorFlash.destroy(),
      })
      this.onDoorClicked(dir, distance)
    })

    // hover 效果
    hitArea.on('pointerover', () => {
      doorImg.setTint(0xaaaacc)
      doorGfx.clear()
      doorGfx.fillStyle(UI_ACCENT, 0.3)
      doorGfx.fillRect(dx + w * 0.15, dy + h * 0.15, w * 0.7, h * 0.7)
    })
    hitArea.on('pointerout', () => {
      doorImg.clearTint()
      doorGfx.clear()
      doorGfx.fillStyle(UI_ACCENT, 0.15)
      doorGfx.fillRect(dx + w * 0.25, dy + h * 0.25, w * 0.5, h * 0.5)
    })

    this.doorObjects.push(doorGfx, hitArea, glowGfx)
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

    // 欄位標題（短水平線裝飾 + 描邊 — ProjectDK 風格）
    const titleText = '戰前準備'
    const barLabel = this.scene.add.text(
      GAME_WIDTH / 2,
      CONSUMABLE_BAR_Y,
      titleText,
      { fontSize: '14px', color: '#aabbcc', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2 },
    )
    barLabel.setOrigin(0.5, 0)
    this.uiElements.push(barLabel)

    const lineGfx = this.scene.add.graphics()
    const lineY = CONSUMABLE_BAR_Y + 7
    const lineLen = 30
    const textHalfW = barLabel.width / 2 + 6
    lineGfx.lineStyle(1, UI_ACCENT, 0.5)
    lineGfx.beginPath()
    lineGfx.moveTo(GAME_WIDTH / 2 - textHalfW - lineLen, lineY)
    lineGfx.lineTo(GAME_WIDTH / 2 - textHalfW, lineY)
    lineGfx.strokePath()
    lineGfx.beginPath()
    lineGfx.moveTo(GAME_WIDTH / 2 + textHalfW, lineY)
    lineGfx.lineTo(GAME_WIDTH / 2 + textHalfW + lineLen, lineY)
    lineGfx.strokePath()
    this.uiElements.push(lineGfx)

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

    // 卡片背景（半透明面板）
    const bgGfx = this.scene.add.graphics()
    drawPanel(bgGfx, x, y, CONSUMABLE_CARD_WIDTH, CONSUMABLE_CARD_HEIGHT, isDisabled ? 0.5 : 0.7)
    this.uiElements.push(bgGfx)

    // 可購買卡片底部脈動亮線
    if (!isDisabled) {
      const pulseLine = this.scene.add.graphics()
      pulseLine.lineStyle(1, UI_ACCENT, 0.4)
      pulseLine.beginPath()
      pulseLine.moveTo(x + 4, y + CONSUMABLE_CARD_HEIGHT - 2)
      pulseLine.lineTo(x + CONSUMABLE_CARD_WIDTH - 4, y + CONSUMABLE_CARD_HEIGHT - 2)
      pulseLine.strokePath()
      this.scene.tweens.add({
        targets: pulseLine,
        alpha: { from: 0.3, to: 1 },
        duration: 1000,
        yoyo: true,
        repeat: -1,
      })
      this.uiElements.push(pulseLine)
    }

    // 點擊區域（透明矩形覆蓋面板區域）
    const bg = this.scene.add.rectangle(
      x + CONSUMABLE_CARD_WIDTH / 2,
      y + CONSUMABLE_CARD_HEIGHT / 2,
      CONSUMABLE_CARD_WIDTH,
      CONSUMABLE_CARD_HEIGHT,
      0x000000,
      0,
    )
    this.uiElements.push(bg)

    // 名稱（加描邊 — ProjectDK 風格）
    const nameColor = isDisabled
      ? `#${UI_TEXT_DIM.toString(16).padStart(6, '0')}`
      : `#${UI_TEXT.toString(16).padStart(6, '0')}`
    const nameText = this.scene.add.text(
      x + CONSUMABLE_CARD_WIDTH / 2,
      y + 12,
      def.name,
      { fontSize: '12px', color: nameColor, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2 },
    )
    nameText.setOrigin(0.5)
    this.uiElements.push(nameText)

    // 價格（等寬字體 + 描邊）
    const costColor = canAfford ? '#FFD700' : '#FF4444'
    const costText = this.scene.add.text(
      x + CONSUMABLE_CARD_WIDTH / 2,
      y + 28,
      `${def.cost}g`,
      { fontSize: '12px', color: costColor, fontFamily: 'monospace', fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 2 },
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
        bgGfx.clear()
        drawPanel(bgGfx, x, y, CONSUMABLE_CARD_WIDTH, CONSUMABLE_CARD_HEIGHT, 0.9)
      })
      bg.on('pointerout', () => {
        bgGfx.clear()
        drawPanel(bgGfx, x, y, CONSUMABLE_CARD_WIDTH, CONSUMABLE_CARD_HEIGHT, 0.7)
      })
      bg.on('pointerup', () => {
        // 購買閃光回饋
        const purchaseFlash = this.scene.add.rectangle(
          x + CONSUMABLE_CARD_WIDTH / 2,
          y + CONSUMABLE_CARD_HEIGHT / 2,
          CONSUMABLE_CARD_WIDTH,
          CONSUMABLE_CARD_HEIGHT,
          0xffffff,
          0.25,
        )
        this.scene.tweens.add({
          targets: purchaseFlash,
          alpha: 0,
          scaleX: 1.1,
          scaleY: 1.1,
          duration: 200,
          onComplete: () => purchaseFlash.destroy(),
        })
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

  private cleanup(preserveRoom: boolean = false): void {
    if (!preserveRoom) {
      // 完全清除：銷毀房間圖形
      this.roomGraphics?.destroy()
      this.roomGraphics = null

      for (const ts of this.roomTileSprites) {
        this.scene.tweens.killTweensOf(ts)
        ts.destroy()
      }
      this.roomTileSprites = []

      // 清除 sharedRoomGraphics 引用
      this.scene.data.set('sharedRoomGraphics', null)
    } else {
      // 保留房間圖形，只釋放本地引用（所有權移交給 scene.data）
      this.roomGraphics = null
      this.roomTileSprites = []
    }

    // 門、槽位、UI 元素一律清除
    this.slotGraphics?.destroy()
    this.slotGraphics = null

    for (const obj of this.doorObjects) {
      this.scene.tweens.killTweensOf(obj)
      obj.destroy()
    }
    this.doorObjects = []

    for (const el of this.uiElements) {
      this.scene.tweens.killTweensOf(el)
      el.destroy()
    }
    this.uiElements = []
  }
}
