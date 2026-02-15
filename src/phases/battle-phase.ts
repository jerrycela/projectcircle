/**
 * BattlePhase - 戰鬥階段核心邏輯
 *
 * 流程：
 * 1. enter() 接收破牆方向和難度
 * 2. 播放破牆動畫 (0.5s)
 * 3. 初始化 SpawnSystem + DeployPanel + TrapSystem
 * 4. 啟動波次（依 distance 查 DataRegistry.getWaveConfig）
 * 5. 每波敵人從破口逐個進入（間隔 1.0s），場上限 5 個
 * 6. 玩家點部署面板 → 選槽位 → 部署怪物
 * 7. 每幀 update：AI + 移動 + 攻擊 + 陷阱 + 勝敗
 * 8. 勝利：所有波次清完 → emit 'battle-won'
 * 9. 失敗：我方全滅 + 3 秒無補部署 → emit 'battle-lost'
 */

import Phaser from 'phaser'
import type { Phase } from './phase-manager'
import type { HeroDefinition, MonsterDefinition, BattleWaveConfig, WaveDefinition, EvolutionDefinition } from '../data/schemas'
import { DATA_CONSTANTS } from '../data/schemas'
import type { UpdateAIResult, UnitAI } from '../systems/ai-system'
import { createUnitAI, updateAI, AIState } from '../systems/ai-system'
import { calculateDamage, calculateTrapDamage, calculateBerserkerATK } from '../systems/combat-system'
import { TrapSystem } from '../systems/trap-system'
import { DataRegistry } from '../data/registry'
import { eventBus } from '../systems/event-bus'
import { gameStore } from '../state/game-store'
import { gainMonsterXP } from '../state/actions'
import {
  GAME_WIDTH,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  MAX_ALLIES,
  MAX_ENEMIES,
  WAVE_INTERVAL,
  ENEMY_SPAWN_INTERVAL,
  ALLY_COLOR,
  ALLY_OUTLINE,
  ENEMY_COLOR,
  ENEMY_OUTLINE,
  UI_BG,
  UI_PANEL,
  UI_BORDER,
  UI_TEXT,
  ROOM_FLOOR,
  ROOM_WALL,
} from '../config/constants'

// ============ 房間座標常數 ============

const ROOM_X = (GAME_WIDTH - ROOM_WIDTH) / 2
const ROOM_Y = 20

// 部署槽位位置（world coordinates）
const DEPLOY_SLOT_POSITIONS = [
  { x: ROOM_X + ROOM_WIDTH / 2, y: ROOM_Y + ROOM_HEIGHT * 0.6 },      // 前排中央
  { x: ROOM_X + ROOM_WIDTH * 0.25, y: ROOM_Y + ROOM_HEIGHT * 0.8 },   // 左後
  { x: ROOM_X + ROOM_WIDTH * 0.75, y: ROOM_Y + ROOM_HEIGHT * 0.8 },   // 右後
]

const SLOT_SELECT_RADIUS = 24

// ============ 破口位置計算 ============

function getBreachPosition(direction: string): { x: number; y: number } {
  switch (direction) {
    case 'up':
      return { x: ROOM_X + ROOM_WIDTH / 2, y: ROOM_Y }
    case 'down':
      return { x: ROOM_X + ROOM_WIDTH / 2, y: ROOM_Y + ROOM_HEIGHT }
    case 'left':
      return { x: ROOM_X, y: ROOM_Y + ROOM_HEIGHT / 2 }
    case 'right':
      return { x: ROOM_X + ROOM_WIDTH, y: ROOM_Y + ROOM_HEIGHT / 2 }
    default:
      return { x: ROOM_X + ROOM_WIDTH / 2, y: ROOM_Y }
  }
}

// ============ 戰場單位資料結構 ============

interface BattleUnit {
  sprite: Phaser.GameObjects.Arc
  hpBar: Phaser.GameObjects.Graphics
  ai: UnitAI
  faction: 'ally' | 'enemy'
  id: string
  definitionId: string
  hp: number
  maxHP: number
  atk: number
  baseATK: number            // base ATK before any scaling (for berserker)
  attackInterval: number
  moveSpeed: number
  attackRange: number
  aiType: string
  alive: boolean
  triggeredTrap: boolean
  slotIndex: number          // -1 for enemies
  goldReward: number         // enemies only
  xpReward: number           // enemies only
  isChicken: boolean         // chicken minions from chicken coop room bonus
  evolution: EvolutionDefinition | null  // evolution data if evolved
}

// ============ 部署面板 UI 資料結構 ============

interface DeployCard {
  monsterId: string
  name: string
  cooldownMs: number
  lastDeployTime: number
  container: Phaser.GameObjects.Container
  bg: Phaser.GameObjects.Rectangle
  cdOverlay: Phaser.GameObjects.Rectangle
  nameText: Phaser.GameObjects.Text
}

// ============ 房間加成資料結構 ============

interface RoomBonuses {
  readonly goldMultiplier: number       // treasury: 1 + sum of diminishing values
  readonly attackSpeedMultiplier: number // training ground: 1 - sum (capped at 0.6 min)
  readonly chickenCount: number         // chicken coop: sum of diminishing values (max 5)
  readonly passiveGold: number          // treasury: 20 * count
}

const DEFAULT_ROOM_BONUSES: RoomBonuses = {
  goldMultiplier: 1,
  attackSpeedMultiplier: 1,
  chickenCount: 0,
  passiveGold: 0,
}

// ============ BattlePhase ============

export class BattlePhase implements Phase {
  private readonly scene: Phaser.Scene

  // 戰鬥狀態
  private breachDirection: string = 'up'
  private roomDistance: number = 1
  private currentWaveIndex: number = 0
  private waveConfig: BattleWaveConfig | null = null
  private activeWaves: readonly WaveDefinition[] = []

  // 波次控制
  private heroSpawnQueue: Array<{ heroId: string }> = []
  private heroSpawnTimer: number = 0
  private waveTransitionTimer: number = 0
  private isWaveTransitioning: boolean = false
  private waveTransitionText: Phaser.GameObjects.Text | null = null
  private allWavesSpawned: boolean = false

  // 戰場單位
  private units: BattleUnit[] = []
  private nextUnitId: number = 0

  // 陷阱系統
  private trapSystem: TrapSystem | null = null

  // 部署面板
  private deployCards: DeployCard[] = []
  private deployPanelContainer: Phaser.GameObjects.Container | null = null

  // 部署選擇 UI（選槽位）
  private deploySlotMode: boolean = false
  private pendingDeployMonsterId: string | null = null
  private slotIndicators: Phaser.GameObjects.Arc[] = []
  private slotSelectText: Phaser.GameObjects.Text | null = null

  // 全滅緩衝計時
  private allDeadTimer: number = 0
  private readonly ALL_DEAD_BUFFER = 3000  // 3 秒

  // 金幣追蹤
  private goldEarned: number = 0

  // 房間加成
  private roomBonuses: RoomBonuses = DEFAULT_ROOM_BONUSES

  // 戰鬥結束
  private battleEnded: boolean = false

