import Phaser from 'phaser'
import { PhaseManager, PhaseType } from '../phases/phase-manager'
import { DungeonGrid } from '../systems/dungeon-grid'
import type { Direction, GridPosition } from '../systems/dungeon-grid'
import { DATA_CONSTANTS } from '../data/schemas'
import { TEXTURE_KEYS } from '../utils/texture-factory'
import { createTextBadge } from '../utils/visual-factory'

export class DungeonScene extends Phaser.Scene {
  private phaseManager!: PhaseManager
  private dungeonGrid!: DungeonGrid

  constructor() {
    super({ key: 'DungeonScene' })
  }

  create(): void {
    console.log('[DungeonScene] create() called')

    // 場景背景漸層（深紫藍，非純黑 — 參考 ProjectDK）
    const { width, height } = this.cameras.main
    const bgGfx = this.add.graphics()
    const bgSteps = 16
    for (let i = 0; i < bgSteps; i++) {
      const t = i / bgSteps
      const r = Math.round(10 + (1 - t) * 6)
      const g = Math.round(8 + (1 - t) * 4)
      const b = Math.round(16 + (1 - t) * 10)
      const color = (r << 16) | (g << 8) | b
      const stripH = Math.ceil(height / bgSteps)
      bgGfx.fillStyle(color, 1)
      bgGfx.fillRect(0, i * stripH, width, stripH + 1)
    }

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
   * 門點擊 -> 儲存突破資料，使用自訂過渡進入戰鬥階段
   * 原地開戰：跳過 camera fade，保留房間圖形
   */
  private onDoorClicked(data: { direction: string; distance: number }): void {
    console.log('[DungeonScene] onDoorClicked received:', data)
    const currentPosition = this.data.get('currentPosition') as GridPosition
    const direction = data.direction as Direction
    const conqueredPosition = this.dungeonGrid.getNeighborPosition(currentPosition, direction)

    this.data.set('breachDirection', direction)
    this.data.set('roomDistance', data.distance)
    this.data.set('conqueredPosition', conqueredPosition)

    // 原地開戰：跳過 camera fade，保留房間圖形
    this.phaseManager.changePhase(PhaseType.BATTLE, {
      skipCameraFade: true,
      exitOptions: { preserveRoom: true },
    })
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
   * 結算完成 -> 檢查勝利條件，播放走廊過場，回到探索
   * 注意：房間征服和 GameStore 更新已在 ResultPhase.onRoomChosen 中完成
   */
  private onResultComplete(): void {
    // 檢查勝利條件
    const conqueredCount = this.dungeonGrid.getConqueredCount()
    if (conqueredCount >= DATA_CONSTANTS.VICTORY_ROOM_COUNT) {
      this.destroySharedRoomGraphics()
      this.scene.stop('UIScene')
      this.scene.start('MenuScene')
      return
    }

    // 播放走廊過場後進入新房間
    this.playCorridorTransition(() => {
      this.phaseManager.changePhase(PhaseType.EXPLORE)
    })
  }

  /**
   * 走廊過場動畫：銷毀舊房間 → 走廊淡入 → 地面捲動 → 走廊淡出
   * ~2.1s 總時長，含跳過按鈕
   */
  private playCorridorTransition(onComplete: () => void): void {
    // 1. 銷毀舊房間圖形
    this.destroySharedRoomGraphics()

    // 2. 建立走廊場景（container 統一管理）
    const corridor = this.add.container(0, 0)

    // 頂部石牆
    const topWall = this.add.tileSprite(195, 40, 390, 80, TEXTURE_KEYS.BRICK_WALL).setScale(3)
    // 中間地面
    const floor = this.add.tileSprite(195, 422, 390, 500, TEXTURE_KEYS.FLOOR_TILE).setScale(3)
    // 底部石牆
    const bottomWall = this.add.tileSprite(195, 804, 390, 80, TEXTURE_KEYS.BRICK_WALL).setScale(3)

    // 火把 x4（上方兩隻 + 下方兩隻）
    const torchPositions = [
      { x: 60, y: 160 },
      { x: 330, y: 160 },
      { x: 60, y: 680 },
      { x: 330, y: 680 },
    ]
    const torches: Phaser.GameObjects.Arc[] = []
    const torchGlows: Phaser.GameObjects.Arc[] = []
    for (const pos of torchPositions) {
      const glow = this.add.circle(pos.x, pos.y, 20, 0xff6622, 0.15)
      const torch = this.add.circle(pos.x, pos.y, 8, 0xff8844)
      torchGlows.push(glow)
      torches.push(torch)
    }

    // 隧道暈影（四角暗化）
    const vignetteGfx = this.add.graphics()
    vignetteGfx.fillStyle(0x000000, 0.4)
    vignetteGfx.fillRect(0, 0, 390, 120)
    vignetteGfx.fillRect(0, 724, 390, 120)

    // 跳過按鈕
    const skipBtn = createTextBadge(this, 330, 800, '跳過 >', {
      fontSize: '12px',
      color: '#cccccc',
      bgAlpha: 0.4,
    })

    corridor.add([topWall, floor, bottomWall, vignetteGfx, ...torchGlows, ...torches, skipBtn])
    corridor.setAlpha(0)

    let skipped = false

    const finishTransition = () => {
      if (skipped) return
      skipped = true
      // 殺掉所有走廊相關 tween
      this.tweens.killTweensOf(corridor)
      this.tweens.killTweensOf(floor)
      for (const t of torches) this.tweens.killTweensOf(t)
      for (const g of torchGlows) this.tweens.killTweensOf(g)
      // 若 alpha 極低（淡入初期就 skip），直接銷毀不做淡出
      if (corridor.alpha < 0.1) {
        corridor.destroy(true)
        onComplete()
        return
      }
      // 淡出並銷毀
      this.tweens.add({
        targets: corridor,
        alpha: 0,
        duration: 200,
        onComplete: () => {
          corridor.destroy(true)
          onComplete()
        },
      })
    }

    // 跳過按鈕互動
    skipBtn.setInteractive(
      new Phaser.Geom.Rectangle(-30, -15, 60, 30),
      Phaser.Geom.Rectangle.Contains,
    )
    skipBtn.once('pointerup', finishTransition)

    // 3. 火把閃爍動畫（整段期間持續）
    for (const torch of torches) {
      this.tweens.add({
        targets: torch,
        alpha: { from: 0.6, to: 1.0 },
        duration: 100 + Math.random() * 100,
        yoyo: true,
        repeat: 14,
      })
    }
    for (const glow of torchGlows) {
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.1, to: 0.2 },
        duration: 120 + Math.random() * 80,
        yoyo: true,
        repeat: 12,
      })
    }

