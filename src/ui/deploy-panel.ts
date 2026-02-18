/**
 * DeployPanel - 底部部署面板
 * 顯示怪物卡片列，管理個體 CD
 */

import Phaser from 'phaser'
import {
  UI_BG,
  UI_PANEL,
  UI_BORDER,
  UI_TEXT,
  UI_TEXT_DIM,
  GAME_WIDTH,
  MAX_ALLIES,
} from '../config/constants'

export interface DeployCard {
  readonly monsterId: string
  readonly name: string
  readonly cooldown: number
  isReady: boolean
  remainingCD: number
  lastDeployTime: number
}

// 卡片視覺常數
const CARD_WIDTH = 100
const CARD_HEIGHT = 80
const CARD_GAP = 8
const CARD_BORDER_NORMAL = UI_BORDER
const CARD_BORDER_READY = 0x666688
const CARD_BG = UI_PANEL
const CARD_BG_DISABLED = 0x1a1a2e

type DeployCallback = (monsterId: string) => void

export class DeployPanel {
  private readonly scene: Phaser.Scene
  private cards: DeployCard[] = []
  private cardObjects: Phaser.GameObjects.Container[] = []
  private readonly panelY: number
  private onDeploy: DeployCallback | null = null
  private allDisabled = false
  private panelBg: Phaser.GameObjects.Graphics | null = null
  private limitText: Phaser.GameObjects.Text | null = null

  constructor(scene: Phaser.Scene, panelY: number) {
    this.scene = scene
    this.panelY = panelY
  }

  /**
   * 設定可用怪物（已解鎖的）
   */
  setAvailableMonsters(
    monsters: ReadonlyArray<{ readonly id: string; readonly name: string; readonly cooldown: number }>
  ): void {
    this.cleanupCards()

    this.cards = monsters.map((m) => ({
      monsterId: m.id,
      name: m.name,
      cooldown: m.cooldown,
      isReady: true,
      remainingCD: 0,
      lastDeployTime: 0,
    }))

    this.renderPanel()
  }

  /**
   * 設定部署回調
   */
  setDeployCallback(callback: DeployCallback): void {
    this.onDeploy = callback
  }

  /**
   * 更新 CD（每幀呼叫）
   */
  update(currentTime: number): void {
    let changed = false

    for (const card of this.cards) {
      if (!card.isReady && card.lastDeployTime > 0) {
        const elapsed = currentTime - card.lastDeployTime
        const remaining = card.cooldown - elapsed

        if (remaining <= 0) {
          card.remainingCD = 0
          card.isReady = true
          changed = true
        } else {
          const newRemaining = Math.ceil(remaining)
          if (newRemaining !== card.remainingCD) {
            card.remainingCD = newRemaining
            changed = true
          }
        }
      }
    }

    if (changed) {
      this.refreshCardVisuals()
    }
  }

  /**
   * 觸發部署後重置 CD
   */
  triggerDeploy(monsterId: string, currentTime: number): void {
    const card = this.cards.find((c) => c.monsterId === monsterId)
    if (!card) return

    card.isReady = false
    card.lastDeployTime = currentTime
    card.remainingCD = card.cooldown

    this.refreshCardVisuals()
  }

  /**
   * 設定全部禁用（場上已達上限）
   */
  setAllDisabled(disabled: boolean): void {
    if (this.allDisabled === disabled) return

    this.allDisabled = disabled
    this.refreshCardVisuals()

    // 上限文字
    if (disabled) {
      if (!this.limitText) {
        this.limitText = this.scene.add.text(
          GAME_WIDTH / 2,
          this.panelY - 16,
          `上限 ${MAX_ALLIES}/${MAX_ALLIES}`,
          { fontSize: '12px', color: '#cc4444' }
        )
        this.limitText.setOrigin(0.5)
      }
      this.limitText.setVisible(true)
    } else {
      this.limitText?.setVisible(false)
    }
  }

  /**
   * 清理所有資源
   */
  cleanup(): void {
    this.cleanupCards()
    this.panelBg?.destroy()
    this.panelBg = null
    this.limitText?.destroy()
    this.limitText = null
    this.onDeploy = null
  }