  // 消耗品系統
  private allyLimitBonus: number = 0
  private unusedHeals: number = 0
  private unusedCrystals: number = 0
  private crystalsAppliedCount: number = 0   // 已套用 crystal buff 的怪物數量
  private healButton: Phaser.GameObjects.Container | null = null

  // Physics groups
  private allyGroup: Phaser.Physics.Arcade.Group | null = null
  private enemyGroup: Phaser.Physics.Arcade.Group | null = null
  private collider: Phaser.Physics.Arcade.Collider | null = null

  // 場景元素
  private roomGraphics: Phaser.GameObjects.Graphics | null = null
  private breachGraphics: Phaser.GameObjects.Graphics | null = null

  // 觸控 / 滑鼠事件
  private pointerHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null

  // Bug fix: 防止 enterSlotSelectMode 的 pointerup 冒泡到全域 handler 立即取消
  private skipNextSlotCancel: boolean = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  // ============ Phase Lifecycle ============

  enter(): void {
    console.log('[BattlePhase] enter() called')
    this.resetState()

    // 初始化金幣追蹤
    this.scene.data.set('goldEarned', 0)

    // 從 scene.data 讀取破牆方向和難度
    this.breachDirection = (this.scene.data.get('breachDirection') as string) ?? 'up'
    this.roomDistance = (this.scene.data.get('roomDistance') as number) ?? 1

    // 查詢波次配置
    this.waveConfig = DataRegistry.getWaveConfig(this.roomDistance) ?? null
    if (!this.waveConfig) {
      // Fallback: 使用 distance=1 配置
      this.waveConfig = DataRegistry.getWaveConfig(1) ?? null
    }

    // 隨機選擇是否使用變體（50% 機率）
    if (this.waveConfig?.variant && Math.random() < 0.5) {
      this.activeWaves = this.waveConfig.variant
    } else if (this.waveConfig) {
      this.activeWaves = this.waveConfig.waves
    }

    // 初始化系統
    this.trapSystem = new TrapSystem()
    this.setupPhysicsGroups()
    this.drawBattleRoom()
    this.createDeployPanel()
    this.setupInputHandlers()

    // 讀取並套用消耗品
    this.applyPurchasedConsumables()

    // 計算房間加成
    this.roomBonuses = this.calculateRoomBonuses()

    // 播放破牆動畫 (0.5s) 然後開始第一波
    this.playBreachAnimation(() => {
      // 生成小雞（房間加成）
      this.spawnChickens()
      this.startNextWave()
    })

    // 更新 GameStore 戰鬥狀態
    gameStore.dispatchRunState(run => ({
      ...run,
      phase: 'battle',
      battleState: {
        ...run.battleState,
        isActive: true,
        currentWave: 0,
        totalWaves: this.activeWaves.length,
        enemiesRemaining: this.countTotalEnemies(),
      },
    }))
  }

  update(time: number, delta: number): void {
    if (this.battleEnded) return

    // 1. 處理波次轉場
    this.updateWaveTransition(delta)

    // 2. 生成排隊的英雄
    this.updateHeroSpawning(time, delta)

    // 3. 更新所有單位 AI + 戰鬥
    this.updateUnits(time, delta)

    // 4. 處理碰撞互斥力
    this.applyAllyEnemySeparation()

    // 5. 檢查陷阱
    this.updateTraps()

    // 6. 更新部署面板 CD
    this.updateDeployPanel(time)

    // 7. 更新消耗品 UI（治療按鈕顯示/隱藏）
    this.updateConsumableUI()

    // 8. 檢查勝敗
    this.checkWinLoseConditions(delta)
  }

  exit(): void {
    this.cleanupAll()
  }

  // ============ 初始化 ============

  private resetState(): void {
    this.breachDirection = 'up'
    this.roomDistance = 1
    this.currentWaveIndex = 0
    this.waveConfig = null
    this.activeWaves = []
    this.heroSpawnQueue = []
    this.heroSpawnTimer = 0
    this.waveTransitionTimer = 0
    this.isWaveTransitioning = false
    this.allWavesSpawned = false
    this.units = []
    this.nextUnitId = 0
    this.deployCards = []
    this.deploySlotMode = false
    this.pendingDeployMonsterId = null
    this.slotSelectText = null
    this.skipNextSlotCancel = false
    this.allDeadTimer = 0
    this.goldEarned = 0
    this.battleEnded = false

    // Physics collider
    this.collider = null

    // 消耗品
    this.allyLimitBonus = 0
    this.unusedHeals = 0
    this.unusedCrystals = 0
    this.crystalsAppliedCount = 0
    this.healButton = null
    // healButton cleanup handled by container.destroy()
  }

  private setupPhysicsGroups(): void {
    this.allyGroup = this.scene.physics.add.group({
      collideWorldBounds: true,
    })
    this.enemyGroup = this.scene.physics.add.group({
      collideWorldBounds: true,
    })

    // 設定 group 之間的碰撞
    this.collider = this.scene.physics.add.collider(
      this.allyGroup,
      this.enemyGroup,
      undefined,
      undefined,
      this
    )
  }

  // ============ 房間渲染 ============

  private drawBattleRoom(): void {
    const g = this.scene.add.graphics()
    this.roomGraphics = g

    // 地板
    g.fillStyle(ROOM_FLOOR, 1)
    g.fillRect(ROOM_X, ROOM_Y, ROOM_WIDTH, ROOM_HEIGHT)

    // 牆壁
    const wallThickness = 6
    g.fillStyle(ROOM_WALL, 1)
    g.fillRect(ROOM_X, ROOM_Y, ROOM_WIDTH, wallThickness)
    g.fillRect(ROOM_X, ROOM_Y + ROOM_HEIGHT - wallThickness, ROOM_WIDTH, wallThickness)
    g.fillRect(ROOM_X, ROOM_Y, wallThickness, ROOM_HEIGHT)
    g.fillRect(ROOM_X + ROOM_WIDTH - wallThickness, ROOM_Y, wallThickness, ROOM_HEIGHT)
  }

  // ============ 破牆動畫 ============

  private playBreachAnimation(onComplete: () => void): void {
    const breach = getBreachPosition(this.breachDirection)
    const g = this.scene.add.graphics()
    this.breachGraphics = g

    // 畫破口（閃爍效果）
    g.fillStyle(0xff6644, 1)
    g.fillCircle(breach.x, breach.y, 20)
    g.setAlpha(0)

    this.scene.tweens.add({
      targets: g,
      alpha: { from: 0, to: 1 },
      duration: 250,
      yoyo: true,
      repeat: 0,
      onComplete: () => {
        // 破口留下永久標記
        g.clear()
        g.fillStyle(0x443333, 1)
        g.fillCircle(breach.x, breach.y, 16)
        g.setAlpha(0.8)

        eventBus.emit({ type: 'WALL_BROKEN', wallId: `breach_${this.breachDirection}` })
        onComplete()
      },
    })
  }

  // ============ 波次管理 ============

