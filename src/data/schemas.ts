/**
 * ProjectCircle - 資料層型別定義
 * 所有 interface 使用 readonly 確保不可變性
 *
 * 注意：GameState/RunState/AccountState 定義在 state/game-state.ts
 * 本檔案只定義資料定義（data definitions）的型別
 */

// ============ 基礎型別 ============

export type MonsterRarity = 'common' | 'uncommon' | 'rare' | 'epic'

export type AIBehaviorType =
  | 'melee_aggressive'   // 近戰輸出型：攻擊最弱敵人
  | 'melee_tank'         // 近戰肉盾型：攻擊最近敵人
  | 'ranged_stationary'  // 遠程站樁：不移動，射程內自動射擊
  | 'support'            // 輔助型：光環 buff

export type RoomType = 'dungeon_heart' | 'treasury' | 'training_ground' | 'chicken_coop'

export type RoomEffectType =
  | 'gold_bonus'         // 金幣加成
  | 'attack_speed'       // 攻速加成
  | 'spawn_minions'      // 生成小雞
  | 'none'               // 無效果（地心）

// 計畫中的 6 種房間詞綴
export type AffixType =
  | 'dark_room'          // 暗室：視野縮小50%，我方攻擊+20%
  | 'narrow_path'        // 窄道：部署槽位-1，敵人同時只能進2個
  | 'treasure_guard'     // 寶物守衛：多1波敵人，金幣x2
  | 'sanctuary'          // 聖域：我方怪物每秒回2%HP
  | 'trap_field'         // 陷阱密布：自動放置2個免費陷阱
  | 'frenzy'             // 狂熱：全場單位攻速+30%，HP-15%

export type ConsumableType = 'trap' | 'heal' | 'reinforcement' | 'crystal'

// ============ 碰撞反應系統 ============

export interface DodgeReaction {
  readonly type: 'dodge'
  readonly knockbackDistance: number   // 反彈距離（像素），建議 60
  readonly invincibleDuration: number  // 無敵時間（ms），建議 500
  readonly cooldown: number            // CD（ms），建議 3000
}

export interface PushReaction {
  readonly type: 'push'
  readonly pushForce: number           // 推力，建議 30
  readonly slowPercent: number         // 減速百分比 0-90，建議 50
  readonly pushDuration: number        // 推擠持續時間（ms），建議 1000
  readonly cooldown: number            // CD（ms），建議 2000
}

export interface TauntReaction {
  readonly type: 'taunt'
  readonly tauntRadius: number         // 嘲諷半徑（像素），建議 120
  readonly tauntDuration: number       // 持續時間（ms），建議 3000
  readonly maxTargets: number          // 最多影響幾個敵人，建議 4
  readonly cooldown: number            // CD（ms），建議 4000
}

export type CollisionReaction = DodgeReaction | PushReaction | TauntReaction

// ============ 怪物系統 ============

export interface MonsterStats {
  readonly hp: number
  readonly attack: number
  readonly attackInterval: number   // 秒
  readonly moveSpeed: number        // 像素/秒 (0 = 站樁)
  readonly attackRange: number      // 像素
  readonly launchType: 'bounce' | 'pierce'
}

export interface MonsterDefinition {
  readonly id: string
  readonly name: string
  readonly rarity: MonsterRarity
  readonly stats: MonsterStats
  readonly aiType: AIBehaviorType
  readonly deployCooldown: number   // ms
  readonly description: string
  readonly tags?: readonly string[]
  readonly collisionReaction?: CollisionReaction
}

// ============ 進化系統 ============

export interface EvolutionPath {
  readonly route: 'A' | 'B'
  readonly name: string
}

export interface EvolutionStats {
  readonly hp: number
  readonly attack: number
  readonly attackInterval: number
  readonly moveSpeed?: number
  readonly attackRange?: number
  readonly launchType?: 'bounce' | 'pierce'
}

export interface SpecialAbility {
  readonly type: 'speed_boost' | 'aura_atk' | 'range_boost' | 'aoe' | 'knockback' | 'damage_scaling'
  readonly description: string
  readonly params: Readonly<Record<string, number | string>>
}

export interface EvolutionDefinition {
  readonly id: string
  readonly fromMonsterId: string
  readonly path: EvolutionPath
  readonly evolvedStats: EvolutionStats    // 進化後的完整屬性
  readonly specialAbility: SpecialAbility
  readonly aiType?: AIBehaviorType         // 若改變 AI 行為
}

// ============ 房間系統 ============

export interface RoomEffect {
  readonly type: RoomEffectType
  readonly baseValue: number
  readonly description: string
}

export interface DiminishingValues {
  readonly values: readonly [number, number, number, number]  // [1st, 2nd, 3rd, 4th+]
  readonly maxBonus?: number  // 上限百分比
}

export interface RoomDefinition {
  readonly id: string
  readonly name: string
  readonly type: RoomType
  readonly effect: RoomEffect
  readonly diminishing: DiminishingValues
  readonly passiveIncomePerBattle?: number  // 每場戰鬥的被動金幣收入
  readonly minionSpawn?: {
    readonly type: string
    readonly count: number
  }
  readonly description: string
}

// ============ 英雄系統 ============

