import Phaser from 'phaser'
import { gameStore } from '../state/game-store'
import { DATA_CONSTANTS } from '../data/schemas'
import type { GameState } from '../state/game-state'

export class UIScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text
  private roomText!: Phaser.GameObjects.Text
  private waveText!: Phaser.GameObjects.Text
  private enemiesText!: Phaser.GameObjects.Text
  private unsubscribe: (() => void) | null = null

  constructor() {
    super({ key: 'UIScene' })
  }

  create(): void {
    // UIScene 純顯示，不需接收輸入。
    // 停用後 input 會穿透到下方的 DungeonScene
    this.input.enabled = false

    const { width } = this.cameras.main

    // HUD - 金幣顯示 (左上)
    this.goldText = this.add.text(16, 16, '$0', {
      fontSize: '20px',
      color: '#FFD700',
    })

    // HUD - 房間進度 (右上)
    this.roomText = this.add.text(width - 16, 16, '0/5', {
      fontSize: '20px',
      color: '#ffffff',
    })
    this.roomText.setOrigin(1, 0)

    // Battle HUD - 波次指示 (頂部置中)
    this.waveText = this.add.text(width / 2, 16, '', {
      fontSize: '20px',
      color: '#ffffff',
    })
    this.waveText.setOrigin(0.5, 0)
    this.waveText.setVisible(false)

    // Battle HUD - 剩餘敵人 (波次文字下方)
    this.enemiesText = this.add.text(width / 2, 42, '', {
      fontSize: '16px',
      color: '#cccccc',
    })
    this.enemiesText.setOrigin(0.5, 0)
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
    this.goldText.setText(`$${run.gold}`)

    // 更新房間進度
    this.roomText.setText(
      `${run.conqueredRooms.length}/${DATA_CONSTANTS.VICTORY_ROOM_COUNT}`
    )

    // 更新戰鬥 HUD
    const { battleState } = run
    if (battleState.isActive) {
      this.waveText.setText(
        `Wave ${battleState.currentWave}/${battleState.totalWaves}`
      )
      this.waveText.setVisible(true)

      this.enemiesText.setText(`Enemies: ${battleState.enemiesRemaining}`)
      this.enemiesText.setVisible(true)
    } else {
      this.waveText.setVisible(false)
      this.enemiesText.setVisible(false)
    }
  }

  shutdown(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = null
    }
  }
}