  /**
   * 渲染整個面板
   */
  private renderPanel(): void {
    // 面板背景
    if (!this.panelBg) {
      this.panelBg = this.scene.add.graphics()
    }
    this.panelBg.clear()
    this.panelBg.fillStyle(UI_BG, 0.9)
    this.panelBg.fillRect(0, this.panelY - 10, GAME_WIDTH, CARD_HEIGHT + 20)
    this.panelBg.lineStyle(1, UI_BORDER, 0.5)
    this.panelBg.strokeRect(0, this.panelY - 10, GAME_WIDTH, CARD_HEIGHT + 20)

    // 渲染卡片
    const total = this.cards.length
    for (let i = 0; i < total; i++) {
      const container = this.renderCard(this.cards[i], i, total)
      this.cardObjects.push(container)
    }
  }

  /**
   * 渲染一張怪物卡片
   */
  private renderCard(
    card: DeployCard,
    index: number,
    total: number
  ): Phaser.GameObjects.Container {
    // 計算卡片位置（水平均分排列）
    const totalWidth = total * CARD_WIDTH + (total - 1) * CARD_GAP
    const startX = (GAME_WIDTH - totalWidth) / 2
    const cardX = startX + index * (CARD_WIDTH + CARD_GAP) + CARD_WIDTH / 2
    const cardY = this.panelY + CARD_HEIGHT / 2

    const container = this.scene.add.container(cardX, cardY)

    // 背景
    const bg = this.scene.add.graphics()
    const isActive = card.isReady && !this.allDisabled
    const bgColor = isActive ? CARD_BG : CARD_BG_DISABLED
    const borderColor = isActive ? CARD_BORDER_READY : CARD_BORDER_NORMAL

    bg.fillStyle(bgColor, 1)
    bg.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6)
    bg.lineStyle(2, borderColor, 1)
    bg.strokeRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6)

    container.add(bg)

    // 怪物名稱
    const nameText = this.scene.add.text(0, -18, card.name, {
      fontSize: '13px',
      color: `#${UI_TEXT.toString(16).padStart(6, '0')}`,
    })
    nameText.setOrigin(0.5)
    container.add(nameText)

    // 狀態文字
    let statusStr: string
    let statusColor: string
    if (this.allDisabled) {
      statusStr = '已滿'
      statusColor = `#${UI_TEXT_DIM.toString(16).padStart(6, '0')}`
    } else if (card.isReady) {
      statusStr = 'READY'
      statusColor = '#44cc44'
    } else {
      const cdSec = (card.remainingCD / 1000).toFixed(1)
      statusStr = `${cdSec}s`
      statusColor = `#${UI_TEXT_DIM.toString(16).padStart(6, '0')}`
    }

    const statusText = this.scene.add.text(0, 10, statusStr, {
      fontSize: '14px',
      color: statusColor,
      fontStyle: card.isReady && !this.allDisabled ? 'bold' : 'normal',
    })
    statusText.setOrigin(0.5)
    container.add(statusText)

    // CD 進度條（卡片底部）
    const cdBar = this.scene.add.graphics()
    container.add(cdBar)

    // 互動區域
    const hitArea = this.scene.add.rectangle(0, 0, CARD_WIDTH, CARD_HEIGHT)
    hitArea.setInteractive({ useHandCursor: isActive })

    hitArea.on('pointerup', () => {
      if (card.isReady && !this.allDisabled && this.onDeploy) {
        this.onDeploy(card.monsterId)
        // 點擊閃光回饋
        const clickFlash = this.scene.add.graphics()
        clickFlash.fillStyle(0xffffff, 0.3)
        clickFlash.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6)
        container.add(clickFlash)
        this.scene.tweens.add({
          targets: clickFlash,
          alpha: 0,
          duration: 200,
          onComplete: () => clickFlash.destroy(),
        })
      }
    })

    // hover 效果（帶縮放動畫）
    hitArea.on('pointerover', () => {
      if (card.isReady && !this.allDisabled) {
        bg.clear()
        bg.fillStyle(0x333355, 1)
        bg.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6)
        bg.lineStyle(2, 0x8888aa, 1)
        bg.strokeRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6)
        this.scene.tweens.add({
          targets: container,
          scaleX: 1.06,
          scaleY: 1.06,
          duration: 120,
          ease: 'Back.easeOut',
        })
      }
    })

    hitArea.on('pointerout', () => {
      const activeNow = card.isReady && !this.allDisabled
      const bgC = activeNow ? CARD_BG : CARD_BG_DISABLED
      const brC = activeNow ? CARD_BORDER_READY : CARD_BORDER_NORMAL
      bg.clear()
      bg.fillStyle(bgC, 1)
      bg.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6)
      bg.lineStyle(2, brC, 1)
      bg.strokeRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6)
      this.scene.tweens.add({
        targets: container,
        scaleX: 1,
        scaleY: 1,
        duration: 100,
      })
    })

    container.add(hitArea)

    // 儲存參考供後續更新
    container.setData('bg', bg)
    container.setData('nameText', nameText)
    container.setData('statusText', statusText)
    container.setData('hitArea', hitArea)
    container.setData('cdBar', cdBar)
    container.setData('cardIndex', index)

    return container
  }

  /**
   * 更新所有卡片的視覺狀態（不重建）
   */
  private refreshCardVisuals(): void {
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]
      const container = this.cardObjects[i]
      if (!container) continue

      const bg = container.getData('bg') as Phaser.GameObjects.Graphics
      const statusText = container.getData('statusText') as Phaser.GameObjects.Text
      const hitArea = container.getData('hitArea') as Phaser.GameObjects.Rectangle
      const cdBar = container.getData('cdBar') as Phaser.GameObjects.Graphics

      const isActive = card.isReady && !this.allDisabled
      const bgColor = isActive ? CARD_BG : CARD_BG_DISABLED
      const borderColor = isActive ? CARD_BORDER_READY : CARD_BORDER_NORMAL

      // 更新背景
      bg.clear()
      bg.fillStyle(bgColor, 1)
      bg.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6)
      bg.lineStyle(2, borderColor, 1)
      bg.strokeRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6)

      // READY 狀態：亮色上邊緣高光
      if (isActive) {
        bg.fillStyle(0x44cc44, 0.15)
        bg.fillRect(-CARD_WIDTH / 2 + 3, -CARD_HEIGHT / 2 + 1, CARD_WIDTH - 6, 2)
      }

      // 更新狀態文字
      if (this.allDisabled) {
        statusText.setText('已滿')
        statusText.setColor(`#${UI_TEXT_DIM.toString(16).padStart(6, '0')}`)
        statusText.setFontStyle('normal')
      } else if (card.isReady) {
        statusText.setText('READY')
        statusText.setColor('#44cc44')
        statusText.setFontStyle('bold')
      } else {
        const cdSec = (card.remainingCD / 1000).toFixed(1)
        statusText.setText(`${cdSec}s`)
        statusText.setColor(`#${UI_TEXT_DIM.toString(16).padStart(6, '0')}`)
        statusText.setFontStyle('normal')
      }

      // CD 進度條（卡片底部，冷卻中才顯示）
      cdBar.clear()
      if (!card.isReady && card.cooldown > 0) {
        const ratio = card.remainingCD / card.cooldown
        const barW = CARD_WIDTH - 12
        const barH = 3
        const barX = -barW / 2
        const barY = CARD_HEIGHT / 2 - 8
        // 背景
        cdBar.fillStyle(0x111118, 0.8)
        cdBar.fillRect(barX, barY, barW, barH)
        // 填充（冷卻殘留比例，藍色漸變到綠色）
        const fillW = barW * (1 - ratio)
        const fillColor = ratio > 0.5 ? 0x4466aa : 0x44aa66
        cdBar.fillStyle(fillColor, 0.9)
        cdBar.fillRect(barX, barY, fillW, barH)
      }

      // 更新互動性
      if (isActive) {
        hitArea.setInteractive({ useHandCursor: true })
      } else {
        hitArea.disableInteractive()
      }
    }
  }

  /**
   * 清理卡片物件
   */
  private cleanupCards(): void {
    for (const container of this.cardObjects) {
      const hitArea = container.getData('hitArea') as Phaser.GameObjects.Rectangle | undefined
      hitArea?.removeAllListeners()
      container.destroy(true)
    }
    this.cardObjects = []
    this.cards = []
  }
}
