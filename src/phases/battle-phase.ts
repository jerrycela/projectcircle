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
import type { HeroDefinition, MonsterDefinition, BattleWaveConfig, WaveDefinition, EvolutionDefinition, DodgeReaction, PushReaction, TauntReaction } from '../data/schemas'
import { DATA_CONSTANTS } from '../data/schemas'
import type { UpdateAIResult, UnitAI } from '../systems/ai-system'
import { createUnitAI, updateAI, AIState } from '../systems/ai-system'
import { calculateDamage, calculateTrapDamage, calculateBerserkerATK } from '../systems/combat-system'
import { TrapSystem } from '../systems/trap-system'
import { DataRegistry } from '../data/registry'
import { eventBus } from '../systems/event-bus'
import { gameStore } from '../state/game-store'
import type { MonsterInstance } from '../state/game-state'
import { gainMonsterXP } from '../state/actions'
import {
  GAME_WIDTH,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  MAX_ALLIES,
  MAX_ENEMIES,
  WAVE_INTERVAL,
  ENEMY_SPAWN_INTERVAL,
  UI_TEXT,
  UI_ACCENT,
  UI_SUCCESS,
  UI_DANGER,
} from '../config/constants'
import {
  drawEnhancedHPBar,
  flashUnit,
  spawnHitParticles,
  createProjectileFX,
  drawPanel,
  createTextBadge,
} from '../utils/visual-factory'
import { TEXTURE_KEYS, UNIT_TEXTURE_MAP, EVOLUTION_TINTS } from '../utils/texture-factory'

// ============ 房間座標常數 ============

const ROOM_X = (GAME_WIDTH - ROOM_WIDTH) / 2
const ROOM_Y = 20

// 發射台位置（房間底部中央）
const LAUNCH_PAD_X = ROOM_X + ROOM_WIDTH / 2
const LAUNCH_PAD_Y = ROOM_Y + ROOM_HEIGHT - 15
const LAUNCH_PAD_RADIUS = 18

// 發射參數
const LAUNCH_MIN_POWER = 300    // 最小初速 (px/s)
const LAUNCH_MAX_POWER = 600    // 最大初速 (px/s)
const LAUNCH_MAX_DRAG = 120     // 最大拖拽距離 (px)
const LAUNCH_BOUNCE = 0.85      // 發射中的 bounce 值
const LAUNCH_STOP_SPEED = 20    // 速度低於此值判定為停止
const LAUNCH_FRICTION = 0.98    // 每幀速度衰減（模擬摩擦力）

