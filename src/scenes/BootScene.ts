import Phaser from 'phaser'
import { generateAllTextures } from '../utils/texture-factory'

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' })
  }

  preload(): void {
    // Prototype 階段：無外部資源需載入，所有圖形用程式生成
    const { width, height } = this.cameras.main
    const loadingText = this.add.text(width / 2, height / 2, '載入中...', {
      fontSize: '24px',
      color: '#ffffff'
    })
    loadingText.setOrigin(0.5)
  }

  create(): void {
    // 初始化全域資料存儲（透過 scene.registry 共享）
    // DataRegistry, GameStore, EventBus 會在此初始化

    // 設定預設值
    this.registry.set('gold', 0)
    this.registry.set('currentRoom', 0)
    this.registry.set('maxRooms', 10)

    // 初始化事件總線
    if (!this.game.events) {
      throw new Error('Game events not initialized')
    }

    // 生成所有像素藝術 texture
    generateAllTextures(this)

    // 轉場到主選單
    this.scene.start('MenuScene')
  }
}