  private startNextWave(): void {
    if (this.currentWaveIndex >= this.activeWaves.length) {
      this.allWavesSpawned = true
      return
    }

    const wave = this.activeWaves[this.currentWaveIndex]

    // 展開 entries 為排隊序列
    const queue: Array<{ heroId: string }> = []
    for (const entry of wave.entries) {
      for (let i = 0; i < entry.count; i++) {
        queue.push({ heroId: entry.heroId })
      }
    }
    this.heroSpawnQueue = queue
    this.heroSpawnTimer = 0

    eventBus.emit({ type: 'WAVE_STARTED', waveNumber: wave.waveNumber })

    // 更新 GameStore
    gameStore.dispatchRunState(run => ({
      ...run,
      battleState: {
        ...run.battleState,
        currentWave: this.currentWaveIndex + 1,
      },
    }))
  }

  private updateWaveTransition(delta: number): void {
    if (!this.isWaveTransitioning) return

    this.waveTransitionTimer -= delta

    if (this.waveTransitionTimer <= 0) {
      this.isWaveTransitioning = false
      this.waveTransitionText?.destroy()
      this.waveTransitionText = null
      this.startNextWave()
    }
  }

  private beginWaveTransition(): void {
    this.isWaveTransitioning = true
    this.waveTransitionTimer = WAVE_INTERVAL

    // 顯示提示文字
    this.waveTransitionText = this.scene.add.text(
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2 - 40,
      '下一波即將來臨...',
      {
        fontSize: '18px',
        color: '#ffcc44',
        fontStyle: 'bold',
      }
    )
    this.waveTransitionText.setOrigin(0.5)

    // 文字閃爍
    this.scene.tweens.add({
      targets: this.waveTransitionText,
      alpha: { from: 1, to: 0.4 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    })
  }

  // ============ 英雄生成 ============

  private updateHeroSpawning(_time: number, delta: number): void {
    if (this.heroSpawnQueue.length === 0) return
    if (this.isWaveTransitioning) return

    // 場上敵人上限檢查
    const aliveEnemies = this.units.filter(u => u.faction === 'enemy' && u.alive)
    if (aliveEnemies.length >= MAX_ENEMIES) return

    this.heroSpawnTimer += delta
    if (this.heroSpawnTimer < ENEMY_SPAWN_INTERVAL) return

    this.heroSpawnTimer = 0

    const entry = this.heroSpawnQueue.shift()
    if (!entry) return

    this.spawnHero(entry.heroId)

    // 波次生成完畢檢查
    if (this.heroSpawnQueue.length === 0) {
      eventBus.emit({
        type: 'WAVE_COMPLETED',
        waveNumber: this.activeWaves[this.currentWaveIndex].waveNumber,
      })
      this.currentWaveIndex += 1

      // 還有下一波
      if (this.currentWaveIndex < this.activeWaves.length) {
        this.beginWaveTransition()
      } else {
        this.allWavesSpawned = true
      }
    }
  }

  private spawnHero(heroId: string): void {
    const heroDef = DataRegistry.getHeroById(heroId)
    if (!heroDef) return

    const breach = getBreachPosition(this.breachDirection)
    const unit = this.createUnit(heroDef, 'enemy', breach.x, breach.y, -1)
    this.units = [...this.units, unit]

    // 部署動畫（scale 0 → 1）
    unit.sprite.setScale(0)
    this.scene.tweens.add({
      targets: unit.sprite,
      scaleX: 1,
      scaleY: 1,
      duration: 500,
      ease: 'Back.easeOut',
    })

    eventBus.emit({ type: 'HERO_SPAWNED', heroId, lane: 0 })
  }

  // ============ 怪物部署 ============

  private deployMonster(monsterId: string, slotIndex: number): void {
    const monsterDef = DataRegistry.getMonsterById(monsterId)
    if (!monsterDef) return

    // 場上我方上限檢查
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
    if (aliveAllies.length >= this.getEffectiveAllyLimit()) return

    // 槽位已被佔用檢查
    const slotOccupied = this.units.some(
      u => u.faction === 'ally' && u.alive && u.slotIndex === slotIndex
    )
    if (slotOccupied) return

    const pos = DEPLOY_SLOT_POSITIONS[slotIndex]
    const unit = this.createMonsterUnit(monsterDef, pos.x, pos.y, slotIndex)

    // 套用水晶 buff（ATK+5）給前 N 隻部署的怪物
    if (this.crystalsAppliedCount < this.unusedCrystals) {
      unit.atk = unit.atk + 5
      unit.baseATK = unit.baseATK + 5
      this.crystalsAppliedCount += 1
    }

    this.units = [...this.units, unit]

    // 部署動畫
    unit.sprite.setScale(0)
    this.scene.tweens.add({
      targets: unit.sprite,
      scaleX: 1,
      scaleY: 1,
      duration: 500,
      ease: 'Back.easeOut',
    })

    // 更新部署卡片 CD
    const card = this.deployCards.find(c => c.monsterId === monsterId)
    if (card) {
      card.lastDeployTime = this.scene.time.now
    }

    eventBus.emit({ type: 'MONSTER_DEPLOYED', monsterId, slotIndex })
    this.exitSlotSelectMode()
  }

  // ============ 進化查詢 ============

  /**
   * 查詢怪物的進化資料
   * 從 GameStore run.monsters 讀取 evolutionPath，再從 DataRegistry 取得 EvolutionDefinition
   */
  private resolveEvolution(monsterId: string): EvolutionDefinition | null {
    const runState = gameStore.getState().run
    const monsterInstance = runState.monsters.find(m => m.monsterId === monsterId)
    if (!monsterInstance?.evolutionPath) return null

    const route = monsterInstance.evolutionPath as 'A' | 'B'
    return DataRegistry.getEvolutionByPath(monsterId, route) ?? null
  }

  // ============ 單位工廠 ============

  private createUnit(
    heroDef: HeroDefinition,
    faction: 'enemy',
    x: number,
    y: number,
    slotIndex: number
  ): BattleUnit {
    const unitId = `unit_${this.nextUnitId}`
    this.nextUnitId += 1

    const color = ENEMY_COLOR
    const radius = 12

    // 建立圓形 sprite (Arcade Physics)
    const sprite = this.scene.add.circle(x, y, radius, color)
    sprite.setStrokeStyle(2, ENEMY_OUTLINE)
    this.scene.physics.add.existing(sprite)

    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setCircle(radius)
    body.setCollideWorldBounds(true)
    body.setBounce(0.1)

    this.enemyGroup?.add(sprite)

    // HP 條
    const hpBar = this.scene.add.graphics()
    this.drawHPBar(hpBar, x, y - radius - 6, heroDef.stats.hp, heroDef.stats.hp)

    return {
      sprite,
      hpBar,
      ai: createUnitAI(),
      faction,
      id: unitId,
      definitionId: heroDef.id,
      hp: heroDef.stats.hp,
      maxHP: heroDef.stats.hp,
      atk: heroDef.stats.attack,
      baseATK: heroDef.stats.attack,
      attackInterval: heroDef.stats.attackInterval,
      moveSpeed: heroDef.stats.moveSpeed,
      attackRange: heroDef.stats.attackRange,
      aiType: heroDef.aiType,
      alive: true,
      triggeredTrap: false,
      slotIndex,
      goldReward: heroDef.goldReward,
      xpReward: heroDef.xpReward,
      isChicken: false,
      evolution: null,
    }
  }

  private createMonsterUnit(
    monsterDef: MonsterDefinition,
    x: number,
    y: number,
    slotIndex: number
  ): BattleUnit {
    const unitId = `unit_${this.nextUnitId}`
    this.nextUnitId += 1

    const color = ALLY_COLOR
    const radius = 12

    const sprite = this.scene.add.circle(x, y, radius, color)
    sprite.setStrokeStyle(2, ALLY_OUTLINE)
    this.scene.physics.add.existing(sprite)

    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setCircle(radius)
    body.setCollideWorldBounds(true)
    body.setBounce(0.1)

    this.allyGroup?.add(sprite)

    // Check evolution from GameStore
    const evo = this.resolveEvolution(monsterDef.id)

    // Use evolved stats if available, fallback to base
    const hp = evo?.evolvedStats.hp ?? monsterDef.stats.hp
    const atk = evo?.evolvedStats.attack ?? monsterDef.stats.attack
    const attackInterval = (evo?.evolvedStats.attackInterval ?? monsterDef.stats.attackInterval) * this.roomBonuses.attackSpeedMultiplier
    const moveSpeed = evo?.evolvedStats.moveSpeed ?? monsterDef.stats.moveSpeed
    const attackRange = evo?.evolvedStats.attackRange ?? monsterDef.stats.attackRange
    const aiType = evo?.aiType ?? monsterDef.aiType
    const defId = evo?.id ?? monsterDef.id

    const hpBar = this.scene.add.graphics()
    this.drawHPBar(hpBar, x, y - radius - 6, hp, hp)

    return {
      sprite,
      hpBar,
      ai: createUnitAI(),
      faction: 'ally',
      id: unitId,
      definitionId: defId,
      hp,
      maxHP: hp,
      atk,
      baseATK: atk,
      attackInterval,
      moveSpeed,
      attackRange,
      aiType,
      alive: true,
      triggeredTrap: false,
      slotIndex,
      goldReward: 0,
      xpReward: 0,
      isChicken: false,
      evolution: evo,
    }
  }

  // ============ 進化特殊能力 ============

  /**
   * 計算單位的有效攻擊力
   * - Goblin Captain aura: all allies ATK+3
   * - Berserker Ogre: ATK scales with lost HP
   */
  private getEffectiveATK(unit: BattleUnit): number {
    let effectiveATK = unit.atk

    // Berserker Ogre: damage_scaling
    if (unit.definitionId === 'berserker_ogre' && unit.evolution) {
      const params = unit.evolution.specialAbility.params
      const scaling = (params['damageScaling'] as number) ?? 0.5
      const maxMult = (params['maxMultiplier'] as number) ?? 3
      effectiveATK = calculateBerserkerATK(unit.baseATK, unit.hp, unit.maxHP, scaling, maxMult)
    }

    // Goblin Captain aura: all allies get ATK+3
    if (unit.faction === 'ally') {
      const captainUnit = this.units.find(
        u => u.faction === 'ally' && u.alive && u.definitionId === 'goblin_captain'
      )
      if (captainUnit?.evolution) {
        const bonus = (captainUnit.evolution.specialAbility.params['attackBonus'] as number) ?? 3
        effectiveATK += bonus
      }
    }

    return effectiveATK
  }

  // ============ 每幀更新 ============

  private updateUnits(time: number, delta: number): void {
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
    const aliveEnemies = this.units.filter(u => u.faction === 'enemy' && u.alive)

    for (const unit of this.units) {
      if (!unit.alive) continue

      // 決定這個單位的敵方列表
      const enemies = unit.faction === 'ally'
        ? aliveEnemies.map(e => ({ x: e.sprite.x, y: e.sprite.y, hp: e.hp }))
        : aliveAllies.map(e => ({ x: e.sprite.x, y: e.sprite.y, hp: e.hp }))

      // 更新 AI
      const aiResult: UpdateAIResult = updateAI(
        unit.ai,
        unit.aiType,
        unit.sprite.x,
        unit.sprite.y,
        unit.moveSpeed,
        unit.attackRange,
        unit.attackInterval,
        enemies,
        time,
        delta
      )

      unit.ai = aiResult.newAI

      // 移動
      this.applyMovement(unit, aiResult)

      // Bug fix: 敵人無目標時向房間中心推進（避免卡在破口不動）
      if (unit.faction === 'enemy' && unit.ai.state === AIState.IDLE && enemies.length === 0) {
        const centerX = ROOM_X + ROOM_WIDTH / 2
        const centerY = ROOM_Y + ROOM_HEIGHT * 0.5
        const body = unit.sprite.body as Phaser.Physics.Arcade.Body
        const dx = centerX - unit.sprite.x
        const dy = centerY - unit.sprite.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist > 20) {
          body.setVelocity(
            (dx / dist) * unit.moveSpeed,
            (dy / dist) * unit.moveSpeed
          )
        }
      }

      // 攻擊
      if (aiResult.shouldAttack && unit.ai.targetIndex !== null) {
        const targetList = unit.faction === 'ally' ? aliveEnemies : aliveAllies
        const target = targetList[unit.ai.targetIndex]
        if (target) {
          this.performAttack(unit, target, targetList)
        }
      }

      // 更新 HP 條位置
      this.drawHPBar(
        unit.hpBar,
        unit.sprite.x,
        unit.sprite.y - 18,
        unit.hp,
        unit.maxHP
      )
    }
  }