// 進化型尺寸差異（基礎型 = 2.0）
const EVOLUTION_SCALES: Record<string, number> = {
  goblin_assassin: 1.8,   // 精瘦敏捷
  goblin_captain: 2.2,    // 威武統帥
  skeleton_mage: 2.1,     // 法袍加高
  ironclad_ogre: 2.5,     // 厚重鐵甲
  berserker_ogre: 2.3,    // 狂暴膨脹
}

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
  sprite: Phaser.GameObjects.Sprite
  shadow: Phaser.GameObjects.Image | null
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
  goldReward: number         // enemies only
  xpReward: number           // enemies only
  isChicken: boolean         // chicken minions from chicken coop room bonus
  evolution: EvolutionDefinition | null  // evolution data if evolved
  isLaunching: boolean              // 是否在發射飛行中
  launchTime: number                // 發射開始時間 (Date.now())
  launchType: 'bounce' | 'pierce'   // 碰撞型 or 貫穿型
  launchHitSet: Set<string>         // 發射中已命中的敵人 ID
  collisionReactionCooldownUntil: number  // 下次可觸發碰撞反應的時間（Date.now() 為基準，0 = 可觸發）
  isTaunting: boolean                     // 是否正在嘲諷中（避免重複嘲諷）
  isDodgeInvincible: boolean              // 閃避無敵中
  tauntTargetId: string | null            // 被嘲諷後強制追打的目標 id（enemy 用）
  originalMoveSpeed: number               // push 減速前的原始速度（恢復用）
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
  readyLine: Phaser.GameObjects.Graphics
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
  private waveTransitionText: Phaser.GameObjects.Container | null = null
  private allWavesSpawned: boolean = false

  // 戰場單位
  private units: BattleUnit[] = []
  private nextUnitId: number = 0

  // 陷阱系統
  private trapSystem: TrapSystem | null = null

  // 部署面板
  private deployCards: DeployCard[] = []
  private deployPanelContainer: Phaser.GameObjects.Container | null = null

  // 瞄準模式（彈射部署）
  private aimMode: boolean = false
  private aimMonsterId: string | null = null
  private aimPreview: Phaser.GameObjects.Sprite | null = null
  private aimLine: Phaser.GameObjects.Graphics | null = null
  private aimStartPoint: { x: number; y: number } | null = null
  private aimPowerText: Phaser.GameObjects.Text | null = null
  private launchPadGraphics: Phaser.GameObjects.Graphics | null = null

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

  // 陷阱視覺元素
  private trapSprites: Map<string, Phaser.GameObjects.Container> = new Map()

  // 場景元素
  private roomGraphics: Phaser.GameObjects.Graphics | null = null
  private roomTileSprites: Phaser.GameObjects.GameObject[] = []
  private breachGraphics: Phaser.GameObjects.Graphics | null = null

  // 戰鬥疊加元素（原地開戰時只清除這些，不清除共享房間圖形）
  private battleOverlayElements: Phaser.GameObjects.GameObject[] = []
  private usingSharedRoom: boolean = false

  // 觸控 / 滑鼠事件（由 setupInputHandlers 管理）

  // 陷阱手動部署
  private pendingTraps: number = 0
  private trapPlaceMode: boolean = false
  private trapPlaceButton: Phaser.GameObjects.Container | null = null

  // 機關槍連射系統
  private burstQueue: Array<{ monsterInstance: MonsterInstance; monsterDef: MonsterDefinition; evolution: EvolutionDefinition | null }> = []
  private burstDirection: number = 0   // 連射方向角度 (radians)
  private burstPower: number = 0       // 連射力道 (0-1)
  private lastBurstTime: number = 0
  private isBursting: boolean = false
  private burstCountBadge: Phaser.GameObjects.Container | null = null

  // 數量選擇器
  private pickerMode: boolean = false
  private pickerMonsterId: string | null = null
  private pickerCount: number = 1
  private pickerMax: number = 1
  private pickerContainer: Phaser.GameObjects.Container | null = null
  private pickerStartX: number = 0
  private pickerStartY: number = 0
  private pickerPrevText: Phaser.GameObjects.Text | null = null
  private pickerCurrText: Phaser.GameObjects.Text | null = null
  private pickerNextText: Phaser.GameObjects.Text | null = null

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

    // 嘗試使用 ExplorePhase 保留的共享房間圖形
    const shared = this.scene.data.get('sharedRoomGraphics') as { roomGraphics: Phaser.GameObjects.Graphics; roomTileSprites: Phaser.GameObjects.GameObject[] } | null
    if (shared) {
      this.usingSharedRoom = true
      this.roomGraphics = shared.roomGraphics
      this.roomTileSprites = shared.roomTileSprites
      this.setupBattleOverlay()
    } else {
      this.usingSharedRoom = false
      this.drawBattleRoom()
    }
    this.createLaunchPad()
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

    // 2.5 處理連射佇列
    this.processBurstQueue(time)

    // 3. 發射著陸（含房間牆壁反彈）→ 碰撞檢測（順序重要：先限位再判定）
    this.checkLaunchLanding()
    this.checkLaunchCollisions()

    // 3.5 更新所有單位 AI + 戰鬥（著陸後同幀即開始 AI）
    this.updateUnits(time, delta)

    // 3.6 同步陰影和 HP 條位置
    this.syncUnitVisuals()

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
    this.aimMode = false
    this.aimMonsterId = null
    this.aimStartPoint = null
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

    // 陷阱手動部署
    this.pendingTraps = 0
    this.trapPlaceMode = false
    this.trapPlaceButton = null

    // 連射系統
    this.burstQueue = []
    this.burstDirection = 0
    this.burstPower = 0
    this.lastBurstTime = 0
    this.isBursting = false

    // 原地開戰
    this.battleOverlayElements = []
    this.usingSharedRoom = false
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

    // 地板（TileSprite 石板紋理）
    const floor = this.scene.add.tileSprite(ROOM_X, ROOM_Y, ROOM_WIDTH, ROOM_HEIGHT, TEXTURE_KEYS.FLOOR_TILE)
    floor.setOrigin(0, 0)
    floor.setTileScale(2, 2)
    this.roomTileSprites.push(floor)

    // 牆壁（TileSprite 磚牆紋理）
    const wallThickness = 6
    const wallTop = this.scene.add.tileSprite(ROOM_X, ROOM_Y, ROOM_WIDTH, wallThickness, TEXTURE_KEYS.BRICK_WALL)
    wallTop.setOrigin(0, 0)
    wallTop.setTileScale(2, 2)
    const wallBottom = this.scene.add.tileSprite(ROOM_X, ROOM_Y + ROOM_HEIGHT - wallThickness, ROOM_WIDTH, wallThickness, TEXTURE_KEYS.BRICK_WALL)
    wallBottom.setOrigin(0, 0)
    wallBottom.setTileScale(2, 2)
    const wallLeft = this.scene.add.tileSprite(ROOM_X, ROOM_Y, wallThickness, ROOM_HEIGHT, TEXTURE_KEYS.BRICK_WALL)
    wallLeft.setOrigin(0, 0)
    wallLeft.setTileScale(2, 2)
    const wallRight = this.scene.add.tileSprite(ROOM_X + ROOM_WIDTH - wallThickness, ROOM_Y, wallThickness, ROOM_HEIGHT, TEXTURE_KEYS.BRICK_WALL)
    wallRight.setOrigin(0, 0)
    wallRight.setTileScale(2, 2)
    this.roomTileSprites.push(wallTop, wallBottom, wallLeft, wallRight)

    // 四角暗影暈影（vignette）— 2 層漸層，營造地牢深度感（ProjectDK 風格）
    const cornerConfigs = [
      { x: ROOM_X, y: ROOM_Y },
      { x: ROOM_X + ROOM_WIDTH, y: ROOM_Y },
      { x: ROOM_X, y: ROOM_Y + ROOM_HEIGHT },
      { x: ROOM_X + ROOM_WIDTH, y: ROOM_Y + ROOM_HEIGHT },
    ]
    for (const corner of cornerConfigs) {
      // 外層大暗影
      const shadowOuter = this.scene.add.circle(corner.x, corner.y, 60, 0x000000, 0.2)
      shadowOuter.setBlendMode(Phaser.BlendModes.MULTIPLY)
      this.roomTileSprites.push(shadowOuter)
      // 內層深暗影
      const shadowInner = this.scene.add.circle(corner.x, corner.y, 30, 0x000000, 0.35)
      shadowInner.setBlendMode(Phaser.BlendModes.MULTIPLY)
      this.roomTileSprites.push(shadowInner)
    }

    // 中央環境光暈（藍色，ProjectDK 風格）
    const centerGlow = this.scene.add.circle(
      ROOM_X + ROOM_WIDTH / 2, ROOM_Y + ROOM_HEIGHT / 2,
      100, 0x3355aa, 0.08
    )
    this.roomTileSprites.push(centerGlow)
    this.scene.tweens.add({
      targets: centerGlow,
      alpha: 0.14,
      scaleX: 1.15,
      scaleY: 1.15,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // 牆壁內側高光線條（ProjectDK 發光邊線手法）
    const wallGlow = this.scene.add.graphics()
    wallGlow.lineStyle(1, 0x5588aa, 0.2)
    // 頂部內光線
    wallGlow.lineBetween(ROOM_X + 8, ROOM_Y + wallThickness + 1, ROOM_X + ROOM_WIDTH - 8, ROOM_Y + wallThickness + 1)
    // 左側內光線
    wallGlow.lineBetween(ROOM_X + wallThickness + 1, ROOM_Y + 8, ROOM_X + wallThickness + 1, ROOM_Y + ROOM_HEIGHT - 8)
    this.roomTileSprites.push(wallGlow)

    // 環境飄浮微塵粒子（增加數量、增大粒子）
    for (let d = 0; d < 10; d++) {
      const dustX = ROOM_X + 20 + Math.random() * (ROOM_WIDTH - 40)
      const dustY = ROOM_Y + 20 + Math.random() * (ROOM_HEIGHT - 40)
      const dust = this.scene.add.circle(dustX, dustY, 1.5 + Math.random(), 0xcccccc, 0.1 + Math.random() * 0.08)
      this.scene.tweens.add({
        targets: dust,
        x: dustX + (Math.random() - 0.5) * 30,
        y: dustY - 10 - Math.random() * 15,
        alpha: 0,
        duration: 4000 + Math.random() * 3000,
        delay: Math.random() * 3000,
        onComplete: () => {
          if (dust.active) {
            dust.setPosition(
              ROOM_X + 20 + Math.random() * (ROOM_WIDTH - 40),
              ROOM_Y + 20 + Math.random() * (ROOM_HEIGHT - 40),
            )
            dust.setAlpha(0.08 + Math.random() * 0.06)
            this.scene.tweens.add({
              targets: dust,
              x: dust.x + (Math.random() - 0.5) * 30,
              y: dust.y - 10 - Math.random() * 15,
              alpha: 0,
              duration: 4000 + Math.random() * 3000,
              repeat: -1,
            })
          }
        },
      })
      this.roomTileSprites.push(dust)
    }
  }

  /**
   * 原地開戰模式：在共享房間圖形上疊加戰鬥特有元素
   * 不重繪地板/牆壁，只加暈影、微塵、牆壁高光線
   */
  private setupBattleOverlay(): void {
    // 四角暗影暈影（vignette）
    const cornerConfigs = [
      { x: ROOM_X, y: ROOM_Y },
      { x: ROOM_X + ROOM_WIDTH, y: ROOM_Y },
      { x: ROOM_X, y: ROOM_Y + ROOM_HEIGHT },
      { x: ROOM_X + ROOM_WIDTH, y: ROOM_Y + ROOM_HEIGHT },
    ]
    for (const corner of cornerConfigs) {
      const shadowOuter = this.scene.add.circle(corner.x, corner.y, 60, 0x000000, 0.2)
      shadowOuter.setBlendMode(Phaser.BlendModes.MULTIPLY)
      this.battleOverlayElements.push(shadowOuter)
      const shadowInner = this.scene.add.circle(corner.x, corner.y, 30, 0x000000, 0.35)
      shadowInner.setBlendMode(Phaser.BlendModes.MULTIPLY)
      this.battleOverlayElements.push(shadowInner)
    }

    // 牆壁內側高光線條
    const wallGlow = this.scene.add.graphics()
    wallGlow.lineStyle(1, 0x5588aa, 0.2)
    wallGlow.lineBetween(ROOM_X + 8, ROOM_Y + 7, ROOM_X + ROOM_WIDTH - 8, ROOM_Y + 7)
    wallGlow.lineBetween(ROOM_X + 7, ROOM_Y + 8, ROOM_X + 7, ROOM_Y + ROOM_HEIGHT - 8)
    this.battleOverlayElements.push(wallGlow)

    // 環境飄浮微塵
    for (let d = 0; d < 10; d++) {
      const dustX = ROOM_X + 20 + Math.random() * (ROOM_WIDTH - 40)
      const dustY = ROOM_Y + 20 + Math.random() * (ROOM_HEIGHT - 40)
      const dust = this.scene.add.circle(dustX, dustY, 1.5 + Math.random(), 0xcccccc, 0.1 + Math.random() * 0.08)
      this.scene.tweens.add({
        targets: dust,
        x: dustX + (Math.random() - 0.5) * 30,
        y: dustY - 10 - Math.random() * 15,
        alpha: 0,
        duration: 4000 + Math.random() * 3000,
        delay: Math.random() * 3000,
        onComplete: () => {
          if (dust.active) {
            dust.setPosition(
              ROOM_X + 20 + Math.random() * (ROOM_WIDTH - 40),
              ROOM_Y + 20 + Math.random() * (ROOM_HEIGHT - 40),
            )
            dust.setAlpha(0.08 + Math.random() * 0.06)
            this.scene.tweens.add({
              targets: dust,
              x: dust.x + (Math.random() - 0.5) * 30,
              y: dust.y - 10 - Math.random() * 15,
              alpha: 0,
              duration: 4000 + Math.random() * 3000,
              repeat: -1,
            })
          }
        },
      })
      this.battleOverlayElements.push(dust)
    }
  }

  // ============ 破牆動畫 ============

  private playBreachAnimation(onComplete: () => void): void {
    const breach = getBreachPosition(this.breachDirection)
    const g = this.scene.add.graphics()
    this.breachGraphics = g

    // 破口閃光（先是亮白閃光，再是橘色破裂）
    const breachFlash = this.scene.add.circle(breach.x, breach.y, 40, 0xffffff, 0)
    this.scene.tweens.add({
      targets: breachFlash,
      alpha: { from: 0, to: 0.6 },
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 120,
      yoyo: true,
      onComplete: () => breachFlash.destroy(),
    })

    // 畫破口（閃爍效果 — 更大）
    g.fillStyle(0xcc8844, 1)
    g.fillCircle(breach.x, breach.y, 28)
    g.setAlpha(0)

    this.scene.tweens.add({
      targets: g,
      alpha: { from: 0, to: 1 },
      duration: 250,
      yoyo: true,
      repeat: 0,
      onComplete: () => {
        // 破口留下永久標記（更大）
        g.clear()
        g.fillStyle(0x443333, 1)
        g.fillCircle(breach.x, breach.y, 20)
        // 外環發光
        g.lineStyle(2, 0x886644, 0.3)
        g.strokeCircle(breach.x, breach.y, 24)

        // 裂痕紋理線條（更多更粗）
        g.lineStyle(1.5, 0x665544, 0.7)
        g.lineBetween(breach.x - 12, breach.y - 10, breach.x + 8, breach.y + 12)
        g.lineBetween(breach.x + 6, breach.y - 14, breach.x - 10, breach.y + 8)
        g.lineBetween(breach.x - 16, breach.y + 2, breach.x + 14, breach.y - 4)
        g.lineBetween(breach.x - 4, breach.y - 16, breach.x + 4, breach.y + 16)
        g.setAlpha(0.8)

        // 碎石粒子（更多、更大、帶重力模擬）
        for (let p = 0; p < 8; p++) {
          const angle = Math.random() * Math.PI * 2
          const dist = 20 + Math.random() * 35
          const chipSize = 2 + Math.random() * 2
          const colors = [0x887766, 0x665544, 0x998877, 0x554433]
          const chip = this.scene.add.circle(
            breach.x, breach.y,
            chipSize,
            colors[p % colors.length],
            0.9,
          )
          this.scene.tweens.add({
            targets: chip,
            x: breach.x + Math.cos(angle) * dist,
            y: breach.y + Math.sin(angle) * dist + 15, // 重力下墜
            alpha: 0,
            scaleX: 0.3,
            scaleY: 0.3,
            duration: 350 + Math.random() * 250,
            ease: 'Quad.easeOut',
            onComplete: () => chip.destroy(),
          })
        }
        // 相機震動（更強）
        this.scene.cameras.main.shake(250, 0.008)

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

    const cx = ROOM_X + ROOM_WIDTH / 2
    const cy = ROOM_Y + ROOM_HEIGHT / 2 - 40

    // 暗化帶（ProjectDK 波次公告橫幅風格）
    const band = this.scene.add.rectangle(
      ROOM_X + ROOM_WIDTH / 2, cy,
      ROOM_WIDTH, 60, 0x000000, 0.6
    )
    band.setAlpha(0)
    this.scene.tweens.add({
      targets: band,
      alpha: 1,
      duration: 200,
    })

    // 顯示提示文字（帶半透明背景 badge + 更大字）
    this.waveTransitionText = createTextBadge(
      this.scene,
      cx, cy,
      '下一波即將來臨...',
      { fontSize: '20px', color: '#ffcc44', bgAlpha: 0.7, paddingX: 18, paddingY: 8 }
    )

    // 文字閃爍 + 輕微縮放
    this.scene.tweens.add({
      targets: this.waveTransitionText,
      alpha: { from: 0.9, to: 0.5 },
      scaleX: { from: 1, to: 1.05 },
      scaleY: { from: 1, to: 1.05 },
      duration: 500,
      yoyo: true,
      repeat: -1,
    })

    // 倒數計時 3→2→1（更大數字 + 彈出效果）
    const totalSec = Math.ceil(WAVE_INTERVAL / 1000)
    for (let s = totalSec; s >= 1; s--) {
      const delay = (totalSec - s) * 1000
      this.scene.time.delayedCall(delay, () => {
        const numText = this.scene.add.text(cx, cy + 34, `${s}`, {
          fontSize: '32px', color: '#ffdd44', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 4,
        })
        numText.setOrigin(0.5)
        numText.setAlpha(0)
        this.scene.tweens.add({
          targets: numText,
          alpha: { from: 1, to: 0 },
          scaleX: { from: 1.5, to: 0.7 },
          scaleY: { from: 1.5, to: 0.7 },
          duration: 800,
          ease: 'Quad.easeIn',
          onComplete: () => numText.destroy(),
        })
      })
    }

    // 波次結束時清除暗化帶
    this.scene.time.delayedCall(WAVE_INTERVAL - 200, () => {
      if (band.active) {
        this.scene.tweens.add({
          targets: band,
          alpha: 0,
          duration: 200,
          onComplete: () => band.destroy(),
        })
      }
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
    const unit = this.createUnit(heroDef, 'enemy', breach.x, breach.y)
    this.units = [...this.units, unit]

    // 部署動畫（scale 0 → 2）
    unit.sprite.setScale(0)
    this.scene.tweens.add({
      targets: unit.sprite,
      scaleX: 2,
      scaleY: 2,
      duration: 500,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.addIdleBob(unit)
      },
    })

    eventBus.emit({ type: 'HERO_SPAWNED', heroId, lane: 0 })
  }

  // ============ 怪物部署 ============

  private launchMonster(monsterId: string, angle: number, power: number, evolutionOverride?: EvolutionDefinition | null): void {
    const monsterDef = DataRegistry.getMonsterById(monsterId)
    if (!monsterDef) return

    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
    if (aliveAllies.length >= this.getEffectiveAllyLimit()) return

    // 在發射台位置建立單位（連射時使用指定的進化資料）
    const unit = (evolutionOverride !== undefined)
      ? this.createMonsterUnitWithEvolution(monsterDef, LAUNCH_PAD_X, LAUNCH_PAD_Y, evolutionOverride)
      : this.createMonsterUnit(monsterDef, LAUNCH_PAD_X, LAUNCH_PAD_Y)

    // 套用水晶 buff
    if (this.crystalsAppliedCount < this.unusedCrystals) {
      unit.atk = unit.atk + 5
      unit.baseATK = unit.baseATK + 5
      this.crystalsAppliedCount += 1

      // 水晶 buff 視覺回饋 — 藍紫色閃光 + 粒子
      unit.sprite.setTintFill(0x8888ff)
      this.scene.time.delayedCall(120, () => {
        if (unit.sprite.active) unit.sprite.clearTint()
      })
      for (let cp = 0; cp < 4; cp++) {
        const cAngle = Math.random() * Math.PI * 2
        const cDist = 10 + Math.random() * 10
        const crystal = this.scene.add.circle(
          LAUNCH_PAD_X, LAUNCH_PAD_Y, 1.5, 0x8888ff, 0.9
        )
        this.scene.tweens.add({
          targets: crystal,
          x: LAUNCH_PAD_X + Math.cos(cAngle) * cDist,
          y: LAUNCH_PAD_Y + Math.sin(cAngle) * cDist,
          alpha: 0, duration: 250,
          ease: 'Quad.easeOut',
          onComplete: () => crystal.destroy(),
        })
      }
    }

    // 設定發射狀態
    unit.isLaunching = true
    unit.launchTime = Date.now()
    unit.launchHitSet = new Set()

    this.units = [...this.units, unit]

    // 設定物理參數
    const body = unit.sprite.body as Phaser.Physics.Arcade.Body
    body.setBounce(LAUNCH_BOUNCE)
    body.setCollideWorldBounds(false)  // 改用手動房間反彈

    // 貫穿型：暫時移出 allyGroup，避免 collider 影響軌跡
    if (unit.launchType === 'pierce') {
      this.allyGroup?.remove(unit.sprite)
    }

    // 發射動畫（scale 彈出）
    const targetScale = EVOLUTION_SCALES[unit.definitionId] ?? 2
    unit.sprite.setScale(targetScale * 0.5)
    this.scene.tweens.add({
      targets: unit.sprite,
      scaleX: targetScale,
      scaleY: targetScale,
      duration: 200,
      ease: 'Back.easeOut',
    })

    // 發射台爆發粒子 — 從發射點向發射方向擴散
    for (let lp = 0; lp < 5; lp++) {
      const spread = angle + (Math.random() - 0.5) * 1.0
      const lpDist = 8 + Math.random() * 14
      const lpColor = lp % 2 === 0 ? 0x88bbdd : 0xaaddff
      const lpParticle = this.scene.add.circle(
        LAUNCH_PAD_X, LAUNCH_PAD_Y, 1 + Math.random(), lpColor, 0.7
      )
      this.scene.tweens.add({
        targets: lpParticle,
        x: LAUNCH_PAD_X + Math.cos(spread) * lpDist,
        y: LAUNCH_PAD_Y + Math.sin(spread) * lpDist,
        alpha: 0,
        duration: 200 + Math.random() * 100,
        ease: 'Quad.easeOut',
        onComplete: () => lpParticle.destroy(),
      })
    }

    // 發射台短暫亮閃
    if (this.launchPadGraphics) {
      this.scene.tweens.add({
        targets: this.launchPadGraphics,
        alpha: 1,
        duration: 60,
        yoyo: true,
        ease: 'Quad.easeOut',
      })
    }

    // 設定初速
    const speed = LAUNCH_MIN_POWER + power * (LAUNCH_MAX_POWER - LAUNCH_MIN_POWER)
    body.setVelocity(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
    )

    // CD 由 pointerup（單發）或 processBurstQueue（連射最後一隻）設定
    // 不在此處更新 lastDeployTime

    eventBus.emit({ type: 'MONSTER_DEPLOYED', monsterId, slotIndex: -1 })
  }

  // ============ 連射處理 ============

  private processBurstQueue(time: number): void {
    if (!this.isBursting || this.burstQueue.length === 0) return

    // 檢查場上是否已滿
    const aliveCount = this.units.filter(u => u.alive && u.faction === 'ally').length
    if (aliveCount >= this.getEffectiveAllyLimit()) {
      this.burstQueue = []
      this.isBursting = false
      return
    }

    // 100ms 間隔
    if (time - this.lastBurstTime < 100) return

    const entry = this.burstQueue[0]
    this.burstQueue = this.burstQueue.slice(1)

    this.launchMonster(entry.monsterDef.id, this.burstDirection, this.burstPower, entry.evolution)
    this.lastBurstTime = time

    // 每發視覺回饋：camera shake
    this.scene.cameras.main.shake(80, 0.003)

    if (this.burstQueue.length === 0) {
      this.isBursting = false
      // CD 從最後一隻射出後才開始
      const card = this.deployCards.find(c => c.monsterId === entry.monsterDef.id)
      if (card) {
        card.lastDeployTime = time
      }
    }
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
  ): BattleUnit {
    const unitId = `unit_${this.nextUnitId}`
    this.nextUnitId += 1

    // 建立陰影
    const shadow = this.scene.add.image(x + 2, y + 3, TEXTURE_KEYS.SHADOW).setAlpha(0.3).setScale(2)

    // 建立像素精靈 (Arcade Physics)
    const texKey = UNIT_TEXTURE_MAP[heroDef.id] ?? TEXTURE_KEYS.ADVENTURER
    const sprite = this.scene.add.sprite(x, y, texKey)
    sprite.setScale(2)
    this.scene.physics.add.existing(sprite)

    const displayRadius = Math.max(sprite.displayWidth, sprite.displayHeight) / 2.5
    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setCircle(displayRadius)
    body.setOffset(sprite.displayWidth / 2 - displayRadius, sprite.displayHeight / 2 - displayRadius)
    body.setCollideWorldBounds(true)
    body.setBounce(0.1)

    this.enemyGroup?.add(sprite)

    // HP 條
    const hpBar = this.scene.add.graphics()
    this.drawHPBar(hpBar, x, y - sprite.displayHeight / 2 - 6, heroDef.stats.hp, heroDef.stats.hp)

    return {
      sprite,
      shadow,
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
      goldReward: heroDef.goldReward,
      xpReward: heroDef.xpReward,
      isChicken: false,
      evolution: null,
      isLaunching: false,
      launchTime: 0,
      launchType: 'bounce',
      launchHitSet: new Set(),
      collisionReactionCooldownUntil: 0,
      isTaunting: false,
      isDodgeInvincible: false,
      tauntTargetId: null,
      originalMoveSpeed: 0,
    }
  }

  private createMonsterUnit(
    monsterDef: MonsterDefinition,
    x: number,
    y: number,
  ): BattleUnit {
    const unitId = `unit_${this.nextUnitId}`
    this.nextUnitId += 1

    // Check evolution from GameStore
    const evo = this.resolveEvolution(monsterDef.id)

    // 建立陰影
    const shadow = this.scene.add.image(x + 2, y + 3, TEXTURE_KEYS.SHADOW).setAlpha(0.3).setScale(2)

    // 建立像素精靈 (Arcade Physics)
    const defId = evo?.id ?? monsterDef.id
    const texKey = UNIT_TEXTURE_MAP[defId] ?? UNIT_TEXTURE_MAP[monsterDef.id] ?? TEXTURE_KEYS.GOBLIN
    const sprite = this.scene.add.sprite(x, y, texKey)
    // 進化型尺寸差異化
    const unitScale = EVOLUTION_SCALES[defId] ?? 2
    sprite.setScale(unitScale)

    this.scene.physics.add.existing(sprite)

    const displayRadius = Math.max(sprite.displayWidth, sprite.displayHeight) / 2.5
    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setCircle(displayRadius)
    body.setOffset(sprite.displayWidth / 2 - displayRadius, sprite.displayHeight / 2 - displayRadius)
    body.setCollideWorldBounds(true)
    body.setBounce(0.1)

    this.allyGroup?.add(sprite)

    // Use evolved stats if available, fallback to base
    const hp = evo?.evolvedStats.hp ?? monsterDef.stats.hp
    const atk = evo?.evolvedStats.attack ?? monsterDef.stats.attack
    const attackInterval = (evo?.evolvedStats.attackInterval ?? monsterDef.stats.attackInterval) * this.roomBonuses.attackSpeedMultiplier
    const moveSpeed = evo?.evolvedStats.moveSpeed ?? monsterDef.stats.moveSpeed
    const attackRange = evo?.evolvedStats.attackRange ?? monsterDef.stats.attackRange
    const aiType = evo?.aiType ?? monsterDef.aiType

    const hpBar = this.scene.add.graphics()
    this.drawHPBar(hpBar, x, y - sprite.displayHeight / 2 - 6, hp, hp, evo)

    const launchType = evo?.evolvedStats.launchType ?? monsterDef.stats.launchType

    return {
      sprite,
      shadow,
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
      goldReward: 0,
      xpReward: 0,
      isChicken: false,
      evolution: evo,
      isLaunching: false,
      launchTime: 0,
      launchType,
      launchHitSet: new Set(),
      collisionReactionCooldownUntil: 0,
      isTaunting: false,
      isDodgeInvincible: false,
      tauntTargetId: null,
      originalMoveSpeed: 0,
    }
  }

  /**
   * 建立怪物單位，使用外部指定的進化資料（連射系統用）
   */
  private createMonsterUnitWithEvolution(
    monsterDef: MonsterDefinition,
    x: number,
    y: number,
    evo: EvolutionDefinition | null,
  ): BattleUnit {
    const unitId = `unit_${this.nextUnitId}`
    this.nextUnitId += 1

    const shadow = this.scene.add.image(x + 2, y + 3, TEXTURE_KEYS.SHADOW).setAlpha(0.3).setScale(2)

    const defId = evo?.id ?? monsterDef.id
    const texKey = UNIT_TEXTURE_MAP[defId] ?? UNIT_TEXTURE_MAP[monsterDef.id] ?? TEXTURE_KEYS.GOBLIN
    const sprite = this.scene.add.sprite(x, y, texKey)
    const unitScale = EVOLUTION_SCALES[defId] ?? 2
    sprite.setScale(unitScale)

    this.scene.physics.add.existing(sprite)

    const displayRadius = Math.max(sprite.displayWidth, sprite.displayHeight) / 2.5
    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setCircle(displayRadius)
    body.setOffset(sprite.displayWidth / 2 - displayRadius, sprite.displayHeight / 2 - displayRadius)
    body.setCollideWorldBounds(true)
    body.setBounce(0.1)

    this.allyGroup?.add(sprite)

    const hp = evo?.evolvedStats.hp ?? monsterDef.stats.hp
    const atk = evo?.evolvedStats.attack ?? monsterDef.stats.attack
    const attackInterval = (evo?.evolvedStats.attackInterval ?? monsterDef.stats.attackInterval) * this.roomBonuses.attackSpeedMultiplier
    const moveSpeed = evo?.evolvedStats.moveSpeed ?? monsterDef.stats.moveSpeed
    const attackRange = evo?.evolvedStats.attackRange ?? monsterDef.stats.attackRange
    const aiType = evo?.aiType ?? monsterDef.aiType

    const hpBar = this.scene.add.graphics()
    this.drawHPBar(hpBar, x, y - sprite.displayHeight / 2 - 6, hp, hp, evo)

    const launchType = evo?.evolvedStats.launchType ?? monsterDef.stats.launchType

    return {
      sprite,
      shadow,
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
      goldReward: 0,
      xpReward: 0,
      isChicken: false,
      evolution: evo,
      isLaunching: false,
      launchTime: 0,
      launchType,
      launchHitSet: new Set(),
      collisionReactionCooldownUntil: 0,
      isTaunting: false,
      isDodgeInvincible: false,
      tauntTargetId: null,
      originalMoveSpeed: 0,
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
    // 暫時診斷 log：每 2 秒輸出狀態分佈（確認修復後移除）
    if (Math.floor(time / 2000) !== Math.floor((time - delta) / 2000)) {
      const states = this.units.filter(u => u.alive)
        .map(u => {
          if (u.isLaunching) {
            const body = u.sprite.body as Phaser.Physics.Arcade.Body
            const spd = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2).toFixed(0)
            const elapsed = Date.now() - u.launchTime
            return `${u.id}(${u.faction[0]}):LAUNCH[v=${spd},t=${elapsed}ms]`
          }
          return `${u.id}(${u.faction[0]}):${u.ai.state}`
        })
      console.log('[BATTLE]', states.join(' | '))
    }

    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
    const aliveEnemies = this.units.filter(u => u.faction === 'enemy' && u.alive)

    for (const unit of this.units) {
      if (!unit.alive) continue
      if (unit.isLaunching) continue  // 發射中不受 AI 控制

      // 決定這個單位的敵方列表
      // 嘲諷：被嘲諷的敵人強制以 tauntTarget 排第一，讓 AI 優先選到它
      let enemies = unit.faction === 'ally'
        ? aliveEnemies.map(e => ({ x: e.sprite.x, y: e.sprite.y, hp: e.hp }))
        : aliveAllies.map(e => ({ x: e.sprite.x, y: e.sprite.y, hp: e.hp }))

      if (unit.faction === 'enemy' && unit.tauntTargetId !== null) {
        const tauntTarget = aliveAllies.find(a => a.id === unit.tauntTargetId)
        if (tauntTarget) {
          const tauntEntry = { x: tauntTarget.sprite.x, y: tauntTarget.sprite.y, hp: tauntTarget.hp }
          enemies = [tauntEntry, ...enemies.filter((_, i) => aliveAllies[i]?.id !== unit.tauntTargetId)]
        } else {
          unit.tauntTargetId = null
        }
      }

      // 攻擊範圍補償 body 半徑（物理碰撞將單位推開到 body 表面距離，
      // 多敵人同時碰撞會累積推力，需加上自身 body 半徑才能穩定進入攻擊）
      const unitBody = unit.sprite.body as Phaser.Physics.Arcade.Body
      const effectiveRange = unit.attackRange + unitBody.halfWidth

      // 更新 AI
      const aiResult: UpdateAIResult = updateAI(
        unit.ai,
        unit.aiType,
        unit.sprite.x,
        unit.sprite.y,
        unit.moveSpeed,
        effectiveRange,
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

      // 更新陰影位置
      if (unit.shadow) {
        unit.shadow.setPosition(unit.sprite.x + 2, unit.sprite.y + 2)
      }

      // 更新 HP 條位置（進化型顯示標記）
      this.drawHPBar(
        unit.hpBar,
        unit.sprite.x,
        unit.sprite.y - unit.sprite.displayHeight / 2 - 6,
        unit.hp,
        unit.maxHP,
        unit.evolution
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

    // 進化型攻擊特效
    this.addAttackVFX(attacker, target)

    // 受擊閃白效果
    this.flashWhite(target.sprite)

    // 傷害數字
    const isRanged = attacker.aiType === 'ranged_stationary'
    const dmgColor = isRanged ? '#88bbff' : '#ff4444'
    const dmgSize = damage >= 15 ? '16px' : '12px'
    const dmgText = this.scene.add.text(
      target.sprite.x, target.sprite.y - 15,
      `-${damage}`,
      { fontSize: dmgSize, color: dmgColor, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 3 }
    )
    dmgText.setOrigin(0.5)
    const ease = damage >= 15 ? 'Back.easeOut' : 'Quad.easeOut'
    this.scene.tweens.add({
      targets: dmgText,
      y: dmgText.y - 25,
      alpha: 0,
      duration: 700,
      ease,
      onComplete: () => dmgText.destroy(),
    })
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
    if (unit.isDodgeInvincible) return
    unit.hp = Math.max(0, unit.hp - damage)

    if (unit.hp <= 0) {
      this.killUnit(unit)
    }
  }

  private killUnit(unit: BattleUnit): void {
    unit.alive = false

    // 銷毀陰影
    if (unit.shadow) {
      unit.shadow.destroy()
      unit.shadow = null
    }

    // 死亡特效（進化型差異化）
    this.spawnDeathVFX(unit)

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

        // 跳過正在攻擊或發射中的單位
        if (a.ai.state === AIState.ATTACKING || b.ai.state === AIState.ATTACKING) continue
        if (a.isLaunching || b.isLaunching) continue

        const dx = b.sprite.x - a.sprite.x
        const dy = b.sprite.y - a.sprite.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        const minDist = 16 // 縮小以留更多攻擊空間（原 24）

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
        // 陷阱橘紅著色 200ms
        enemy.sprite.setTint(0xff8844)
        this.scene.time.delayedCall(200, () => {
          if (enemy.sprite.active) enemy.sprite.clearTint()
        })
        // 陷阱觸發尖刺粒子
        for (let tp = 0; tp < 4; tp++) {
          const spikeAngle = -Math.PI / 2 + (Math.random() - 0.5) * 1.2
          const spikeDist = 10 + Math.random() * 12
          const spike = this.scene.add.circle(
            enemy.sprite.x, enemy.sprite.y + 8,
            1, 0xcc6644, 0.9,
          )
          this.scene.tweens.add({
            targets: spike,
            x: enemy.sprite.x + Math.cos(spikeAngle) * spikeDist,
            y: enemy.sprite.y + 8 + Math.sin(spikeAngle) * spikeDist,
            alpha: 0,
            duration: 200,
            onComplete: () => spike.destroy(),
          })
        }
        this.destroyTrapVisual(result.trapId)
        eventBus.emit({ type: 'TRAP_TRIGGERED', trapId: result.trapId, damage: trapDamage })
      }
    }

    this.trapSystem.removeTriggered()
  }

  // ============ 視覺效果 ============

  /** 單位閒置微浮動動畫（使用 scale/angle，避免與物理引擎位置衝突） */
  private addIdleBob(unit: BattleUnit): void {
    if (!unit.sprite.active) return
    const baseScale = unit.sprite.scaleX
    const randomDelay = Math.random() * 600

    const eid = unit.evolution?.id
    if (eid === 'goblin_assassin') {
      // 刺客：快速角度搖擺
      this.scene.tweens.add({
        targets: unit.sprite,
        angle: { from: -5, to: 5 },
        duration: 350 + Math.random() * 150,
        delay: randomDelay,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    } else if (eid === 'berserker_ogre') {
      // 狂戰士：scale 脈衝 + 微角度
      this.scene.tweens.add({
        targets: unit.sprite,
        scaleX: baseScale * 1.08, scaleY: baseScale * 0.92,
        duration: 280 + Math.random() * 120,
        delay: randomDelay,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    } else if (eid === 'goblin_captain') {
      // 隊長：緩慢威嚴呼吸
      this.scene.tweens.add({
        targets: unit.sprite,
        scaleX: baseScale * 1.05, scaleY: baseScale * 1.05,
        duration: 1000 + Math.random() * 300,
        delay: randomDelay,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    } else if (eid === 'skeleton_mage') {
      // 法師：浮動 + 角度搖擺
      this.scene.tweens.add({
        targets: unit.sprite,
        angle: { from: -4, to: 4 },
        duration: 800 + Math.random() * 300,
        delay: randomDelay,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    } else {
      // 基礎型：呼吸脈衝 + 微角度
      this.scene.tweens.add({
        targets: unit.sprite,
        scaleX: baseScale * 1.06, scaleY: baseScale * 0.94,
        angle: { from: -1.5, to: 1.5 },
        duration: 700 + Math.random() * 400,
        delay: randomDelay,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
    }
  }

  /** 特殊單位底部光暈 */
  private addUnitGlow(unit: BattleUnit): void {
    if (!unit.sprite.active) return
    const glow = this.scene.add.circle(
      unit.sprite.x, unit.sprite.y + 4, 16, 0xffffaa, 0.15
    )
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.1, to: 0.25 },
      scaleX: { from: 0.8, to: 1.2 },
      scaleY: { from: 0.8, to: 1.2 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
    })
    // 光暈跟隨精靈（每幀更新）
    this.scene.events.on('update', () => {
      if (unit.alive && glow.active) {
        glow.setPosition(unit.sprite.x, unit.sprite.y + 4)
      } else if (glow.active) {
        glow.destroy()
      }
    })
  }

  /** 進化型持續視覺效果 */
  private addEvolutionEffect(unit: BattleUnit): void {
    if (!unit.sprite.active || !unit.evolution) return

    const eid = unit.evolution.id

    if (eid === 'goblin_captain') {
      // 隊長：金色光環脈衝
      this.addUnitGlowColored(unit, 0xffcc44)
    } else if (eid === 'goblin_assassin') {
      // 刺客：紫色殘影拖尾
      this.addAfterimageTrail(unit, 0xaa66cc)
    } else if (eid === 'skeleton_mage') {
      // 法師：藍色魔法粒子環繞
      this.addOrbitingParticles(unit, 0x88bbff)
    } else if (eid === 'berserker_ogre') {
      // 狂戰士：紅色怒氣脈衝
      this.addUnitGlowColored(unit, 0xff3333)
    } else if (eid === 'ironclad_ogre') {
      // 鐵甲：銀色護甲閃光
      this.addArmorShimmer(unit)
    }
  }

  /** 通用底部光暈（自訂顏色） */
  private addUnitGlowColored(unit: BattleUnit, color: number): void {
    if (!unit.sprite.active) return
    const glow = this.scene.add.circle(
      unit.sprite.x, unit.sprite.y + 4, 16, color, 0.15
    )
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.1, to: 0.25 },
      scaleX: { from: 0.8, to: 1.2 },
      scaleY: { from: 0.8, to: 1.2 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
    })
    this.scene.events.on('update', () => {
      if (unit.alive && glow.active) {
        glow.setPosition(unit.sprite.x, unit.sprite.y + 4)
      } else if (glow.active) {
        glow.destroy()
      }
    })
  }

  /** 刺客殘影拖尾效果 */
  private addAfterimageTrail(unit: BattleUnit, color: number): void {
    if (!unit.sprite.active) return
    let lastX = unit.sprite.x
    let lastY = unit.sprite.y

    this.scene.events.on('update', () => {
      if (!unit.alive || !unit.sprite.active) return
      const dx = unit.sprite.x - lastX
      const dy = unit.sprite.y - lastY
      const moved = Math.abs(dx) + Math.abs(dy)
      if (moved > 2) {
        const ghost = this.scene.add.sprite(lastX, lastY, unit.sprite.texture.key)
        ghost.setScale(unit.sprite.scaleX)
        ghost.setTint(color)
        ghost.setAlpha(0.35)
        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 250,
          onComplete: () => ghost.destroy(),
        })
      }
      lastX = unit.sprite.x
      lastY = unit.sprite.y
    })
  }

  /** 法師魔法粒子環繞效果 */
  private addOrbitingParticles(unit: BattleUnit, color: number): void {
    if (!unit.sprite.active) return
    const particles: Phaser.GameObjects.Arc[] = []
    const count = 3

    for (let i = 0; i < count; i++) {
      const p = this.scene.add.circle(0, 0, 2, color, 0.6)
      p.setData('angle', (i / count) * Math.PI * 2)
      particles.push(p)
    }

    this.scene.events.on('update', () => {
      if (!unit.alive || !unit.sprite.active) {
        for (const p of particles) {
          if (p.active) p.destroy()
        }
        return
      }
      for (const p of particles) {
        if (!p.active) continue
        const a = (p.getData('angle') as number) + 0.03
        p.setData('angle', a)
        const radius = 14
        p.setPosition(
          unit.sprite.x + Math.cos(a) * radius,
          unit.sprite.y + Math.sin(a) * radius * 0.5
        )
        p.setAlpha(0.3 + Math.sin(a * 2) * 0.3)
      }
    })
  }

  /** 鐵甲護甲閃光效果 */
  private addArmorShimmer(unit: BattleUnit): void {
    if (!unit.sprite.active) return
    this.scene.time.addEvent({
      delay: 2000 + Math.random() * 1000,
      loop: true,
      callback: () => {
        if (!unit.alive || !unit.sprite.active) return
        // 短暫白閃
        unit.sprite.setTint(0xddddff)
        this.scene.time.delayedCall(100, () => {
          if (unit.sprite.active) {
            unit.sprite.clearTint()
          }
        })
      },
    })
  }

  /** 進化型攻擊特效 */
  private addAttackVFX(attacker: BattleUnit, target: BattleUnit): void {
    if (!attacker.sprite.active) return

    // 基礎近戰單位：微弱揮擊弧線
    if (!attacker.evolution && attacker.aiType !== 'ranged_stationary') {
      const mx = (attacker.sprite.x + target.sprite.x) / 2
      const my = (attacker.sprite.y + target.sprite.y) / 2
      const hitAngle = Math.atan2(target.sprite.y - attacker.sprite.y, target.sprite.x - attacker.sprite.x)
      const arcLen = 10
      const arc = this.scene.add.graphics()
      const arcColor = attacker.faction === 'ally' ? 0x88bbcc : 0xddbb88
      arc.lineStyle(2, arcColor, 0.6)
      arc.beginPath()
      arc.moveTo(mx + Math.cos(hitAngle + 0.8) * arcLen, my + Math.sin(hitAngle + 0.8) * arcLen)
      arc.lineTo(mx, my)
      arc.lineTo(mx + Math.cos(hitAngle - 0.8) * arcLen, my + Math.sin(hitAngle - 0.8) * arcLen)
      arc.strokePath()
      this.scene.tweens.add({
        targets: arc,
        alpha: 0,
        duration: 180,
        ease: 'Quad.easeOut',
        onComplete: () => arc.destroy(),
      })
      return
    }

    if (!attacker.evolution) return

    const eid = attacker.evolution.id

    if (eid === 'goblin_assassin') {
      // 刺客：多重斬擊（2-3 條紫白色線）
      const cx = (attacker.sprite.x + target.sprite.x) / 2
      const cy = (attacker.sprite.y + target.sprite.y) / 2
      for (let s = 0; s < 2; s++) {
        const slash = this.scene.add.graphics()
        const offsetAngle = (Math.random() - 0.5) * 1.2
        const baseAngle = Math.atan2(target.sprite.y - attacker.sprite.y, target.sprite.x - attacker.sprite.x) + offsetAngle
        const len = 16 + Math.random() * 8
        const sx = cx + Math.cos(baseAngle + Math.PI) * len
        const sy = cy + Math.sin(baseAngle + Math.PI) * len
        const ex = cx + Math.cos(baseAngle) * len
        const ey = cy + Math.sin(baseAngle) * len
        const color = s === 0 ? 0xffffff : 0xcc88ee
        slash.lineStyle(4, color, 0.9)
        slash.beginPath()
        slash.moveTo(sx, sy)
        slash.lineTo(ex, ey)
        slash.strokePath()
        this.scene.tweens.add({
          targets: slash,
          alpha: 0,
          duration: 220,
          delay: s * 40,
          ease: 'Quad.easeOut',
          onComplete: () => slash.destroy(),
        })
      }
    } else if (eid === 'skeleton_mage') {
      // 法師：藍色魔法球投射
      const orb = this.scene.add.circle(attacker.sprite.x, attacker.sprite.y, 4, 0x88bbff, 0.8)
      this.scene.tweens.add({
        targets: orb,
        x: target.sprite.x,
        y: target.sprite.y,
        duration: 200,
        onComplete: () => {
          // 到達時爆發藍色粒子
          for (let i = 0; i < 3; i++) {
            const p = this.scene.add.circle(
              target.sprite.x + (Math.random() - 0.5) * 16,
              target.sprite.y + (Math.random() - 0.5) * 16,
              2, 0x88bbff, 0.6
            )
            this.scene.tweens.add({
              targets: p,
              alpha: 0,
              y: p.y - 8,
              duration: 300,
              onComplete: () => p.destroy(),
            })
          }
          orb.destroy()
        },
      })
    } else if (eid === 'goblin_captain') {
      // 隊長：金色指揮揮砍 + 旗幟光芒
      const slash = this.scene.add.graphics()
      const sAngle = Math.atan2(target.sprite.y - attacker.sprite.y, target.sprite.x - attacker.sprite.x)
      const cx = (attacker.sprite.x + target.sprite.x) / 2
      const cy = (attacker.sprite.y + target.sprite.y) / 2
      slash.lineStyle(3, 0xffcc44, 0.8)
      const sLen = 14
      slash.beginPath()
      slash.moveTo(cx + Math.cos(sAngle + 0.6) * sLen, cy + Math.sin(sAngle + 0.6) * sLen)
      slash.lineTo(cx, cy)
      slash.lineTo(cx + Math.cos(sAngle - 0.6) * sLen, cy + Math.sin(sAngle - 0.6) * sLen)
      slash.strokePath()
      this.scene.tweens.add({
        targets: slash,
        alpha: 0,
        duration: 200,
        ease: 'Quad.easeOut',
        onComplete: () => slash.destroy(),
      })
    } else if (eid === 'skeleton_archer') {
      // 弓箭手：翠綠箭矢拖尾（強化版投射物）
      const arrow = this.scene.add.circle(attacker.sprite.x, attacker.sprite.y, 3, 0x66ccaa, 0.9)
      this.scene.tweens.add({
        targets: arrow,
        x: target.sprite.x,
        y: target.sprite.y,
        duration: 150,
        onComplete: () => {
          const spark = this.scene.add.circle(target.sprite.x, target.sprite.y, 5, 0x66ccaa, 0.5)
          this.scene.tweens.add({
            targets: spark,
            scaleX: 2, scaleY: 2, alpha: 0,
            duration: 200,
            onComplete: () => spark.destroy(),
          })
          arrow.destroy()
        },
      })
    } else if (eid === 'ironclad_ogre') {
      // 鐵甲：重擊震波（白色環）
      const ring = this.scene.add.circle(target.sprite.x, target.sprite.y, 5, 0xffffff, 0)
      ring.setStrokeStyle(2, 0xccccff, 0.6)
      this.scene.tweens.add({
        targets: ring,
        scaleX: 2.5,
        scaleY: 2.5,
        alpha: 0,
        duration: 300,
        onComplete: () => ring.destroy(),
      })
    } else if (eid === 'berserker_ogre') {
      // 狂戰士：紅色衝擊波 + 爆裂粒子
      const wave = this.scene.add.circle(target.sprite.x, target.sprite.y, 8, 0xff3333, 0.6)
      this.scene.tweens.add({
        targets: wave,
        scaleX: 2.5, scaleY: 2.5,
        alpha: 0,
        duration: 350,
        ease: 'Quad.easeOut',
        onComplete: () => wave.destroy(),
      })
      // 紅色爆裂粒子
      for (let i = 0; i < 5; i++) {
        const angle = Math.random() * Math.PI * 2
        const dist = 20 + Math.random() * 30
        const p = this.scene.add.circle(target.sprite.x, target.sprite.y, 2, 0xff4444, 0.8)
        this.scene.tweens.add({
          targets: p,
          x: target.sprite.x + Math.cos(angle) * dist,
          y: target.sprite.y + Math.sin(angle) * dist,
          alpha: 0,
          scale: 0.3,
          duration: 300 + Math.random() * 150,
          ease: 'Quad.easeOut',
          onComplete: () => p.destroy(),
        })
      }
      // 殘血時攻擊者紅色脈衝
      const hpPct = attacker.hp / attacker.maxHP
      if (hpPct < 0.5) {
        attacker.sprite.setTint(0xff4444)
        this.scene.time.delayedCall(150, () => {
          if (attacker.sprite.active) attacker.sprite.clearTint()
        })
      }
    }
  }

  /** 進化型死亡特效 */
  private spawnDeathVFX(unit: BattleUnit): void {
    if (!unit.sprite.active) return

    const x = unit.sprite.x
    const y = unit.sprite.y

    // 決定粒子顏色與數量
    let color: number
    let count: number
    let hasFlash = false

    if (unit.evolution) {
      hasFlash = true
      const eid = unit.evolution.id
      if (eid === 'skeleton_mage') {
        color = 0x88bbff; count = 7
      } else if (eid === 'ironclad_ogre') {
        color = 0xaaaacc; count = 6
      } else if (eid === 'berserker_ogre') {
        color = 0xff4444; count = 7
      } else if (eid === 'goblin_assassin') {
        color = 0xaa66cc; count = 6
      } else if (eid === 'goblin_captain') {
        color = 0xcc3333; count = 5
      } else if (eid === 'skeleton_archer') {
        color = 0x66ccaa; count = 5
      } else {
        color = 0xffffff; count = 5
      }
    } else if (unit.faction === 'ally') {
      // 我方基礎單位：冷灰藍色碎片
      color = 0x6a9aaa; count = 4
    } else {
      // 敵方基礎單位：暗金碎片
      color = 0xd4b888; count = 4
    }

    // 混合大小粒子爆散（大+小交錯）
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6
      const speed = 25 + Math.random() * 50
      const isLarge = i % 2 === 0
      const radius = isLarge ? 3 + Math.random() * 2 : 1.5 + Math.random() * 1
      const dur = isLarge ? 400 + Math.random() * 150 : 250 + Math.random() * 100
      const p = this.scene.add.circle(x, y, radius, color, 0.85)
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed - (isLarge ? 8 : 0),
        alpha: 0,
        scaleX: isLarge ? 0.4 : 0.2,
        scaleY: isLarge ? 0.4 : 0.2,
        duration: dur,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      })
    }

    // 殘影淡出（半透明剪影停留片刻）
    const ghost = this.scene.add.circle(x, y, 8, color, 0.25)
    this.scene.tweens.add({
      targets: ghost,
      scaleX: 1.8,
      scaleY: 0.4,
      alpha: 0,
      duration: 500,
      ease: 'Quad.easeOut',
      onComplete: () => ghost.destroy(),
    })

    // 進化型額外爆發衝擊波
    if (hasFlash) {
      const ring = this.scene.add.circle(x, y, 6, color, 0)
      ring.setStrokeStyle(2, color, 0.7)
      this.scene.tweens.add({
        targets: ring,
        scaleX: 3.5,
        scaleY: 3.5,
        alpha: 0,
        duration: 350,
        ease: 'Quad.easeOut',
        onComplete: () => ring.destroy(),
      })
    }
  }

  private spawnLandingVFX(x: number, y: number): void {
    // 塵土環擴散
    const ring = this.scene.add.circle(x, y + 2, 4, 0x888888, 0)
    ring.setStrokeStyle(1.5, 0x888899, 0.6)
    this.scene.tweens.add({
      targets: ring,
      scaleX: 3,
      scaleY: 1.5,
      alpha: 0,
      duration: 300,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    })

    // 3 顆塵土粒子向外低飛
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI + Math.random() * 0.4 + Math.PI
      const dist = 10 + Math.random() * 8
      const p = this.scene.add.circle(x, y + 2, 1.5, 0x888899, 0.6)
      this.scene.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * dist,
        y: y + 2 + Math.sin(angle) * 3,
        alpha: 0,
        duration: 250,
        ease: 'Quad.easeOut',
        onComplete: () => p.destroy(),
      })
    }
  }

  private drawHPBar(
    graphics: Phaser.GameObjects.Graphics,
    x: number,
    y: number,
    currentHP: number,
    maxHP: number,
    evolution?: EvolutionDefinition | null
  ): void {
    drawEnhancedHPBar(graphics, x, y, currentHP, maxHP)

    // 低 HP 紅色脈動外框（<= 30%）
    const hpPct = maxHP > 0 ? currentHP / maxHP : 0
    if (hpPct <= 0.3 && hpPct > 0) {
      const pulse = 0.3 + Math.abs(Math.sin(Date.now() * 0.006)) * 0.5
      graphics.lineStyle(1, 0xff4444, pulse)
      graphics.strokeRect(x - 17 - 1, y - 1, 36, 8)
    }
    // 進化標記
    if (evolution) {
      const markerX = x + 17
      const markerY = y + 1
      const color = EVOLUTION_TINTS[evolution.id] ?? 0xffffff
      if (evolution.path.route === 'A') {
        // A 路線：菱形 ◆（5-6px，帶暗色外框）
        graphics.lineStyle(1, 0x1a1a22, 1)
        graphics.beginPath()
        graphics.moveTo(markerX, markerY - 5)
        graphics.lineTo(markerX + 3, markerY)
        graphics.lineTo(markerX, markerY + 5)
        graphics.lineTo(markerX - 3, markerY)
        graphics.closePath()
        graphics.strokePath()
        graphics.fillStyle(color, 0.9)
        graphics.fillPath()
      } else {
        // B 路線：十字（5-6px，帶暗色外框）
        graphics.lineStyle(1, 0x1a1a22, 1)
        graphics.strokeRect(markerX - 3, markerY - 1, 6, 2)
        graphics.strokeRect(markerX - 1, markerY - 3, 2, 6)
        graphics.fillStyle(color, 0.9)
        graphics.fillRect(markerX - 3, markerY - 1, 6, 2)
        graphics.fillRect(markerX - 1, markerY - 3, 2, 6)
      }
    }
  }

  private flashWhite(sprite: Phaser.GameObjects.Sprite): void {
    flashUnit(this.scene, sprite)
    spawnHitParticles(this.scene, sprite.x, sprite.y)
  }

  private createTrapVisual(trapId: string, x: number, y: number, radius: number): void {
    const container = this.scene.add.container(x, y)
    container.setDepth(5)

    // 觸發範圍圈（半透明紅色，增強可見度）
    const rangeCircle = this.scene.add.circle(0, 0, radius, 0xff4444, 0.2)
    rangeCircle.setStrokeStyle(1.5, 0xff6644, 0.5)
    container.add(rangeCircle)

    // 使用像素圖示取代手繪 cross
    const icon = this.scene.add.sprite(0, 0, TEXTURE_KEYS.ICON_TRAP)
    icon.setScale(2)
    container.add(icon)

    // 脈衝動畫
    this.scene.tweens.add({
      targets: rangeCircle,
      alpha: { from: 0.2, to: 0.35 },
      duration: 800,
      yoyo: true,
      repeat: -1,
    })

    this.trapSprites.set(trapId, container)
  }

  private destroyTrapVisual(trapId: string): void {
    const container = this.trapSprites.get(trapId)
    if (!container) return

    // 爆炸閃光效果
    const flash = this.scene.add.circle(container.x, container.y, 30, 0xff8844, 0.7)
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 300,
      onComplete: () => flash.destroy(),
    })

    this.scene.tweens.killTweensOf(container.list[0]) // kill pulse tween
    container.destroy(true)
    this.trapSprites.delete(trapId)
  }

  private createProjectile(fromX: number, fromY: number, toX: number, toY: number): void {
    createProjectileFX(this.scene, fromX, fromY, toX, toY)
  }

  // ============ 部署面板 ============

  private createDeployPanel(): void {
    const panelY = ROOM_Y + ROOM_HEIGHT + 20
    const panelWidth = ROOM_WIDTH
    const panelHeight = 80

    const container = this.scene.add.container(ROOM_X, panelY)
    this.deployPanelContainer = container

    // 面板背景（使用 drawPanel）
    const panelBg = this.scene.add.graphics()
    drawPanel(panelBg, 0, 0, panelWidth, panelHeight)
    container.add(panelBg)

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
    // 卡片背景（使用 drawPanel）
    const cardBgGfx = this.scene.add.graphics()
    drawPanel(cardBgGfx, x, y, width, height)
    container.add(cardBgGfx)

    // 透明互動區域
    const cardBg = this.scene.add.rectangle(
      x + width / 2, y + height / 2,
      width, height,
      0x000000, 0
    )
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

    // 就緒指示線（2px，卡片底部，UI_ACCENT 色）
    const readyLine = this.scene.add.graphics()
    readyLine.setData('cardX', x)
    readyLine.setData('cardY', y)
    readyLine.setData('cardW', width)
    readyLine.setData('cardH', height)
    container.add(readyLine)

    // 怪物圖示（左側，放大）
    const evo = this.resolveEvolution(monsterDef.id)
    const cardDefId = evo?.id ?? monsterDef.id
    const cardTexKey = UNIT_TEXTURE_MAP[cardDefId] ?? UNIT_TEXTURE_MAP[monsterDef.id] ?? TEXTURE_KEYS.GOBLIN
    const cardIcon = this.scene.add.sprite(x + 18, y + height / 2 - 4, cardTexKey)
    cardIcon.setScale(2.0)
    container.add(cardIcon)
    // 圖示底部光暈
    const iconGlow = this.scene.add.circle(x + 18, y + height / 2 - 4, 14, UI_ACCENT, 0.1)
    container.add(iconGlow)
    container.sendToBack(iconGlow)

    // 進化型：彩色邊框 + 路線標記
    if (evo) {
      const evoColor = EVOLUTION_TINTS[cardDefId] ?? 0xffffff
      const evoBorder = this.scene.add.graphics()
      evoBorder.lineStyle(2, evoColor, 0.8)
      evoBorder.strokeRoundedRect(x + 1, y + 1, width - 2, height - 2, 4)
      container.add(evoBorder)
      // 路線標記（右上角）
      const routeLabel = this.scene.add.text(
        x + width - 6, y + 4,
        evo.path.route,
        { fontSize: '9px', color: `#${evoColor.toString(16).padStart(6, '0')}`, fontStyle: 'bold' }
      )
      routeLabel.setOrigin(0.5)
      container.add(routeLabel)
    }

    // 名稱文字（右偏以容納圖示，帶描邊 — ProjectDK 風格）
    const displayName = evo ? evo.path.name : monsterDef.name
    const nameText = this.scene.add.text(
      x + width / 2 + 10, y + height / 2,
      displayName,
      {
        fontSize: '13px',
        color: `#${UI_TEXT.toString(16)}`,
        fontStyle: 'bold',
        align: 'center',
        stroke: '#000000',
        strokeThickness: 2,
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
      readyLine,
    }

    cardBg.on('pointerup', () => {
      this.onDeployCardClicked(card)
    })

    this.deployCards = [...this.deployCards, card]
  }

  private onDeployCardClicked(card: DeployCard): void {
    if (this.isBursting) return

    const now = this.scene.time.now
    if (now - card.lastDeployTime < card.cooldownMs) return

    // 若在瞄準模式，退出
    if (this.aimMode) {
      this.exitAimMode()
      return
    }

    // Toggle：點同一張卡片關閉 picker
    if (this.pickerMode && this.pickerMonsterId === card.monsterId) {
      this.hidePicker()
      return
    }

    // 計算卡片世界座標 X
    const containerX = this.deployPanelContainer?.x ?? 0
    const cardWorldX = containerX + card.bg.x

    this.showPicker(card.monsterId, cardWorldX)
  }

  private updateDeployPanel(time: number): void {
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive)
    const isFull = aliveAllies.length >= this.getEffectiveAllyLimit()

    for (const card of this.deployCards) {
      const cdRemaining = card.cooldownMs - (time - card.lastDeployTime)
      const isOnCD = cdRemaining > 0
      const isReady = !isOnCD && !isFull

      card.cdOverlay.setVisible(isOnCD || isFull)

      if (isFull) {
        card.bg.setAlpha(0.5)
      } else {
        card.bg.setAlpha(isOnCD ? 0.7 : 1)
      }

      // 就緒指示線
      card.readyLine.clear()
      if (isReady) {
        const cx = card.readyLine.getData('cardX') as number
        const cy = card.readyLine.getData('cardY') as number
        const cw = card.readyLine.getData('cardW') as number
        const ch = card.readyLine.getData('cardH') as number
        card.readyLine.lineStyle(2, UI_ACCENT, 1)
        card.readyLine.lineBetween(cx + 2, cy + ch, cx + cw - 2, cy + ch)
      }
    }
  }

  // ============ 發射台 ============

  private createLaunchPad(): void {
    const g = this.scene.add.graphics()
    this.launchPadGraphics = g

    // 外圈光暈底（大範圍柔光）
    const padGlow = this.scene.add.circle(LAUNCH_PAD_X, LAUNCH_PAD_Y, LAUNCH_PAD_RADIUS + 12, 0x5588aa, 0.08)
    this.roomTileSprites.push(padGlow)
    this.scene.tweens.add({
      targets: padGlow,
      alpha: 0.15,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // 最外圈（虛線感覺 — 用 4 段弧線）
    g.lineStyle(1.5, 0x5588aa, 0.4)
    for (let arc = 0; arc < 4; arc++) {
      const startAngle = arc * Math.PI / 2 + 0.15
      const endAngle = startAngle + Math.PI / 2 - 0.3
      g.beginPath()
      g.arc(LAUNCH_PAD_X, LAUNCH_PAD_Y, LAUNCH_PAD_RADIUS + 4, startAngle, endAngle)
      g.strokePath()
    }

    // 外圈（實線）
    g.lineStyle(2, 0x88bbdd, 0.7)
    g.strokeCircle(LAUNCH_PAD_X, LAUNCH_PAD_Y, LAUNCH_PAD_RADIUS)

    // 內填充（漸層模擬：外暗內亮）
    g.fillStyle(0x223344, 0.5)
    g.fillCircle(LAUNCH_PAD_X, LAUNCH_PAD_Y, LAUNCH_PAD_RADIUS - 2)
    g.fillStyle(0x334466, 0.3)
    g.fillCircle(LAUNCH_PAD_X, LAUNCH_PAD_Y, LAUNCH_PAD_RADIUS - 6)

    // 內圈
    g.lineStyle(1, 0x88bbdd, 0.4)
    g.strokeCircle(LAUNCH_PAD_X, LAUNCH_PAD_Y, LAUNCH_PAD_RADIUS - 8)

    // 十字準心（ProjectDK 風格符文標記）
    g.lineStyle(1.5, 0x88bbdd, 0.5)
    g.lineBetween(LAUNCH_PAD_X, LAUNCH_PAD_Y - 10, LAUNCH_PAD_X, LAUNCH_PAD_Y - 4)
    g.lineBetween(LAUNCH_PAD_X, LAUNCH_PAD_Y + 4, LAUNCH_PAD_X, LAUNCH_PAD_Y + 10)
    g.lineBetween(LAUNCH_PAD_X - 10, LAUNCH_PAD_Y, LAUNCH_PAD_X - 4, LAUNCH_PAD_Y)
    g.lineBetween(LAUNCH_PAD_X + 4, LAUNCH_PAD_Y, LAUNCH_PAD_X + 10, LAUNCH_PAD_Y)

    // 向上箭頭指示（更大）
    g.lineStyle(2.5, 0x88ccdd, 0.7)
    g.lineBetween(LAUNCH_PAD_X, LAUNCH_PAD_Y - 14, LAUNCH_PAD_X - 7, LAUNCH_PAD_Y - 5)
    g.lineBetween(LAUNCH_PAD_X, LAUNCH_PAD_Y - 14, LAUNCH_PAD_X + 7, LAUNCH_PAD_Y - 5)

    // 脈衝動畫
    this.scene.tweens.add({
      targets: g,
      alpha: { from: 0.7, to: 1 },
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })
  }

  private showPicker(monsterId: string, cardWorldX: number): void {
    this.hidePicker(true)

    const runState = gameStore.getState().run
    const instanceCount = runState.monsters.filter(m => m.monsterId === monsterId).length
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive).length
    this.pickerMax = Math.min(instanceCount, Math.max(0, this.getEffectiveAllyLimit() - aliveAllies))

    if (this.pickerMax <= 0) return

    // pickerMax = 1：跳過滾輪直接瞄準
    if (this.pickerMax === 1) {
      this.pickerCount = 1
      this.enterAimMode(monsterId)
      return
    }

    this.pickerMode = true
    this.pickerMonsterId = monsterId
    this.pickerCount = this.pickerMax  // 預設全選

    // 計算位置（卡片上方，防超出螢幕）
    const panelY = ROOM_Y + ROOM_HEIGHT + 20
    const pickerY = panelY - 52
    const pickerWidth = 120
    const clampedX = Phaser.Math.Clamp(
      cardWorldX,
      ROOM_X + pickerWidth / 2,
      ROOM_X + ROOM_WIDTH - pickerWidth / 2
    )

    this.pickerContainer = this.scene.add.container(clampedX, pickerY)
    this.pickerContainer.setDepth(20)
    this.pickerContainer.setAlpha(0)
    this.pickerContainer.setScale(0.9)

    this.buildPickerUI()

    // 進場動畫
    this.scene.tweens.add({
      targets: this.pickerContainer,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 150,
      ease: 'Back.easeOut',
    })

    // 暗化其他卡片
    for (const c of this.deployCards) {
      if (c.monsterId !== monsterId) {
        c.cdOverlay.setVisible(true)
        c.cdOverlay.setAlpha(0.35)
      }
    }
  }

  private hidePicker(immediate = false): void {
    if (!this.pickerMode && !this.pickerContainer) return

    this.pickerMode = false
    this.pickerMonsterId = null
    this.pickerPrevText = null
    this.pickerCurrText = null
    this.pickerNextText = null

    // 還原所有卡片暗化（依照 CD 狀態重設）
    const now = this.scene.time.now
    for (const c of this.deployCards) {
      const onCD = now - c.lastDeployTime < c.cooldownMs
      c.cdOverlay.setAlpha(0.6)
      c.cdOverlay.setVisible(onCD)
    }

    if (this.pickerContainer) {
      if (immediate) {
        this.scene.tweens.killTweensOf(this.pickerContainer)
        this.pickerContainer.destroy(true)
        this.pickerContainer = null
      } else {
        this.scene.tweens.killTweensOf(this.pickerContainer)
        const container = this.pickerContainer
        this.pickerContainer = null
        this.scene.tweens.add({
          targets: container,
          alpha: 0,
          duration: 100,
          onComplete: () => container.destroy(true),
        })
      }
    }
  }

  // ============ 數量選擇器 ============

  private buildPickerUI(): void {
    if (!this.pickerContainer) return

    const w = 120
    const h = 44

    // 背景
    const bg = this.scene.add.graphics()
    bg.fillStyle(0x1a1a2e, 0.92)
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8)
    bg.lineStyle(1, UI_ACCENT, 0.8)
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8)
    this.pickerContainer.add(bg)

    // 左側數字（前一個）
    const prevText = this.scene.add.text(-38, 0, '', {
      fontSize: '14px',
      color: '#888888',
      fontStyle: 'bold',
    })
    prevText.setOrigin(0.5)
    this.pickerContainer.add(prevText)
    this.pickerPrevText = prevText

    // 中央數字（當前）
    const currText = this.scene.add.text(0, 0, `${this.pickerCount}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    })
    currText.setOrigin(0.5)
    this.pickerContainer.add(currText)
    this.pickerCurrText = currText

    // 右側數字（下一個）
    const nextText = this.scene.add.text(38, 0, '', {
      fontSize: '14px',
      color: '#888888',
      fontStyle: 'bold',
    })
    nextText.setOrigin(0.5)
    this.pickerContainer.add(nextText)
    this.pickerNextText = nextText

    // 上方提示箭頭（↑ 向上拖曳瞄準）
    const hintText = this.scene.add.text(0, -h / 2 - 12, '↑ 拖曳瞄準', {
      fontSize: '10px',
      color: '#aaaaaa',
    })
    hintText.setOrigin(0.5)
    this.pickerContainer.add(hintText)

    this.updatePickerDisplay()
  }

  private updatePickerDisplay(): void {
    if (!this.pickerCurrText) return

    const prev = this.pickerCount - 1
    const next = this.pickerCount + 1

    if (this.pickerPrevText) {
      this.pickerPrevText.setText(prev >= 1 ? `${prev}` : '')
    }
    this.pickerCurrText.setText(`${this.pickerCount}`)
    if (this.pickerNextText) {
      this.pickerNextText.setText(next <= this.pickerMax ? `${next}` : '')
    }

    // 數字切換彈性動畫
    this.scene.tweens.add({
      targets: this.pickerCurrText,
      scaleX: { from: 1.25, to: 1.0 },
      scaleY: { from: 1.25, to: 1.0 },
      duration: 100,
      ease: 'Back.easeOut',
    })
  }

  // ============ 瞄準模式 ============

  private enterAimMode(monsterId: string): void {
    // 連射中不允許切換瞄準
    if (this.isBursting) return

    this.exitAimMode()

    if (this.trapPlaceMode) {
      this.exitTrapPlaceMode()
    }

    this.aimMode = true
    this.aimMonsterId = monsterId

    const monsterDef = DataRegistry.getMonsterById(monsterId)
    if (!monsterDef) return

    const evo = this.resolveEvolution(monsterId)
    const defId = evo?.id ?? monsterId
    const texKey = UNIT_TEXTURE_MAP[defId] ?? UNIT_TEXTURE_MAP[monsterId] ?? TEXTURE_KEYS.GOBLIN
    const preview = this.scene.add.sprite(LAUNCH_PAD_X, LAUNCH_PAD_Y, texKey)
    const unitScale = EVOLUTION_SCALES[defId] ?? 2
    preview.setScale(unitScale)
    preview.setAlpha(0.7)
    this.aimPreview = preview

    this.scene.tweens.add({
      targets: preview,
      scaleX: unitScale * 1.05,
      scaleY: unitScale * 0.95,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    this.aimLine = this.scene.add.graphics()

    // 計算並顯示連射數量 badge
    const runState = gameStore.getState().run
    const instanceCount = runState.monsters.filter(m => m.monsterId === monsterId).length
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive).length
    const burstCount = Math.min(instanceCount, Math.max(0, this.getEffectiveAllyLimit() - aliveAllies))

    if (burstCount > 1) {
      const badge = createTextBadge(
        this.scene,
        LAUNCH_PAD_X + 22,
        LAUNCH_PAD_Y - 22,
        `x${burstCount}`,
        {
          fontSize: '11px',
          color: '#ffffff',
          paddingX: 4,
          paddingY: 2,
        }
      )
      this.burstCountBadge = badge
    }
  }

  private exitAimMode(): void {
    this.aimMode = false
    this.aimMonsterId = null
    this.aimStartPoint = null

    if (this.aimPreview) {
      this.scene.tweens.killTweensOf(this.aimPreview)
      this.aimPreview.destroy()
      this.aimPreview = null
    }

    if (this.aimLine) {
      this.aimLine.destroy()
      this.aimLine = null
    }

    if (this.aimPowerText) {
      this.aimPowerText.destroy()
      this.aimPowerText = null
    }

    if (this.burstCountBadge) {
      this.burstCountBadge.destroy(true)
      this.burstCountBadge = null
    }
  }

  // ============ 發射碰撞檢測 ============

  private checkLaunchCollisions(): void {
    const launchingUnits = this.units.filter(u => u.isLaunching && u.alive)
    if (launchingUnits.length === 0) return

    const enemies = this.units.filter(u => u.faction === 'enemy' && u.alive)

    for (const unit of launchingUnits) {
      const body = unit.sprite.body as Phaser.Physics.Arcade.Body
      const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2)

      for (const enemy of enemies) {
        const dx = enemy.sprite.x - unit.sprite.x
        const dy = enemy.sprite.y - unit.sprite.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        // 動態 hitDist：基於雙方 body 大小 + 碰撞後推開的緩衝
        const unitBody = unit.sprite.body as Phaser.Physics.Arcade.Body
        const enemyBody = enemy.sprite.body as Phaser.Physics.Arcade.Body
        const hitDist = (unitBody.halfWidth + enemyBody.halfWidth) + 10

        if (dist < hitDist) {
          // 貫穿型：每個敵人只受一次傷
          if (unit.launchType === 'pierce') {
            if (unit.launchHitSet.has(enemy.id)) continue
            unit.launchHitSet.add(enemy.id)
          }

          // 碰撞型：需要距離拉開才能再次命中
          if (unit.launchType === 'bounce') {
            const hitKey = `${unit.id}_${enemy.id}`
            if (unit.launchHitSet.has(hitKey)) {
              if (dist > hitDist + 15) {
                unit.launchHitSet.delete(hitKey)
              }
              continue
            }
            unit.launchHitSet.add(hitKey)
          }

          // 衝撞傷害 = ATK x 速度係數
          const speedFactor = Math.min(speed / 300, 2.0)
          const impactDamage = Math.max(1, Math.floor(unit.atk * speedFactor))
          this.applyDamage(enemy, impactDamage)
          this.flashWhite(enemy.sprite)
          if (enemy.alive) this.applyCollisionReaction(unit, enemy)

          // 重擊相機微震（傷害 >= 15 時觸發）
          if (impactDamage >= 15) {
            const shakeIntensity = Math.min(0.008, 0.003 + impactDamage * 0.0002)
            this.scene.cameras.main.shake(120, shakeIntensity)
          }

          // 傷害數字
          const dmgText = this.scene.add.text(
            enemy.sprite.x, enemy.sprite.y - 15,
            `-${impactDamage}`,
            { fontSize: '16px', color: '#ffaa44', fontStyle: 'bold',
              stroke: '#000000', strokeThickness: 3 }
          )
          dmgText.setOrigin(0.5)
          this.scene.tweens.add({
            targets: dmgText,
            y: dmgText.y - 30,
            alpha: 0,
            duration: 800,
            ease: 'Back.easeOut',
            onComplete: () => dmgText.destroy(),
          })
        }
      }
    }
  }

  // ============ 碰撞反應處理 ============

  private applyCollisionReaction(unit: BattleUnit, enemy: BattleUnit): void {
    // 找回基底怪物 id（進化後 definitionId 如 "goblin_captain"，fromMonsterId 才是 "goblin"）
    // 實際上進化後 definitionId 就是 evolution.id，要透過 fromMonsterId 查回
    let baseId = unit.definitionId
    if (unit.evolution) {
      baseId = unit.evolution.fromMonsterId
    }
    const monsterDef = DataRegistry.getMonsterById(baseId)
    const reaction = monsterDef?.collisionReaction
    if (!reaction) return

    const now = Date.now()
    if (now < unit.collisionReactionCooldownUntil) return

    unit.collisionReactionCooldownUntil = now + reaction.cooldown

    if (reaction.type === 'dodge') {
      this.applyDodgeReaction(unit, enemy, reaction)
    } else if (reaction.type === 'push') {
      this.applyPushReaction(unit, enemy, reaction)
    } else if (reaction.type === 'taunt') {
      this.applyTauntReaction(unit, reaction)
    }
  }

  private applyDodgeReaction(unit: BattleUnit, enemy: BattleUnit, reaction: DodgeReaction): void {
    if (!unit.sprite.active) return

    // 計算反彈方向（遠離敵人）
    const dx = unit.sprite.x - enemy.sprite.x
    const dy = unit.sprite.y - enemy.sprite.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = dx / len
    const ny = dy / len

    // 瞬間推離
    const body = unit.sprite.body as Phaser.Physics.Arcade.Body
    body.setVelocity(nx * reaction.knockbackDistance * 4, ny * reaction.knockbackDistance * 4)

    // 200ms 後歸零速度
    this.scene.time.delayedCall(200, () => {
      if (unit.alive && unit.sprite.active) {
        const b = unit.sprite.body as Phaser.Physics.Arcade.Body
        b.setVelocity(0, 0)
      }
    })

    // 無敵閃爍
    unit.isDodgeInvincible = true
    this.scene.tweens.add({
      targets: unit.sprite,
      alpha: { from: 0.3, to: 1.0 },
      duration: reaction.invincibleDuration / 4,
      yoyo: true,
      repeat: 3,
      onComplete: () => {
        if (unit.sprite.active) unit.sprite.setAlpha(1)
        unit.isDodgeInvincible = false
      },
    })
  }

  private applyPushReaction(unit: BattleUnit, enemy: BattleUnit, reaction: PushReaction): void {
    if (!enemy.sprite.active) return

    // 推擠方向（遠離 unit）
    const dx = enemy.sprite.x - unit.sprite.x
    const dy = enemy.sprite.y - unit.sprite.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = dx / len
    const ny = dy / len

    const enemyBody = enemy.sprite.body as Phaser.Physics.Arcade.Body
    enemyBody.setVelocity(nx * reaction.pushForce * 8, ny * reaction.pushForce * 8)

    // 減速（用 originalMoveSpeed 記錄真正的原始速度，避免多次疊加讀到減速後的值）
    if (enemy.originalMoveSpeed === 0) enemy.originalMoveSpeed = enemy.moveSpeed
    enemy.moveSpeed = enemy.originalMoveSpeed * (1 - reaction.slowPercent / 100)
    enemy.sprite.setTint(0xff6600)

    // 恢復
    this.scene.time.delayedCall(reaction.pushDuration, () => {
      if (enemy.alive && enemy.sprite.active) {
        enemy.moveSpeed = enemy.originalMoveSpeed
        enemy.originalMoveSpeed = 0
        enemy.sprite.clearTint()
        const b = enemy.sprite.body as Phaser.Physics.Arcade.Body
        b.setVelocity(0, 0)
      }
    })
  }

  private applyTauntReaction(unit: BattleUnit, reaction: TauntReaction): void {
    if (unit.isTaunting || !unit.sprite.active) return
    unit.isTaunting = true

    // 找範圍內最近的敵人（最多 maxTargets 個）
    const taunted = this.units
      .filter(u => u.faction === 'enemy' && u.alive)
      .map(u => {
        const dx = u.sprite.x - unit.sprite.x
        const dy = u.sprite.y - unit.sprite.y
        return { u, dist: Math.sqrt(dx * dx + dy * dy) }
      })
      .filter(({ dist }) => dist <= reaction.tauntRadius)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, reaction.maxTargets)
      .map(({ u }) => u)

    if (taunted.length === 0) {
      unit.isTaunting = false
      return
    }

    // 標記嘲諷目標：設 tauntTargetId 指向 unit
    for (const e of taunted) {
      e.tauntTargetId = unit.id
      e.sprite.setTint(0xff4444)
    }

    // 嘲諷圈視覺（加入 battleOverlayElements 以便戰鬥結束時清理）
    const tauntCircle = this.scene.add.circle(unit.sprite.x, unit.sprite.y, reaction.tauntRadius, 0xff0000, 0.1)
    tauntCircle.setStrokeStyle(2, 0xff0000, 0.6)
    tauntCircle.setDepth(5)
    this.battleOverlayElements.push(tauntCircle)
    this.scene.tweens.add({ targets: tauntCircle, alpha: { from: 0, to: 1 }, duration: 200 })

    // 持續更新圓圈位置
    const trackEvent = this.scene.time.addEvent({
      delay: 50,
      repeat: Math.floor(reaction.tauntDuration / 50),
      callback: () => {
        if (unit.sprite.active) tauntCircle.setPosition(unit.sprite.x, unit.sprite.y)
      },
    })

    // 嘲諷結束
    this.scene.time.delayedCall(reaction.tauntDuration, () => {
      trackEvent.destroy()
      this.scene.tweens.add({
        targets: tauntCircle,
        alpha: 0,
        duration: 200,
        onComplete: () => tauntCircle.destroy(),
      })
      for (const e of taunted) {
        if (e.alive && e.sprite.active) e.sprite.clearTint()
        e.tauntTargetId = null
      }
      unit.isTaunting = false
    })
  }

  // ============ 發射著陸判定 ============

  private checkLaunchLanding(): void {
    for (const unit of this.units) {
      if (!unit.isLaunching || !unit.alive) continue

      const body = unit.sprite.body as Phaser.Physics.Arcade.Body

      // 房間牆壁碰撞反彈（物理世界邊界 ≠ 房間邊界）
      const margin = 10
      let wallHitX = 0
      let wallHitY = 0
      if (unit.sprite.x < ROOM_X + margin) {
        unit.sprite.x = ROOM_X + margin
        body.velocity.x = Math.abs(body.velocity.x) * LAUNCH_BOUNCE
        wallHitX = unit.sprite.x
        wallHitY = unit.sprite.y
      } else if (unit.sprite.x > ROOM_X + ROOM_WIDTH - margin) {
        unit.sprite.x = ROOM_X + ROOM_WIDTH - margin
        body.velocity.x = -Math.abs(body.velocity.x) * LAUNCH_BOUNCE
        wallHitX = unit.sprite.x
        wallHitY = unit.sprite.y
      }
      if (unit.sprite.y < ROOM_Y + margin) {
        unit.sprite.y = ROOM_Y + margin
        body.velocity.y = Math.abs(body.velocity.y) * LAUNCH_BOUNCE
        wallHitX = unit.sprite.x
        wallHitY = unit.sprite.y
      } else if (unit.sprite.y > ROOM_Y + ROOM_HEIGHT - margin) {
        unit.sprite.y = ROOM_Y + ROOM_HEIGHT - margin
        body.velocity.y = -Math.abs(body.velocity.y) * LAUNCH_BOUNCE
        wallHitX = unit.sprite.x
        wallHitY = unit.sprite.y
      }

      // 牆壁碰撞火花
      if (wallHitX !== 0 || wallHitY !== 0) {
        const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2)
        if (speed > 80) {
          for (let s = 0; s < 3; s++) {
            const sa = Math.random() * Math.PI * 2
            const sd = 6 + Math.random() * 8
            const sp = this.scene.add.circle(wallHitX, wallHitY, 1.5, 0xffdd88, 0.8)
            this.scene.tweens.add({
              targets: sp,
              x: wallHitX + Math.cos(sa) * sd,
              y: wallHitY + Math.sin(sa) * sd,
              alpha: 0,
              duration: 150,
              onComplete: () => sp.destroy(),
            })
          }
        }
      }

      // 每幀施加摩擦力
      body.velocity.x *= LAUNCH_FRICTION
      body.velocity.y *= LAUNCH_FRICTION

      const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2)
      const MAX_LAUNCH_DURATION = 3000 // 3 秒超時強制著陸
      const elapsed = Date.now() - unit.launchTime

      if (elapsed > MAX_LAUNCH_DURATION || speed < LAUNCH_STOP_SPEED) {
        // 著陸
        const reason = elapsed > MAX_LAUNCH_DURATION ? `TIMEOUT(${elapsed}ms)` : `SPEED(${speed.toFixed(1)})`
        console.log(`[BATTLE] LANDED ${unit.id} reason=${reason}`)
        unit.isLaunching = false
        body.setBounce(0.1)
        body.setVelocity(0, 0)
        body.setCollideWorldBounds(true)
        unit.ai = { ...unit.ai, state: AIState.IDLE }

        // 貫穿型：重新加入 allyGroup
        if (unit.launchType === 'pierce') {
          this.allyGroup?.add(unit.sprite)
        }

        // 著陸衝擊視覺
        this.spawnLandingVFX(unit.sprite.x, unit.sprite.y)

        this.addIdleBob(unit)
        if (unit.definitionId === 'paladin') {
          this.addUnitGlow(unit)
        }
        if (unit.evolution) {
          this.addEvolutionEffect(unit)
        }
      }
    }
  }

  // ============ 陰影/HP 條同步 ============

  private syncUnitVisuals(): void {
    for (const unit of this.units) {
      if (!unit.alive) continue
      // 陰影跟隨
      if (unit.shadow?.active) {
        unit.shadow.setPosition(unit.sprite.x + 2, unit.sprite.y + 3)
      }
      // HP 條跟隨
      if (unit.hpBar.active) {
        this.drawHPBar(
          unit.hpBar,
          unit.sprite.x,
          unit.sprite.y - unit.sprite.displayHeight / 2 - 6,
          unit.hp, unit.maxHP, unit.evolution
        )
      }
    }
  }

  // ============ 輸入處理 ============

  private setupInputHandlers(): void {
    // pointerdown: 開始拖拽瞄準
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.aimMode) return

      const dx = pointer.worldX - LAUNCH_PAD_X
      const dy = pointer.worldY - LAUNCH_PAD_Y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > LAUNCH_PAD_RADIUS + 30) return

      this.aimStartPoint = { x: pointer.worldX, y: pointer.worldY }
    })

    // pointermove: 更新瞄準線
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.aimMode || !this.aimStartPoint || !this.aimLine) return

      const dragX = pointer.worldX - this.aimStartPoint.x
      const dragY = pointer.worldY - this.aimStartPoint.y
      const dragDist = Math.sqrt(dragX * dragX + dragY * dragY)

      if (dragDist < 5) return

      // 發射方向 = 拖拽方向的反方向
      const launchAngle = Math.atan2(-dragY, -dragX)
      const power = Math.min(dragDist / LAUNCH_MAX_DRAG, 1)

      this.aimLine.clear()

      // 力道指示線
      const lineLen = 40 + power * 60
      const endX = LAUNCH_PAD_X + Math.cos(launchAngle) * lineLen
      const endY = LAUNCH_PAD_Y + Math.sin(launchAngle) * lineLen

      // 虛線效果
      this.aimLine.lineStyle(2, 0xffcc44, 0.8)
      const segments = 8
      for (let i = 0; i < segments; i++) {
        if (i % 2 === 0) {
          const t0 = i / segments
          const t1 = (i + 1) / segments
          this.aimLine.lineBetween(
            LAUNCH_PAD_X + Math.cos(launchAngle) * lineLen * t0,
            LAUNCH_PAD_Y + Math.sin(launchAngle) * lineLen * t0,
            LAUNCH_PAD_X + Math.cos(launchAngle) * lineLen * t1,
            LAUNCH_PAD_Y + Math.sin(launchAngle) * lineLen * t1,
          )
        }
      }

      // 箭頭
      const arrowSize = 6
      this.aimLine.lineBetween(
        endX, endY,
        endX - Math.cos(launchAngle - 0.4) * arrowSize,
        endY - Math.sin(launchAngle - 0.4) * arrowSize,
      )
      this.aimLine.lineBetween(
        endX, endY,
        endX - Math.cos(launchAngle + 0.4) * arrowSize,
        endY - Math.sin(launchAngle + 0.4) * arrowSize,
      )

      // 力道色彩指示
      const powerColor = power > 0.7 ? 0xff4444 : power > 0.4 ? 0xffcc44 : 0x44ff44
      this.aimLine.lineStyle(3, powerColor, 0.6)
      this.aimLine.strokeCircle(LAUNCH_PAD_X, LAUNCH_PAD_Y, LAUNCH_PAD_RADIUS + 2)

      // 力道百分比文字
      const pct = Math.round(power * 100)
      const colorHex = powerColor === 0xff4444 ? '#ff4444' : powerColor === 0xffcc44 ? '#ffcc44' : '#44ff44'
      if (!this.aimPowerText) {
        this.aimPowerText = this.scene.add.text(LAUNCH_PAD_X, LAUNCH_PAD_Y + LAUNCH_PAD_RADIUS + 12, '', {
          fontSize: '12px', fontStyle: 'bold',
          stroke: '#000000', strokeThickness: 2,
        })
        this.aimPowerText.setOrigin(0.5)
      }
      this.aimPowerText.setText(`${pct}%`)
      this.aimPowerText.setColor(colorHex)
      this.aimPowerText.setVisible(true)
    })

    // pointerup: 發射或陷阱放置
    this.scene.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // 陷阱放置模式
      if (this.trapPlaceMode) {
        this.onTrapPlaceClick(pointer.worldX, pointer.worldY)
        return
      }

      if (!this.aimMode || !this.aimStartPoint) return

      const dragX = pointer.worldX - this.aimStartPoint.x
      const dragY = pointer.worldY - this.aimStartPoint.y
      const dragDist = Math.sqrt(dragX * dragX + dragY * dragY)

      if (dragDist < 15) {
        // 拖拽太短，取消
        this.aimStartPoint = null
        if (this.aimLine) this.aimLine.clear()
        return
      }

      const launchAngle = Math.atan2(-dragY, -dragX)
      const power = Math.min(dragDist / LAUNCH_MAX_DRAG, 1)

      // 建立連射佇列
      const monsterId = this.aimMonsterId!
      const runState = gameStore.getState().run
      const instances = runState.monsters.filter(m => m.monsterId === monsterId)

      const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive).length
      const maxBurst = Math.max(0, this.getEffectiveAllyLimit() - aliveAllies)
      const burstCount = Math.min(instances.length, maxBurst)

      if (burstCount <= 0) {
        this.exitAimMode()
        return
      }

      // 填充 burstQueue（每隻攜帶各自的進化資訊）
      const queue: Array<{ monsterInstance: MonsterInstance; monsterDef: MonsterDefinition; evolution: EvolutionDefinition | null }> = []
      const monsterDef = DataRegistry.getMonsterById(monsterId)
      if (!monsterDef) {
        this.exitAimMode()
        return
      }

      for (let i = 0; i < burstCount; i++) {
        const inst = instances[i]
        const route = inst.evolutionPath as 'A' | 'B' | undefined
        const evo = route ? (DataRegistry.getEvolutionByPath(monsterId, route) ?? null) : null
        queue.push({ monsterInstance: inst, monsterDef, evolution: evo })
      }

      // 第一隻立即發射
      const first = queue[0]
      this.launchMonster(first.monsterDef.id, launchAngle, power, first.evolution)

      if (queue.length > 1) {
        // 剩餘進入連射佇列
        this.burstQueue = queue.slice(1)
        this.burstDirection = launchAngle
        this.burstPower = power
        this.lastBurstTime = this.scene.time.now
        this.isBursting = true
      } else {
        // 只有 1 隻，直接設 CD（與原行為一致）
        const card = this.deployCards.find(c => c.monsterId === monsterId)
        if (card) card.lastDeployTime = this.scene.time.now
      }

      this.exitAimMode()
    })
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

    // 清空連射佇列
    this.burstQueue = []
    this.isBursting = false

    // 顯示勝利文字（使用 createTextBadge）
    const winBadge = createTextBadge(
      this.scene,
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2,
      '勝利!',
      { fontSize: '32px', color: `#${UI_SUCCESS.toString(16)}`, bgAlpha: 0.7, paddingX: 20, paddingY: 10 }
    )

    this.scene.tweens.add({
      targets: winBadge,
      scaleX: { from: 0, to: 1.2 },
      scaleY: { from: 0, to: 1.2 },
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        // 勝利慶祝粒子爆發
        const cx = ROOM_X + ROOM_WIDTH / 2
        const cy = ROOM_Y + ROOM_HEIGHT / 2
        const celebColors = [0xffcc44, 0x44ff88, 0x88bbff, 0xff8844, 0xffffff]
        for (let vp = 0; vp < 12; vp++) {
          const vAngle = Math.random() * Math.PI * 2
          const vDist = 30 + Math.random() * 50
          const vColor = celebColors[vp % celebColors.length]
          const vParticle = this.scene.add.circle(cx, cy, 1.5 + Math.random(), vColor, 0.9)
          this.scene.tweens.add({
            targets: vParticle,
            x: cx + Math.cos(vAngle) * vDist,
            y: cy + Math.sin(vAngle) * vDist,
            alpha: 0,
            duration: 500 + Math.random() * 300,
            ease: 'Quad.easeOut',
            onComplete: () => vParticle.destroy(),
          })
        }

        this.scene.time.delayedCall(1000, () => {
          winBadge.destroy(true)
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

    // 清空連射佇列
    this.burstQueue = []
    this.isBursting = false

    // 暗紅色覆蓋層
    const defeatOverlay = this.scene.add.rectangle(
      ROOM_X + ROOM_WIDTH / 2, ROOM_Y + ROOM_HEIGHT / 2,
      ROOM_WIDTH, ROOM_HEIGHT,
      UI_DANGER, 0.15
    )

    // 顯示失敗文字（使用 createTextBadge）
    const loseBadge = createTextBadge(
      this.scene,
      ROOM_X + ROOM_WIDTH / 2,
      ROOM_Y + ROOM_HEIGHT / 2,
      '失敗...',
      { fontSize: '32px', color: '#ff4444', bgAlpha: 0.7, paddingX: 20, paddingY: 10 }
    )

    this.scene.tweens.add({
      targets: loseBadge,
      alpha: { from: 0, to: 1 },
      duration: 600,
      onComplete: () => {
        this.scene.time.delayedCall(1000, () => {
          defeatOverlay.destroy()
          loseBadge.destroy(true)
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

    // 套用後立即清空，避免第二場戰鬥重複套用
    this.scene.data.set('purchasedConsumables', [])

    for (const item of purchased) {
      switch (item.type) {
        case 'trap': {
          // 累加待放置計數，由玩家手動選位置
          this.pendingTraps += 1
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

    // 建立陷阱部署按鈕（如果有購買陷阱）
    if (this.pendingTraps > 0) {
      this.createTrapPlaceButton()
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
    lowestUnit.sprite.setTint(0x44ff44)
    this.scene.time.delayedCall(150, () => {
      if (lowestUnit.sprite.active) {
        lowestUnit.sprite.clearTint()
      }
    })

    // 治療粒子噴發（綠色 + 亮綠交替，向上擴散）
    for (let hp = 0; hp < 6; hp++) {
      const hAngle = -Math.PI / 2 + (Math.random() - 0.5) * 2.0
      const hDist = 12 + Math.random() * 18
      const hColor = hp % 2 === 0 ? 0x44ff44 : 0x88ffaa
      const hParticle = this.scene.add.circle(
        lowestUnit.sprite.x, lowestUnit.sprite.y, 1.5, hColor, 0.8
      )
      this.scene.tweens.add({
        targets: hParticle,
        x: lowestUnit.sprite.x + Math.cos(hAngle) * hDist,
        y: lowestUnit.sprite.y + Math.sin(hAngle) * hDist,
        alpha: 0,
        duration: 350 + Math.random() * 150,
        ease: 'Quad.easeOut',
        onComplete: () => hParticle.destroy(),
      })
    }

    // +HP 數字上浮
    const healText = this.scene.add.text(
      lowestUnit.sprite.x, lowestUnit.sprite.y - 10,
      `+${healAmount}`, { fontSize: '12px', color: '#44ff44', fontFamily: 'monospace' }
    )
    healText.setOrigin(0.5)
    this.scene.tweens.add({
      targets: healText,
      y: healText.y - 20,
      alpha: 0,
      duration: 600,
      ease: 'Quad.easeOut',
      onComplete: () => healText.destroy(),
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

  // ============ 陷阱手動部署 ============

  private createTrapPlaceButton(): void {
    // 防止重複建立
    if (this.trapPlaceButton) {
      const countText = this.trapPlaceButton.getData('countText') as Phaser.GameObjects.Text
      countText.setText(`x${this.pendingTraps}`)
      return
    }

    const panelY = ROOM_Y + ROOM_HEIGHT + 20
    const btnSize = 50
    const btnX = ROOM_X + ROOM_WIDTH - 40  // 房間內右側
    const btnY = panelY + 40

    const container = this.scene.add.container(btnX, btnY)
    this.trapPlaceButton = container

    const bg = this.scene.add.rectangle(0, 0, btnSize, btnSize, 0x662222)
    bg.setStrokeStyle(2, 0xff4444)
    bg.setInteractive({ useHandCursor: true })
    container.add(bg)

    const icon = this.scene.add.sprite(0, -8, TEXTURE_KEYS.ICON_TRAP)
    icon.setScale(2)
    container.add(icon)

    const countText = this.scene.add.text(0, 14, `x${this.pendingTraps}`, {
      fontSize: '12px', color: '#ffffff',
    })
    countText.setOrigin(0.5)
    container.add(countText)
    container.setData('countText', countText)

    bg.on('pointerup', () => {
      if (this.trapPlaceMode) {
        this.exitTrapPlaceMode()
      } else {
        this.enterTrapPlaceMode()
      }
    })
  }

  private enterTrapPlaceMode(): void {
    this.trapPlaceMode = true
    // 退出瞄準模式（如果正在進行）
    if (this.aimMode) {
      this.exitAimMode()
    }
    // 按鈕高亮
    if (this.trapPlaceButton) {
      const bg = this.trapPlaceButton.list[0] as Phaser.GameObjects.Rectangle
      bg.setStrokeStyle(2, 0xffcc44)
    }
  }

  private exitTrapPlaceMode(): void {
    this.trapPlaceMode = false
    // 按鈕恢復
    if (this.trapPlaceButton) {
      const bg = this.trapPlaceButton.list[0] as Phaser.GameObjects.Rectangle
      bg.setStrokeStyle(2, 0xff4444)
    }
  }

  private onTrapPlaceClick(worldX: number, worldY: number): void {
    // 邊界檢查：確保在房間範圍內
    if (
      worldX < ROOM_X || worldX > ROOM_X + ROOM_WIDTH ||
      worldY < ROOM_Y || worldY > ROOM_Y + ROOM_HEIGHT
    ) {
      return
    }

    if (!this.trapSystem) return

    const trap = this.trapSystem.placeTrap(worldX, worldY, DATA_CONSTANTS.TRAP_DAMAGE_PERCENT, 30)
    if (trap) {
      this.createTrapVisual(trap.id, trap.x, trap.y, trap.triggerRadius)
      this.pendingTraps -= 1
    }

    if (this.pendingTraps <= 0) {
      this.exitTrapPlaceMode()
      this.trapPlaceButton?.destroy(true)
      this.trapPlaceButton = null
    } else if (this.trapPlaceButton) {
      const countText = this.trapPlaceButton.getData('countText') as Phaser.GameObjects.Text
      countText.setText(`x${this.pendingTraps}`)
    }
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
          scaleX: 2, scaleY: 2,
          duration: 300,
          ease: 'Back.easeOut',
          onComplete: () => {
            this.addIdleBob(chicken)
          },
        })
      })
    }
  }

  private createChickenUnit(x: number, y: number): BattleUnit {
    const unitId = `unit_${this.nextUnitId}`
    this.nextUnitId += 1

    // 建立陰影
    const shadow = this.scene.add.image(x + 2, y + 3, TEXTURE_KEYS.SHADOW).setAlpha(0.2).setScale(1.5)

    const sprite = this.scene.add.sprite(x, y, TEXTURE_KEYS.CHICKEN)
    sprite.setScale(2)
    this.scene.physics.add.existing(sprite)

    const displayRadius = Math.max(sprite.displayWidth, sprite.displayHeight) / 2.5
    const body = sprite.body as Phaser.Physics.Arcade.Body
    body.setCircle(displayRadius)
    body.setOffset(sprite.displayWidth / 2 - displayRadius, sprite.displayHeight / 2 - displayRadius)
    body.setCollideWorldBounds(true)
    body.setBounce(0.1)

    this.allyGroup?.add(sprite)

    const hpBar = this.scene.add.graphics()
    this.drawHPBar(hpBar, x, y - sprite.displayHeight / 2 - 4, DATA_CONSTANTS.CHICKEN_HP, DATA_CONSTANTS.CHICKEN_HP)

    return {
      sprite,
      shadow,
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
      goldReward: 0,
      xpReward: 0,
      isChicken: true,
      evolution: null,
      isLaunching: false,
      launchTime: 0,
      launchType: 'bounce',
      launchHitSet: new Set(),
      collisionReactionCooldownUntil: 0,
      isTaunting: false,
      isDodgeInvincible: false,
      tauntTargetId: null,
      originalMoveSpeed: 0,
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
    this.scene.input.removeAllListeners('pointerdown')
    this.scene.input.removeAllListeners('pointermove')
    this.scene.input.removeAllListeners('pointerup')

    // 銷毀所有單位
    for (const unit of this.units) {
      if (unit.shadow?.active) {
        unit.shadow.destroy()
      }
      if (unit.sprite.active) {
        this.scene.tweens.killTweensOf(unit.sprite)
        unit.sprite.destroy()
      }
      if (unit.hpBar.active) {
        unit.hpBar.destroy()
      }
    }
    this.units = []

    // 連射系統清理
    this.burstQueue = []
    this.isBursting = false
    if (this.burstCountBadge) {
      this.burstCountBadge.destroy(true)
      this.burstCountBadge = null
    }

    // 瞄準模式清理
    this.exitAimMode()

    // 發射台清理
    if (this.launchPadGraphics) {
      this.scene.tweens.killTweensOf(this.launchPadGraphics)
      this.launchPadGraphics.destroy()
      this.launchPadGraphics = null
    }

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

    // 銷毀戰鬥疊加元素
    for (const el of this.battleOverlayElements) {
      this.scene.tweens.killTweensOf(el)
      el.destroy()
    }
    this.battleOverlayElements = []

    // 房間渲染：使用共享房間時只釋放引用，不銷毀
    if (this.usingSharedRoom) {
      this.roomGraphics = null
      this.roomTileSprites = []
    } else {
      this.roomGraphics?.destroy()
      this.roomGraphics = null
      for (const ts of this.roomTileSprites) {
        ts.destroy()
      }
      this.roomTileSprites = []
    }

    this.breachGraphics?.destroy()
    this.breachGraphics = null

    // 清理陷阱部署按鈕
    if (this.trapPlaceButton) {
      this.trapPlaceButton.destroy(true)
      this.trapPlaceButton = null
    }
    this.trapPlaceMode = false
    this.pendingTraps = 0

    // 清理陷阱視覺元素
    for (const [, container] of this.trapSprites) {
      this.scene.tweens.killTweensOf(container.list[0])
      container.destroy(true)
    }
    this.trapSprites.clear()

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