export interface HeroStats {
  readonly hp: number
  readonly attack: number
  readonly attackInterval: number   // 秒
  readonly moveSpeed: number        // 像素/秒
  readonly attackRange: number      // 像素
}

export interface HeroDefinition {
  readonly id: string
  readonly name: string
  readonly stats: HeroStats
  readonly goldReward: number       // 擊殺金幣獎勵
  readonly xpReward: number         // 擊殺經驗獎勵
  readonly aiType: AIBehaviorType
  readonly description: string
}

// ============ 詞綴系統 ============

export interface AffixModifier {
  readonly visionMultiplier?: number       // 視野倍率
  readonly allyAttackMultiplier?: number   // 我方攻擊倍率
  readonly deploySlotChange?: number       // 槽位變化
  readonly maxSimultaneousEnemies?: number // 同時進場敵人上限
  readonly extraWaves?: number             // 額外波數
  readonly goldMultiplier?: number         // 金幣倍率
  readonly allyHpRegen?: number            // 我方每秒 HP 回復 (% 最大HP)
  readonly freeTraps?: number              // 免費陷阱數量
  readonly allAttackSpeedMultiplier?: number // 全場攻速倍率 (敵我)
  readonly allHpMultiplier?: number        // 全場 HP 倍率 (敵我)
}

export interface AffixDefinition {
  readonly id: AffixType
  readonly name: string
  readonly modifier: AffixModifier
  readonly description: string
}

// ============ 陷阱系統 ============

export type TrapCategory =
  | 'instant_damage'    // One-time damage (spike)
  | 'persistent_area'   // Continuous area effect (swamp, totem)
  | 'displacement'      // One-time knockback (bouncer)
  | 'buff_trigger'      // One-time buff activation (alarm)

export interface TrapDefinition {
  readonly id: string
  readonly name: string
  readonly category: TrapCategory
  readonly cost: number
  readonly sellbackRatio: number        // 0.5 = get 50% back when selling
  readonly triggerRadius: number        // pixels
  readonly description: string
  // Category-specific params
  readonly damagePercent?: number       // instant_damage: % of max HP
  readonly slowPercent?: number         // persistent_area (swamp): speed reduction 0-1
  readonly damageMultiplier?: number    // persistent_area (totem): incoming damage multiplier (1.5 = +50%)
  readonly displacement?: {             // displacement (bouncer): knockback params
    readonly force: number              // knockback force in pixels
    readonly enemyOnly: boolean         // true = only affects enemies
  }
  readonly buffEffect?: {               // buff_trigger (alarm): buff params
    readonly attackSpeedMultiplier: number  // e.g. 1.3 = +30%
    readonly duration: number              // ms
    readonly radius: number                // buff radius in pixels
  }
}

export interface PlacedTrapData {
  readonly trapId: string          // unique instance ID
  readonly definitionId: string    // references TrapDefinition.id
  readonly x: number
  readonly y: number
}

// ============ Level Layout System ============

export interface ObstacleData {
  readonly x: number          // pixels relative to ROOM_X
  readonly y: number          // pixels relative to ROOM_Y
  readonly width: number      // pixels
  readonly height: number     // pixels
  readonly type: 'wall' | 'destructible'
  readonly hp?: number        // only for 'destructible', default 100
}

export interface WaypointPath {
  readonly points: ReadonlyArray<{ readonly x: number; readonly y: number }>  // relative to ROOM_X/ROOM_Y
}

export interface LaunchPadPosition {
  readonly x: number  // relative to ROOM_X
  readonly y: number  // relative to ROOM_Y
}

export interface LevelLayout {
  readonly id: string
  readonly name: string
  readonly obstacles: readonly ObstacleData[]
  readonly launchPads: readonly LaunchPadPosition[]
  readonly waypoints: Readonly<Record<string, WaypointPath>>  // key = breach direction
  readonly allowedBreachDirections: readonly string[]
  readonly crystalPosition?: { readonly x: number; readonly y: number }  // Phase 3
  readonly maxTraps?: number  // optional trap placement limit
}

// ============ 消耗品系統 ============

export interface ConsumableDefinition {
  readonly id: string
  readonly name: string
  readonly type: ConsumableType
  readonly cost: number
  readonly maxPerBattle?: number    // 每場使用上限
  readonly description: string
}

// ============ 波次系統 ============

export interface WaveEntry {
  readonly heroId: string
  readonly count: number
}

export interface WaveDefinition {
  readonly waveNumber: number
  readonly entries: readonly WaveEntry[]
}

export interface BattleWaveConfig {
  readonly roomDistance: number      // 離起點距離 (1-4)
  readonly totalWaves: number
  readonly waves: readonly WaveDefinition[]
  readonly variant?: readonly WaveDefinition[]  // 50% 機率變體
}

// ============ 常數 ============

export const DATA_CONSTANTS = {
  EVOLUTION_XP_THRESHOLD: 30,
  TRAP_DAMAGE_PERCENT: 0.3,
  HEAL_PERCENT: 0.6,
  MAX_TRAP_TRIGGERS_PER_ENEMY: 1,
  CHICKEN_HP: 20,
  CHICKEN_ATK: 0,
  CHICKEN_SPEED: 50,
  MAX_CHICKENS: 5,
  VICTORY_ROOM_COUNT: 5,
} as const
