import Phaser from 'phaser'
import { PhaseManager, PhaseType } from '../phases/phase-manager'
import { DungeonGrid } from '../systems/dungeon-grid'
import type { Direction, GridPosition } from '../systems/dungeon-grid'
import { DATA_CONSTANTS } from '../data/schemas'

export class DungeonScene extends Phaser.Scene {
  private phaseManager!: PhaseManager
  private dungeonGrid!: DungeonGrid

  constructor() {
    super({ key: 'DungeonScene' })
  }

  create(): void {
    console.log('[DungeonScene] create() called')
    // 初始化 DungeonGrid
    this.dungeonGrid = new DungeonGrid()
    this.data.set('dungeonGrid', this.dungeonGrid)
    this.data.set('currentPosition', { x: 0, y: 0 })

    // 初始化 PhaseManager
    this.phaseManager = new PhaseManager(this)

    // 啟動並行 UI 場景
    this.scene.launch('UIScene')

    // 監聽事件
    this.events.on('door-clicked', this.onDoorClicked, this)
    this.events.on('battle-won', this.onBattleWon, this)
    this.events.on('battle-lost', this.onBattleLost, this)
    this.events.on('result-complete', this.onResultComplete, this)
    this.events.on('run-over', this.onRunOver, this)

    // 進入探索階段
    this.phaseManager.changePhase(PhaseType.EXPLORE)
  }

  update(time: number, delta: number): void {
    this.phaseManager.update(time, delta)
  }

  /**
   * 門點擊 -> 儲存突破資料，進入戰鬥階段
   */
  private onDoorClicked(data: { direction: string; distance: number }): void {
    console.log('[DungeonScene] onDoorClicked received:', data)
    const currentPosition = this.data.get('currentPosition') as GridPosition
    const direction = data.direction as Direction
    const conqueredPosition = this.dungeonGrid.getNeighborPosition(currentPosition, direction)

    this.data.set('breachDirection', direction)
    this.data.set('roomDistance', data.distance)
    this.data.set('conqueredPosition', conqueredPosition)

    this.phaseManager.changePhase(PhaseType.BATTLE)
  }

  /**
   * 戰鬥勝利 -> 進入結算階段
   */
  private onBattleWon(): void {
    this.data.set('battleResult', 'won')
    this.phaseManager.changePhase(PhaseType.RESULT)
  }

  /**
   * 戰鬥失敗 -> 進入結算階段
   */
  private onBattleLost(): void {
    this.data.set('battleResult', 'lost')
    this.phaseManager.changePhase(PhaseType.RESULT)
  }

  /**
   * 結算完成 -> 檢查勝利、回到探索
   * 注意：房間征服和 GameStore 更新已在 ResultPhase.onRoomChosen 中完成
   */
  private onResultComplete(): void {
    // 檢查勝利條件
    const conqueredCount = this.dungeonGrid.getConqueredCount()
    if (conqueredCount >= DATA_CONSTANTS.VICTORY_ROOM_COUNT) {
      this.scene.stop('UIScene')
      this.scene.start('MenuScene')
      return
    }

    // 繼續探索
    this.phaseManager.changePhase(PhaseType.EXPLORE)
  }

  /**
   * 局結束（逃跑/放棄）-> 回到主選單
   */
  private onRunOver(): void {
    this.scene.stop('UIScene')
    this.scene.start('MenuScene')
  }

  shutdown(): void {
    this.events.off('door-clicked', this.onDoorClicked, this)
    this.events.off('battle-won', this.onBattleWon, this)
    this.events.off('battle-lost', this.onBattleLost, this)
    this.events.off('result-complete', this.onResultComplete, this)
    this.events.off('run-over', this.onRunOver, this)
  }
}
