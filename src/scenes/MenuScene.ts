import Phaser from 'phaser'
import { gameStore } from '../state/game-store'
import { createInitialRunState } from '../state/game-state'
import { DataRegistry } from '../data/registry'

const EVOLUTION_XP_THRESHOLD = 30

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' })
  }

  create(): void {
    const { width, height } = this.cameras.main

    // 遊戲標題
    const title = this.add.text(width / 2, height * 0.3, 'ProjectCircle', {
      fontSize: '48px',
      color: '#ffffff',
      fontStyle: 'bold'
    })
    title.setOrigin(0.5)

    // 開始遊戲按鈕 (符合觸控最小尺寸 48x48px)
    const buttonWidth = 200
    const buttonHeight = 60
    const buttonX = width / 2
    const buttonY = height * 0.6

    // 按鈕背景
    const buttonBg = this.add.rectangle(
      buttonX,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x1a1a2e
    )
    buttonBg.setStrokeStyle(2, 0x4a4a6a)
    buttonBg.setInteractive({ useHandCursor: true })

    // 按鈕文字
    const buttonText = this.add.text(buttonX, buttonY, '開始遊戲', {
      fontSize: '24px',
      color: '#ffffff'
    })
    buttonText.setOrigin(0.5)

    // 按鈕互動效果
    buttonBg.on('pointerover', () => {
      buttonBg.setFillStyle(0x2a2a3e)
    })

    buttonBg.on('pointerout', () => {
      buttonBg.setFillStyle(0x1a1a2e)
    })

    buttonBg.on('pointerdown', () => {
      buttonBg.setFillStyle(0x0a0a1e)
    })

    buttonBg.on('pointerup', () => {
      buttonBg.setFillStyle(0x2a2a3e)

      // Initialize run state with starter monster (goblin only)
      // Skeleton and ogre are unlocked through room combos
      const goblin = DataRegistry.getMonsterById('goblin')
      const monsters = goblin ? [{
        monsterId: goblin.id,
        currentHP: goblin.stats.hp,
        maxHP: goblin.stats.hp,
        currentXP: 0,
        maxXP: EVOLUTION_XP_THRESHOLD,
        slotIndex: -1,
      }] : []

      gameStore.dispatch(state => ({
        ...state,
        run: {
          ...createInitialRunState(),
          monsters,
        },
      }))

      this.scene.start('DungeonScene')
    })
  }
}