    // 4. 動畫序列：淡入 → 地面捲動 → 淡出
    this.tweens.add({
      targets: corridor,
      alpha: 1,
      duration: 200,
      onComplete: () => {
        if (skipped) return
        // 地面捲動模擬前進
        this.tweens.add({
          targets: floor,
          tilePositionY: floor.tilePositionY + 200,
          duration: 1000,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            if (skipped) return
            // 走廊淡出
            this.tweens.add({
              targets: corridor,
              alpha: 0,
              duration: 200,
              onComplete: () => {
                if (skipped) return
                corridor.destroy(true)
                onComplete()
              },
            })
          },
        })
      },
    })
  }

  /**
   * 銷毀共享房間圖形，防止記憶體洩漏
   */
  private destroySharedRoomGraphics(): void {
    const shared = this.data.get('sharedRoomGraphics') as { roomGraphics?: Phaser.GameObjects.Graphics; roomTileSprites?: Phaser.GameObjects.GameObject[] } | null
    if (shared) {
      shared.roomGraphics?.destroy()
      if (shared.roomTileSprites) {
        for (const ts of shared.roomTileSprites) {
          this.tweens.killTweensOf(ts)
          ts.destroy()
        }
      }
      this.data.set('sharedRoomGraphics', null)
    }
  }

  /**
   * 局結束（逃跑/放棄）-> 銷毀共享房間圖形，回到主選單
   */
  private onRunOver(): void {
    this.destroySharedRoomGraphics()
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
