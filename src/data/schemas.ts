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

// ============ 怪物系統 ============

export interface MonsterStats {
  readonly hp: number
  readonly attack: number
  readonly attackInterval: number   // 秒
  readonly moveSpeed: number        // 像素/秒 (0 = 站樁)
  readonly attackRange: number      // 像素
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
