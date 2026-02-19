import Phaser from 'phaser'
import { gameStore } from '../state/game-store'
import { DATA_CONSTANTS } from '../data/schemas'
import { createTextBadge } from '../utils/visual-factory'
import { TEXTURE_KEYS } from '../utils/texture-factory'
import type { GameState } from '../state/game-state'

const TOP_BAR_HEIGHT = 48

export class UIScene extends Phaser.Scene {
  private goldBadge!: Phaser.GameObjects.Container
  private roomBadge!: Phaser.GameObjects.Container
  private waveText!: Phaser.GameObjects.Text
  private enemiesText!: Phaser.GameObjects.Text
  private unsubscribe: (() => void) | null = null
  private lastGold: number = -1

  constructor() {
    super({ key: 'UIScene' })
  }

  create(): void {
    // UIScene 純顯示，不需接收輸入。
    // 停用後 input 會穿透到下方的 DungeonScene
    this.input.enabled = false

    const { width } = this.cameras.main

    // Top bar — 多層漸層條（ProjectDK 風格）
    const topBarGfx = this.add.graphics()
    // 主背景
    topBarGfx.fillStyle(0x1a1428, 0.92)
    topBarGfx.fillRect(0, 0, width, TOP_BAR_HEIGHT)
    // 上半較亮（模擬光照）
    topBarGfx.fillStyle(0x221a30, 0.4)
    topBarGfx.fillRect(0, 0, width, Math.floor(TOP_BAR_HEIGHT * 0.45))
    // 底部亮線（分隔線）
    topBarGfx.lineStyle(1, 0x6a5acd, 0.7)
    topBarGfx.lineBetween(0, TOP_BAR_HEIGHT, width, TOP_BAR_HEIGHT)
    // 底部發光線
    topBarGfx.lineStyle(1, 0x8a7ae8, 0.25)
    topBarGfx.lineBetween(0, TOP_BAR_HEIGHT - 1, width, TOP_BAR_HEIGHT - 1)

    // HUD - 金幣圖示 + 顯示 (左側) — 更大
    const goldIcon = this.add.sprite(20, TOP_BAR_HEIGHT / 2, TEXTURE_KEYS.ICON_GOLD)
    goldIcon.setScale(2.5)
    this.goldBadge = createTextBadge(this, 62, TOP_BAR_HEIGHT / 2, '$0', {
      fontSize: '18px',
      color: '#ffd700',
      bgAlpha: 0.6,
      paddingX: 10,
      paddingY: 4,
    })

    // HUD - 劍形圖示 + 房間進度 (右側) — 更大
    const waveIcon = this.add.sprite(width - 78, TOP_BAR_HEIGHT / 2, TEXTURE_KEYS.ICON_WAVE)
    waveIcon.setScale(2.5)
    this.roomBadge = createTextBadge(this, width - 44, TOP_BAR_HEIGHT / 2, '0/5', {
      fontSize: '18px',
      color: '#f0e8d8',
      bgAlpha: 0.6,
      paddingX: 10,
      paddingY: 4,
    })

    // Battle HUD - 波次指示 (頂部置中，帶描邊)
    this.waveText = this.add.text(width / 2, TOP_BAR_HEIGHT / 2 - 7, '', {
      fontSize: '18px',
      color: '#ffffff',
      fontFamily: 'monospace',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    })
    this.waveText.setOrigin(0.5, 0.5)
    this.waveText.setVisible(false)

    // Battle HUD - 剩餘敵人 (波次文字下方)
    this.enemiesText = this.add.text(width / 2, TOP_BAR_HEIGHT / 2 + 13, '', {
      fontSize: '14px',
      color: '#a8a0b8',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    })
    this.enemiesText.setOrigin(0.5, 0.5)
    this.enemiesText.setVisible(false)

    // 以初始狀態渲染 UI
    this.updateUI(gameStore.getState())

    // 訂閱 GameStore 變化
    this.unsubscribe = gameStore.subscribe((state: GameState) => {
      this.updateUI(state)
    })

    // TODO: DeployPanel (底部怪物卡片列)
    // TODO: BottomSheet (底部抽屜)
    // TODO: 戰前準備欄
  }

  private updateUI(state: GameState): void {
    const { run } = state

    // 更新金幣
    const goldTextObj = this.goldBadge.getData('textObj') as Phaser.GameObjects.Text
    goldTextObj.setText(`$${run.gold}`)
    this.rebuildBadgeBg(this.goldBadge)

    // 金幣變化時 scale bounce + 色彩閃光
    if (this.lastGold !== -1 && run.gold !== this.lastGold) {
      const gained = run.gold > this.lastGold
      this.tweens.add({
        targets: this.goldBadge,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 75,
        yoyo: true,
        ease: 'Quad.easeOut',
      })
      // 增減色彩閃光
      goldTextObj.setColor(gained ? '#44ff66' : '#ff4444')
      this.time.delayedCall(300, () => {
        if (goldTextObj.active) {
          goldTextObj.setColor('#ffd700')
        }
      })
    }
    this.lastGold = run.gold

    // 更新房間進度
    const roomTextObj = this.roomBadge.getData('textObj') as Phaser.GameObjects.Text
    roomTextObj.setText(
      `${run.conqueredRooms.length}/${DATA_CONSTANTS.VICTORY_ROOM_COUNT}`
    )
    this.rebuildBadgeBg(this.roomBadge)

    // 更新戰鬥 HUD
    const { battleState } = run
    if (battleState.isActive) {
      const newWaveStr = `第 ${battleState.currentWave} 波 / 共 ${battleState.totalWaves} 波`
      if (this.waveText.text !== newWaveStr) {
        this.waveText.setText(newWaveStr)
        // 波次切換 scale 動畫
        if (this.waveText.visible) {
          this.tweens.add({
            targets: this.waveText,
            scaleX: 1.2,
            scaleY: 1.2,
            duration: 100,
            yoyo: true,
            ease: 'Back.easeOut',
          })
        }
      }
      this.waveText.setVisible(true)

      this.enemiesText.setText(`剩餘敵人：${battleState.enemiesRemaining}`)
      // 低敵人數量脈動
      if (battleState.enemiesRemaining <= 2 && battleState.enemiesRemaining > 0) {
        this.enemiesText.setColor('#ffaa33')
      } else {
        this.enemiesText.setColor('#a8a0b8')
      }
      this.enemiesText.setVisible(true)
    } else {
      this.waveText.setVisible(false)
      this.enemiesText.setVisible(false)
    }
  }

  /**
   * 重繪 badge 背景以配合文字寬度變化
   */
  private rebuildBadgeBg(badge: Phaser.GameObjects.Container): void {
    const textObj = badge.getData('textObj') as Phaser.GameObjects.Text
    const bgGfx = badge.getData('bgGraphics') as Phaser.GameObjects.Graphics
    const paddingX = 8
    const paddingY = 3
    const bgWidth = textObj.width + paddingX * 2
    const bgHeight = textObj.height + paddingY * 2

    bgGfx.clear()
    bgGfx.fillStyle(0x1a1428, 0.5)
    bgGfx.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, bgHeight / 2)
  }

  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }
}
