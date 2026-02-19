import Phaser from 'phaser'
import { UI_BG, UI_TEXT_HEX, UI_TEXT_DIM_HEX } from '../config/constants'
import { drawPanel } from '../utils/visual-factory'

export class OverviewScene extends Phaser.Scene {
  constructor() {
    super({ key: 'OverviewScene' })
  }

  create(): void {
    const { width, height } = this.cameras.main

    // 背景
    this.cameras.main.setBackgroundColor(UI_BG)

    // 標題
    const title = this.add.text(width / 2, 40, '地圖總覽', {
      fontSize: '28px',
      color: UI_TEXT_HEX,
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    })
    title.setOrigin(0.5)

    // 顯示已征服房間的全覽
    const currentRoom = this.registry.get('currentRoom') as number
    const infoText = this.add.text(width / 2, height / 2, `已征服房間：${currentRoom}`, {
      fontSize: '20px',
      color: UI_TEXT_DIM_HEX,
      stroke: '#000000',
      strokeThickness: 2,
    })
    infoText.setOrigin(0.5)

    // 返回按鈕
    const buttonWidth = 150
    const buttonHeight = 50
    const buttonX = width / 2 - buttonWidth / 2
    const buttonY = height - 125

    const btnGfx = this.add.graphics()
    drawPanel(btnGfx, buttonX, buttonY, buttonWidth, buttonHeight)

    const backText = this.add.text(buttonX + buttonWidth / 2, buttonY + buttonHeight / 2, '返回', {
      fontSize: '20px',
      color: UI_TEXT_HEX,
      stroke: '#000000',
      strokeThickness: 2,
    })
    backText.setOrigin(0.5)

    // 按鈕互動區域（覆蓋面板範圍）
    const hitArea = this.add.rectangle(
      buttonX + buttonWidth / 2, buttonY + buttonHeight / 2,
      buttonWidth, buttonHeight,
      0x000000, 0
    )
    hitArea.setInteractive({ useHandCursor: true })

    hitArea.on('pointerover', () => {
      backText.setColor('#ffffff')
      btnGfx.clear()
      drawPanel(btnGfx, buttonX, buttonY, buttonWidth, buttonHeight, 0.9)
      this.tweens.add({
        targets: [btnGfx, backText],
        scaleX: 1.03,
        scaleY: 1.03,
        duration: 80,
        ease: 'Quad.easeOut',
      })
    })

    hitArea.on('pointerout', () => {
      backText.setColor(UI_TEXT_HEX)
      btnGfx.clear()
      drawPanel(btnGfx, buttonX, buttonY, buttonWidth, buttonHeight)
      this.tweens.add({
        targets: [btnGfx, backText],
        scaleX: 1.0,
        scaleY: 1.0,
        duration: 80,
        ease: 'Quad.easeOut',
      })
    })

    hitArea.on('pointerdown', () => {
      this.tweens.add({
        targets: [btnGfx, backText],
        scaleX: 0.97,
        scaleY: 0.97,
        duration: 50,
        ease: 'Quad.easeIn',
      })
    })

    hitArea.on('pointerup', () => {
      this.scene.stop()
      this.scene.resume('DungeonScene')
    })
  }
}