  private applyMovement(unit: BattleUnit, aiResult: UpdateAIResult): void {
    const body = unit.sprite.body as Phaser.Physics.Arcade.Body

    if (unit.ai.state === AIState.SPAWNING) {
      body.setVelocity(0, 0)
      return
    }

    // ranged_stationary: 不移動
    if (unit.aiType === 'ranged_stationary') {
      body.setVelocity(0, 0)
      return
    }

    if (aiResult.moveToX !== null && aiResult.moveToY !== null) {
      // 使用 physics.moveToObject 風格：計算方向並設定速度
      const dx = aiResult.moveToX - unit.sprite.x
      const dy = aiResult.moveToY - unit.sprite.y
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist > 0) {
        body.setVelocity(
          (dx / dist) * unit.moveSpeed,
          (dy / dist) * unit.moveSpeed
        )
      }
    } else {
      body.setVelocity(0, 0)
    }
  }

  private performAttack(attacker: BattleUnit, target: BattleUnit, targetList: BattleUnit[]): void {
    const effectiveATK = this.getEffectiveATK(attacker)
    const damage = calculateDamage(effectiveATK)
    this.applyDamage(target, damage)

    // 遠程投射物視覺效果
    if (attacker.aiType === 'ranged_stationary') {
      this.createProjectile(attacker.sprite.x, attacker.sprite.y, target.sprite.x, target.sprite.y)
    }

    // Skeleton Mage AOE: damage all enemies within 50px of target
    if (attacker.definitionId === 'skeleton_mage' && attacker.evolution) {
      const aoeRadius = (attacker.evolution.specialAbility.params['aoeRadius'] as number) ?? 50
      const aoeRadiusSq = aoeRadius * aoeRadius
      for (const other of targetList) {
        if (other === target || !other.alive) continue
        const dx = other.sprite.x - target.sprite.x
        const dy = other.sprite.y - target.sprite.y
        const distSq = dx * dx + dy * dy
        if (distSq <= aoeRadiusSq) {
          this.applyDamage(other, damage)
          this.flashWhite(other.sprite)
        }
      }
    }

    // Ironclad Ogre knockback: push target away on hit
    if (attacker.definitionId === 'ironclad_ogre' && attacker.evolution && target.alive) {
      this.applyKnockback(attacker, target)
    }

    // 近戰受擊閃白效果
    this.flashWhite(target.sprite)
  }

  /**
   * Ironclad Ogre knockback: apply extra push force to target
   */
  private applyKnockback(attacker: BattleUnit, target: BattleUnit): void {
    const targetBody = target.sprite.body as Phaser.Physics.Arcade.Body
    const dx = target.sprite.x - attacker.sprite.x
    const dy = target.sprite.y - attacker.sprite.y
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= 0) return

    const force = (attacker.evolution?.specialAbility.params['knockbackForce'] as number) ?? 1.5
    const knockbackStrength = 120 * force
    targetBody.velocity.x += (dx / dist) * knockbackStrength
    targetBody.velocity.y += (dy / dist) * knockbackStrength
  }

  private applyDamage(unit: BattleUnit, damage: number): void {
    unit.hp = Math.max(0, unit.hp - damage)

    if (unit.hp <= 0) {
      this.killUnit(unit)
    }
  }

  private killUnit(unit: BattleUnit): void {
    unit.alive = false

    // 死亡動畫 0.4s（alpha + scale 淡出）
    this.scene.tweens.add({
      targets: unit.sprite,
      alpha: 0,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: 400,
      onComplete: () => {
        unit.sprite.destroy()
        unit.hpBar.destroy()
      },
    })

    // 停止物理 body
    const body = unit.sprite.body as Phaser.Physics.Arcade.Body
    body.setVelocity(0, 0)
    body.enable = false

    if (unit.faction === 'enemy') {
      // 擊殺獎勵
      const goldReward = Math.floor(unit.goldReward * this.roomBonuses.goldMultiplier)
      if (goldReward > 0) {
        this.goldEarned += goldReward
        this.scene.data.set('goldEarned', this.goldEarned)
        gameStore.dispatchRunState(run => ({
          ...run,
          gold: run.gold + goldReward,
        }))
        eventBus.emit({ type: 'GOLD_EARNED', amount: goldReward, source: `kill_${unit.definitionId}` })
      }

      // 分配 XP 給存活的我方怪物
      if (unit.xpReward > 0) {
        const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
        if (aliveAllies.length > 0) {
          const xpPerMonster = Math.ceil(unit.xpReward / aliveAllies.length)
          for (const ally of aliveAllies) {
            gameStore.dispatchRunState(run => gainMonsterXP(run, ally.definitionId, xpPerMonster))
          }
        }
      }

      eventBus.emit({ type: 'HERO_KILLED', heroId: unit.definitionId })

      // 更新 enemies remaining
      gameStore.dispatchRunState(run => ({
        ...run,
        battleState: {
          ...run.battleState,
          enemiesRemaining: Math.max(0, run.battleState.enemiesRemaining - 1),
        },
      }))
    } else {
      eventBus.emit({ type: 'MONSTER_DIED', monsterId: unit.definitionId })
    }
  }

  // ============ 碰撞互斥力 ============

  private applyAllyEnemySeparation(): void {
    const aliveUnits = this.units.filter(u => u.alive)
    const separationForce = 30 // 微弱推力

    for (let i = 0; i < aliveUnits.length; i++) {
      for (let j = i + 1; j < aliveUnits.length; j++) {
        const a = aliveUnits[i]
        const b = aliveUnits[j]

        const dx = b.sprite.x - a.sprite.x
        const dy = b.sprite.y - a.sprite.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = 24 // 兩個圓的半徑之和

        // Bug fix: 完全重疊時用隨機偏移打破對稱
        if (dist === 0) {
          const randomAngle = Math.random() * Math.PI * 2
          const nudge = 2
          const bodyA = a.sprite.body as Phaser.Physics.Arcade.Body
          bodyA.setVelocity(
            Math.cos(randomAngle) * nudge * 10,
            Math.sin(randomAngle) * nudge * 10
          )
          continue
        }

        if (dist < minDist) {
          const overlap = minDist - dist
          const nx = dx / dist
          const ny = dy / dist

          const bodyA = a.sprite.body as Phaser.Physics.Arcade.Body
          const bodyB = b.sprite.body as Phaser.Physics.Arcade.Body

          bodyA.velocity.x -= nx * separationForce * overlap * 0.5
          bodyA.velocity.y -= ny * separationForce * overlap * 0.5
          bodyB.velocity.x += nx * separationForce * overlap * 0.5
          bodyB.velocity.y += ny * separationForce * overlap * 0.5
        }
      }
    }
  }

  // ============ 陷阱檢查 ============

  private updateTraps(): void {
    if (!this.trapSystem) return

    const aliveEnemies = this.units.filter(u => u.faction === 'enemy' && u.alive)
    const enemyData = aliveEnemies.map(e => ({
      x: e.sprite.x,
      y: e.sprite.y,
      maxHP: e.maxHP,
      triggeredTrap: e.triggeredTrap,
    }))

    const results = this.trapSystem.checkTriggers(enemyData)

    for (const result of results) {
      const enemy = aliveEnemies[result.enemyIndex]
      if (enemy) {
        enemy.triggeredTrap = true
        const trapDamage = calculateTrapDamage(enemy.maxHP, DATA_CONSTANTS.TRAP_DAMAGE_PERCENT)
        this.applyDamage(enemy, trapDamage)
        this.flashWhite(enemy.sprite)
        eventBus.emit({ type: 'TRAP_TRIGGERED', trapId: result.trapId, damage: trapDamage })
      }
    }

    this.trapSystem.removeTriggered()
  }

  // ============ 視覺效果 ============

  private drawHPBar(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    currentHP: number,
    maxHP: number
  ): void {
    graphics.clear()

    const barWidth = 24
    const barHeight = 3
    const hpPercent = Math.max(0, currentHP / maxHP)

    // 背景
    graphics.fillStyle(0x333333, 1)
    graphics.fillRect(x - barWidth / 2, y, barWidth, barHeight)

    // HP 填充
    const fillColor = hpPercent > 0.5 ? 0x44cc44 : hpPercent > 0.25 ? 0xcccc44 : 0xcc4444
    graphics.fillStyle(fillColor, 1)
    graphics.fillRect(x - barWidth / 2, y, barWidth * hpPercent, barHeight)
  }

  private flashWhite(sprite: Phaser.GameObjects.Arc): void {
    const originalColor = sprite.fillColor
    sprite.setFillStyle(0xffffff)

    this.scene.time.delayedCall(80, () => {
      if (sprite.active) {
        sprite.setFillStyle(originalColor)
      }
    })
  }

  private createProjectile(fromX: number, fromY: number, toX: number, toY: number): void {
    const projectile = this.scene.add.circle(fromX, fromY, 4, 0xffff88)

    this.scene.tweens.add({
      targets: projectile,
      x: toX,
      y: toY,
      duration: 200,
      onComplete: () => {
        projectile.destroy()
      },
    })
  }

  // ============ 部署面板 ============

  private createDeployPanel(): void {
    const panelY = ROOM_Y + ROOM_HEIGHT + 20
    const panelWidth = ROOM_WIDTH
    const panelHeight = 80

    const container = this.scene.add.container(ROOM_X, panelY)
    this.deployPanelContainer = container

    // 面板背景
    const bg = this.scene.add.rectangle(
      panelWidth / 2, panelHeight / 2,
      panelWidth, panelHeight,
      UI_PANEL
    )
    bg.setStrokeStyle(2, UI_BORDER)
    container.add(bg)

    // 取得玩家擁有的怪物列表
    const ownedMonsters = this.getOwnedMonsterIds()
    const cardWidth = 80
    const cardGap = 10
    const totalWidth = ownedMonsters.length * cardWidth + (ownedMonsters.length - 1) * cardGap
    const startX = (panelWidth - totalWidth) / 2

    for (let i = 0; i < ownedMonsters.length; i++) {
      const monsterId = ownedMonsters[i]
      const monsterDef = DataRegistry.getMonsterById(monsterId)
      if (!monsterDef) continue

      const cardX = startX + i * (cardWidth + cardGap)
      this.createDeployCard(container, monsterDef, cardX, 10, cardWidth, panelHeight - 20)
    }
  }

  private createDeployCard(
    container: Phaser.GameObjects.Container,
    monsterDef: MonsterDefinition,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {
    const cardBg = this.scene.add.rectangle(
      x + width / 2, y + height / 2,
      width, height,
      UI_BG
    )
    cardBg.setStrokeStyle(1, UI_BORDER)
    cardBg.setInteractive({ useHandCursor: true })
    container.add(cardBg)

    // CD 覆蓋層
    const cdOverlay = this.scene.add.rectangle(
      x + width / 2, y + height / 2,
      width, height,
      0x000000, 0.6
    )
    cdOverlay.setVisible(false)
    container.add(cdOverlay)

    // 名稱文字（show evolved name if applicable）
    const evo = this.resolveEvolution(monsterDef.id)
    const displayName = evo ? evo.path.name : monsterDef.name
    const nameText = this.scene.add.text(
      x + width / 2, y + height / 2,
      displayName,
      {
        fontSize: '13px',
        color: `#${UI_TEXT.toString(16)}`,
        align: 'center',
      }
    )
    nameText.setOrigin(0.5)
    container.add(nameText)

    const card: DeployCard = {
      monsterId: monsterDef.id,
      name: displayName,
      cooldownMs: monsterDef.deployCooldown,
      lastDeployTime: -monsterDef.deployCooldown, // 起始不 CD
      container,
      bg: cardBg,
      cdOverlay,
      nameText,
    }

    cardBg.on('pointerup', () => {
      this.onDeployCardClicked(card)
    })

    this.deployCards = [...this.deployCards, card]
  }

  private onDeployCardClicked(card: DeployCard): void {
    // CD 中不可點擊
    const now = this.scene.time.now
    if (now - card.lastDeployTime < card.cooldownMs) return

    // 場上我方已滿不可部署
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
    if (aliveAllies.length >= this.getEffectiveAllyLimit()) return

    // 已在選槽位模式中，若再點同一張 → 取消
    if (this.deploySlotMode && this.pendingDeployMonsterId === card.monsterId) {
      this.exitSlotSelectMode()
      return
    }

    // 進入選槽位模式
    this.enterSlotSelectMode(card.monsterId)
  }

  private updateDeployPanel(time: number): void {
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
    const isFull = aliveAllies.length >= this.getEffectiveAllyLimit()

    for (const card of this.deployCards) {
      const cdRemaining = card.cooldownMs - (time - card.lastDeployTime)
      const isOnCD = cdRemaining > 0

      card.cdOverlay.setVisible(isOnCD || isFull)

      if (isFull) {
        card.bg.setAlpha(0.5)
      } else {
        card.bg.setAlpha(isOnCD ? 0.7 : 1)
      }
    }
  }

  // ============ 槽位選擇模式 ============

  private enterSlotSelectMode(monsterId: string): void {
    this.exitSlotSelectMode() // 先清除舊的

    this.deploySlotMode = true
    this.pendingDeployMonsterId = monsterId
    this.skipNextSlotCancel = true

    // 顯示槽位高亮圓圈（綠色，與敵人金色明顯區分）
    for (let i = 0; i < DEPLOY_SLOT_POSITIONS.length; i++) {
      const pos = DEPLOY_SLOT_POSITIONS[i]

      // 檢查槽位是否已被佔用
      const occupied = this.units.some(
        u => u.faction === 'ally' && u.alive && u.slotIndex === i
      )

      const color = occupied ? 0x666666 : 0x44ff44
      const alpha = occupied ? 0.3 : 0.5

      const indicator = this.scene.add.circle(pos.x, pos.y, SLOT_SELECT_RADIUS, color, alpha)
      indicator.setStrokeStyle(3, occupied ? 0x444444 : 0x88ff88)

      // 未佔用的槽位：脈衝動畫 + 可點擊
      if (!occupied) {
        this.scene.tweens.add({
          targets: indicator,
          alpha: { from: 0.3, to: 0.7 },
          duration: 600,
          yoyo: true,
          repeat: -1,
        })

        indicator.setInteractive({ useHandCursor: true })
        const slotIdx = i
        indicator.on('pointerup', () => {
          if (this.pendingDeployMonsterId) {
            this.deployMonster(this.pendingDeployMonsterId, slotIdx)
          }
        })
      }

      this.slotIndicators = [...this.slotIndicators, indicator]
    }

    // 顯示操作提示文字
    this.slotSelectText = this.scene.add.text(
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT + 8,
      '點選綠色位置部署',
      { fontSize: '14px', color: '#44ff44' }
    )
    this.slotSelectText.setOrigin(0.5)
  }

  private exitSlotSelectMode(): void {
    this.deploySlotMode = false
    this.pendingDeployMonsterId = null

    for (const indicator of this.slotIndicators) {
      this.scene.tweens.killTweensOf(indicator)
      indicator.destroy()
    }
    this.slotIndicators = []

    this.slotSelectText?.destroy()
    this.slotSelectText = null
  }

  // ============ 輸入處理 ============

  private setupInputHandlers(): void {
    this.pointerHandler = (_pointer: Phaser.Input.Pointer) => {
      // Bug fix: 跳過由 enterSlotSelectMode 同一次 pointerup 冒泡觸發的取消
      if (this.skipNextSlotCancel) {
        this.skipNextSlotCancel = false
        return
      }

      if (!this.deploySlotMode) return

      // 點擊非 indicator 區域 → 取消選槽位模式
      // （indicator 的 pointerup 會先觸發並完成部署，此時 deploySlotMode 已為 false）
      this.exitSlotSelectMode()
    }

    this.scene.input.on('pointerup', this.pointerHandler)
  }

  // ============ 勝敗判定 ============

  private checkWinLoseConditions(delta: number): void {
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
    const aliveEnemies = this.units.filter(u => u.faction === 'enemy' && u.alive)

    // 勝利：所有波次已生成完畢 + 場上無敵人 + 佇列為空
    if (
      this.allWavesSpawned &&
      aliveEnemies.length === 0 &&
      this.heroSpawnQueue.length === 0 &&
      !this.isWaveTransitioning
    ) {
      this.onBattleWon()
      return
    }

    // 失敗：我方全滅 + 3 秒緩衝
    if (aliveAllies.length === 0 && !this.isAlliedDeployPossible()) {
      this.allDeadTimer += delta
      if (this.allDeadTimer >= this.ALL_DEAD_BUFFER) {
        this.onBattleLost()
        return
      }
    } else {
      this.allDeadTimer = 0
    }
  }

  /**
   * 檢查玩家是否還能部署（有可用卡片且不在 CD 中）
   */
  private isAlliedDeployPossible(): boolean {
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
    if (aliveAllies.length >= this.getEffectiveAllyLimit()) return false

    const now = this.scene.time.now
    return this.deployCards.some(card => now - card.lastDeployTime >= card.cooldownMs)
  }

  private onBattleWon(): void {
    if (this.battleEnded) return
    this.battleEnded = true

    // 顯示勝利文字
    const winText = this.scene.add.text(
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2,
      '勝利!',
      {
        fontSize: '32px',
        color: '#44ff44',
        fontStyle: 'bold',
      }
    )
    winText.setOrigin(0.5)

    this.scene.tweens.add({
      targets: winText,
      scaleX: { from: 0, to: 1.2 },
      scaleY: { from: 0, to: 1.2 },
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.time.delayedCall(1000, () => {
          winText.destroy()
          this.scene.events.emit('battle-won')
          eventBus.emit({ type: 'BATTLE_WON', roomIndex: this.roomDistance })
        })
      },
    })

    // 寶藏室被動收入
    if (this.roomBonuses.passiveGold > 0) {
      const passiveGold = this.roomBonuses.passiveGold
      this.goldEarned += passiveGold
      this.scene.data.set('goldEarned', this.goldEarned)
      gameStore.dispatchRunState(run => ({
        ...run,
        gold: run.gold + passiveGold,
      }))
      eventBus.emit({ type: 'GOLD_EARNED', amount: passiveGold, source: 'treasury_passive' })
    }

    gameStore.dispatchRunState(run => ({
      ...run,
      battleState: {
        ...run.battleState,
        isActive: false,
      },
    }))
  }

  private onBattleLost(): void {
    if (this.battleEnded) return
    this.battleEnded = true

    const loseText = this.scene.add.text(
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2,
      '失敗...',
      {
        fontSize: '32px',
        color: '#ff4444',
        fontStyle: 'bold',
      }
    )
    loseText.setOrigin(0.5)

    this.scene.tweens.add({
      targets: loseText,
      alpha: { from: 0, to: 1 },
      duration: 600,
      onComplete: () => {
        this.scene.time.delayedCall(1000, () => {
          loseText.destroy()
          this.scene.events.emit('battle-lost')
          eventBus.emit({ type: 'BATTLE_LOST', roomIndex: this.roomDistance })
        })
      },
    })

    gameStore.dispatchRunState(run => ({
      ...run,
      battleState: {
        ...run.battleState,
        isActive: false,
      },
    }))
  }

  // ============ 消耗品系統 ============

  private getEffectiveAllyLimit(): number {
    return MAX_ALLIES + this.allyLimitBonus
  }

  private applyPurchasedConsumables(): void {
    const purchased = (this.scene.data.get('purchasedConsumables') as Array<{ id: string; type: string }>) ?? []
    if (purchased.length === 0) return

    const breach = getBreachPosition(this.breachDirection)

    // 套用後立即清空，避免第二場戰鬥重複套用
    this.scene.data.set('purchasedConsumables', [])

    for (const item of purchased) {
      switch (item.type) {
        case 'trap': {
          // 在破口附近放置陷阱
          const offsetX = (Math.random() - 0.5) * 40
          const offsetY = 20 + Math.random() * 20
          this.trapSystem?.placeTrap(
            breach.x + offsetX,
            breach.y + offsetY,
            DATA_CONSTANTS.TRAP_DAMAGE_PERCENT,
            30
          )
          break
        }
        case 'reinforcement':
          this.allyLimitBonus += 1
          break
        case 'heal':
          this.unusedHeals += 1
          break
        case 'crystal':
          this.unusedCrystals += 1
          break
      }
    }

    // 建立治療按鈕（如果有購買治療）
    if (this.unusedHeals > 0) {
      this.createHealButton()
    }
  }

  private createHealButton(): void {
    const panelY = ROOM_Y + ROOM_HEIGHT + 20
    const btnSize = 50
    const btnX = ROOM_X - 10
    const btnY = panelY + 40

    const container = this.scene.add.container(btnX, btnY)
    this.healButton = container

    const bg = this.scene.add.rectangle(0, 0, btnSize, btnSize, 0x226622)
    bg.setStrokeStyle(2, 0x44cc44)
    bg.setInteractive({ useHandCursor: true })
    container.add(bg)

    const label = this.scene.add.text(0, -10, 'Heal', {
      fontSize: '11px', color: '#44ff44',
    })
    label.setOrigin(0.5)
    container.add(label)

    const countText = this.scene.add.text(0, 10, `x${this.unusedHeals}`, {
      fontSize: '12px', color: '#ffffff',
    })
    countText.setOrigin(0.5)
    container.add(countText)
    container.setData('countText', countText)

    bg.on('pointerup', () => { this.useHealConsumable() })
    container.setVisible(false) // 初始隱藏，由 updateConsumableUI 控制
  }

  private useHealConsumable(): void {
    if (this.unusedHeals <= 0) return

    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive && !u.isChicken)
    if (aliveAllies.length === 0) return

    // 找血量百分比最低的
    let lowestUnit = aliveAllies[0]
    let lowestPercent = lowestUnit.hp / lowestUnit.maxHP
    for (const ally of aliveAllies) {
      const pct = ally.hp / ally.maxHP
      if (pct < lowestPercent) {
        lowestPercent = pct
        lowestUnit = ally
      }
    }

    // 回復 60% max HP
    const healAmount = Math.floor(lowestUnit.maxHP * DATA_CONSTANTS.HEAL_PERCENT)
    lowestUnit.hp = Math.min(lowestUnit.maxHP, lowestUnit.hp + healAmount)

    // 綠色閃爍
    const original = lowestUnit.sprite.fillColor
    lowestUnit.sprite.setFillStyle(0x44ff44)
    this.scene.time.delayedCall(150, () => {
      if (lowestUnit.sprite.active) lowestUnit.sprite.setFillStyle(original)
    })

    this.unusedHeals -= 1

    // 更新按鈕文字
    if (this.healButton) {
      const countText = this.healButton.getData('countText') as Phaser.GameObjects.Text
      if (this.unusedHeals > 0) {
        countText.setText(`x${this.unusedHeals}`)
      } else {
        this.healButton.setVisible(false)
      }
    }
  }

  private updateConsumableUI(): void {
    if (!this.healButton || this.unusedHeals <= 0) return

    // 只在有友軍 HP < 50% 時顯示
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive && !u.isChicken)
    const anyLow = aliveAllies.some(u => u.hp / u.maxHP < 0.5)
    this.healButton.setVisible(anyLow)
  }

  // ============ 房間加成系統 ============

  private calculateRoomBonuses(): RoomBonuses {
    const grid = this.scene.data.get('dungeonGrid') as { getConqueredRooms(): Array<{ roomType: string | null }> } | undefined
    if (!grid) return DEFAULT_ROOM_BONUSES

    const conquered = grid.getConqueredRooms()
    const roomCounts: Record<string, number> = {}
    for (const cell of conquered) {
      if (cell.roomType && cell.roomType !== 'dungeon_heart') {
        roomCounts[cell.roomType] = (roomCounts[cell.roomType] ?? 0) + 1
      }
    }

    // 寶藏室金幣加成
    let goldBonusSum = 0
    const treasuryCount = roomCounts['treasury'] ?? 0
    const treasuryDim = [0.5, 0.4, 0.25, 0.15]
    for (let i = 0; i < treasuryCount; i++) {
      goldBonusSum += treasuryDim[Math.min(i, treasuryDim.length - 1)]
    }

    // 訓練場攻速加成
    let atkSpeedBonusSum = 0
    const trainingCount = roomCounts['training_ground'] ?? 0
    const trainingDim = [0.15, 0.12, 0.08, 0.05]
    for (let i = 0; i < trainingCount; i++) {
      atkSpeedBonusSum += trainingDim[Math.min(i, trainingDim.length - 1)]
    }
    atkSpeedBonusSum = Math.min(atkSpeedBonusSum, 0.4) // cap 40%

    // 養雞場小雞數
    let chickenSum = 0
    const coopCount = roomCounts['chicken_coop'] ?? 0
    const coopDim = [2, 2, 1, 0]
    for (let i = 0; i < coopCount; i++) {
      chickenSum += coopDim[Math.min(i, coopDim.length - 1)]
    }
    chickenSum = Math.min(chickenSum, DATA_CONSTANTS.MAX_CHICKENS)

    return {
      goldMultiplier: 1 + goldBonusSum,
      attackSpeedMultiplier: 1 - atkSpeedBonusSum,
      chickenCount: chickenSum,
      passiveGold: treasuryCount * 20,
    }
  }

  private spawnChickens(): void {
    const count = this.roomBonuses.chickenCount
    if (count <= 0) return

    for (let i = 0; i < count; i++) {
      // 在房間後方隨機位置生成小雞
      const cx = ROOM_X + ROOM_WIDTH * 0.2 + Math.random() * ROOM_WIDTH * 0.6
      const cy = ROOM_Y + ROOM_HEIGHT * 0.7 + Math.random() * ROOM_HEIGHT * 0.2

      this.scene.time.delayedCall(i * 150, () => {
        const chicken = this.createChickenUnit(cx, cy)
        this.units = [...this.units, chicken]

        chicken.sprite.setScale(0)
        this.scene.tweens.add({
          targets: chicken.sprite,
          scaleX: 1, scaleY: 1,
          duration: 300,
          ease: 'Back.easeOut',
        })
      })
    }
  }

  private createChickenUnit(x: number, y: number): BattleUnit {
    const unitId = `unit_${this.nextUnitId}`
    this.nextUnitId += 1

    const radius = 8
    const color = 0xffee88 // 淡黃色

    const sprite = this.scene.add.circle(x, y, radius, color)
    sprite.setStrokeStyle(1, 0xccbb66)
    this.scene.physics.add.existing(sprite)

    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setCircle(radius)
    body.setCollideWorldBounds(true)
    body.setBounce(0.1)

    this.allyGroup?.add(sprite)

    const hpBar = this.scene.add.graphics()
    this.drawHPBar(hpBar, x, y - radius - 4, DATA_CONSTANTS.CHICKEN_HP, DATA_CONSTANTS.CHICKEN_HP)

    return {
      sprite,
      hpBar,
      ai: createUnitAI(),
      faction: 'ally',
      id: unitId,
      definitionId: 'chicken',
      hp: DATA_CONSTANTS.CHICKEN_HP,
      maxHP: DATA_CONSTANTS.CHICKEN_HP,
      atk: DATA_CONSTANTS.CHICKEN_ATK,
      baseATK: DATA_CONSTANTS.CHICKEN_ATK,
      attackInterval: 2.0,
      moveSpeed: DATA_CONSTANTS.CHICKEN_SPEED,
      attackRange: 30,
      aiType: 'melee_tank',
      alive: true,
      triggeredTrap: false,
      slotIndex: -1,
      goldReward: 0,
      xpReward: 0,
      isChicken: true,
      evolution: null,
    }
  }

  // ============ 工具函式 ============

  private countTotalEnemies(): number {
    let total = 0
    for (const wave of this.activeWaves) {
      for (const entry of wave.entries) {
        total += entry.count
      }
    }
    return total
  }

  /**
   * 取得玩家擁有的怪物 ID 列表
   * 從 GameStore 讀取，若無資料則用預設（goblin, skeleton, ogre）
   */
  private getOwnedMonsterIds(): string[] {
    const state = gameStore.getState()
    // 從局內怪物列表取得可用怪物（去重複）
    const ids = [...new Set(state.run.monsters.map(m => m.monsterId))]
    return ids.length > 0 ? ids : ['goblin']
  }

  // ============ 清理 ============

  private cleanupAll(): void {
    // 移除輸入事件
    if (this.pointerHandler) {
      this.scene.input.off('pointerup', this.pointerHandler)
      this.pointerHandler = null
    }

    // 銷毀所有單位
    for (const unit of this.units) {
      if (unit.sprite.active) {
        this.scene.tweens.killTweensOf(unit.sprite)
        unit.sprite.destroy()
      }
      if (unit.hpBar.active) {
        unit.hpBar.destroy()
      }
    }
    this.units = []

    // 銷毀槽位指示器
    this.exitSlotSelectMode()

    // 銷毀部署面板
    if (this.deployPanelContainer) {
      this.deployPanelContainer.destroy(true)
      this.deployPanelContainer = null
    }
    this.deployCards = []

    // 銷毀波次轉場文字
    if (this.waveTransitionText) {
      this.scene.tweens.killTweensOf(this.waveTransitionText)
      this.waveTransitionText.destroy()
      this.waveTransitionText = null
    }

    // 銷毀房間渲染
    this.roomGraphics?.destroy()
    this.roomGraphics = null

    this.breachGraphics?.destroy()
    this.breachGraphics = null

    // 清理陷阱系統
    this.trapSystem?.cleanup()
    this.trapSystem = null

    // 移除 Physics collider（必須在 destroy groups 之前）
    if (this.collider) {
      this.collider.destroy()
      this.collider = null
    }

    // 銷毀 Physics groups
    this.allyGroup?.destroy(true)
    this.allyGroup = null
    this.enemyGroup?.destroy(true)
    this.enemyGroup = null
  }
}
