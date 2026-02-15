import Phaser from 'phaser'

export class OverviewScene extends Phaser.Scene {
  constructor() {
    super({ key: 'OverviewScene' })
  }

  create(): void {
    const { width, height } = this.cameras.main

    // 標題
    const title = this.add.text(width / 2, 40, 'Overview Map', {
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold'
    })
    title.setOrigin(0.5)

    // 顯示已征服房間的全覽 (Prototype 最小可行版本)
    const currentRoom = this.registry.get('currentRoom') as number
    const infoText = this.add.text(width / 2, height / 2, `Conquered Rooms: ${currentRoom}`, {
      fontSize: '20px',
      color: '#aaaaaa'
    })
    infoText.setOrigin(0.5)

    // 返回按鈕
    const buttonWidth = 150
    const buttonHeight = 50
    const buttonX = width / 2
    const buttonY = height - 100

    const backButton = this.add.rectangle(
      buttonX,
      buttonY,
      buttonWidth,
      buttonHeight,
      0x1a1a2e
    )
    backButton.setStrokeStyle(2, 0x4a4a6a)
    backButton.setInteractive({ useHandCursor: true })

    const backText = this.add.text(buttonX, buttonY, 'Back', {
      fontSize: '20px',
      color: '#ffffff'
    })
    backText.setOrigin(0.5)

    // 按鈕互動
    backButton.on('pointerover', () => {
      backButton.setFillStyle(0x2a2a3e)
    })

    backButton.on('pointerout', () => {
      backButton.setFillStyle(0x1a1a2e)
    })

    backButton.on('pointerup', () => {
      this.scene.stop()
      this.scene.resume('DungeonScene')
    })
  }
}
