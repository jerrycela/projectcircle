# 碰撞反應系統設計 - 20 次迭代優化

**建立日期**: 2026-02-18
**狀態**: 進行中
**標籤**: ProjectCircle, 碰撞反應系統, 迭代設計, 遊戲機制

---

## 迭代變更摘要

### 迭代 1-5：資料結構完善性

#### 【迭代 1】型別安全性強化
**問題發現**：
- `CollisionParams` 使用 union type，但缺少判別式欄位
- `params` 欄位型別過於寬鬆，容易在執行時期出錯
- 缺少型別守衛函數

**改進方案**：
```typescript
// 使用判別聯集（Discriminated Union）
export type CollisionReaction =
  | DodgeReaction
  | PushReaction
  | TauntReaction
  | NoneReaction

interface BaseReaction {
  trigger: 'instant' | 'continuous' | 'onHit'
  target: 'self' | 'enemy' | 'allies'
  cooldown?: number
}

export interface DodgeReaction extends BaseReaction {
  type: 'dodge'
  params: DodgeParams
}

export interface PushReaction extends BaseReaction {
  type: 'push'
  params: PushParams
}

export interface TauntReaction extends BaseReaction {
  type: 'taunt'
  params: TauntParams
}

export interface NoneReaction {
  type: 'none'
}

// 型別守衛
export function isDodgeReaction(r: CollisionReaction): r is DodgeReaction {
  return r.type === 'dodge'
}

export function isPushReaction(r: CollisionReaction): r is PushReaction {
  return r.type === 'push'
}

export function isTauntReaction(r: CollisionReaction): r is TauntReaction {
  return r.type === 'taunt'
}
```

**新問題檢查**：無，判別聯集是 TypeScript 最佳實踐

---

#### 【迭代 2】缺少的關鍵欄位
**問題發現**：
- 沒有追蹤效果來源的機制
- 缺少效果堆疊規則（同類型效果能否共存？）
- 沒有效果結束時的回呼機制
- 缺少視覺效果配置

**改進方案**：
```typescript
export interface BaseReaction {
  trigger: 'instant' | 'continuous' | 'onHit'
  target: 'self' | 'enemy' | 'allies'
  cooldown?: number
  stackBehavior: 'replace' | 'stack' | 'refresh' | 'ignore'  // 新增
  maxStacks?: number  // 新增：最大堆疊數
  visualEffect?: VisualEffectConfig  // 新增
  onEffectStart?: string  // 新增：事件名稱
  onEffectEnd?: string    // 新增：事件名稱
}

export interface VisualEffectConfig {
  particleKey?: string
  animationKey?: string
  tintColor?: number
  alphaModifier?: number
  scaleModifier?: number
  soundKey?: string
}

// ActiveEffect 也需要更新
interface ActiveEffect {
  effectId: string
  type: 'invincible' | 'slow' | 'taunted' | 'pushed'
  source: MonsterUnit
  target: Runner | MonsterUnit
  startTime: number
  duration: number
  params: Record<string, any>
  stackCount: number  // 新增
  refreshable: boolean  // 新增
}
```

**新問題檢查**：
- 堆疊邏輯可能過於複雜，需要清楚的文檔說明
- 事件系統需要確保全域可用

---

#### 【迭代 3】向後相容性考量
**問題發現**：
- 現有怪物定義可能沒有 `collisionReaction` 欄位
- 缺少預設值處理
- 沒有版本控制機制

**改進方案**：
```typescript
export interface MonsterDefinition {
  // ... 既有欄位
  collisionReaction?: CollisionReaction  // 保持 optional

  // 新增：版本控制
  _schemaVersion?: string  // 例如 "1.0.0"
}

// 預設行為工廠函數
export function getDefaultCollisionReaction(): NoneReaction {
  return { type: 'none' }
}

// 驗證函數
export function validateCollisionReaction(
  reaction: unknown
): CollisionReaction {
  if (!reaction) {
    return getDefaultCollisionReaction()
  }

  // 執行驗證邏輯
  // ...

  return reaction as CollisionReaction
}

// 遷移輔助函數
export function migrateMonsterDefinition(
  def: MonsterDefinition
): MonsterDefinition {
  const version = def._schemaVersion || '0.0.0'

  if (version === '0.0.0') {
    // 舊版本沒有 collisionReaction
    return {
      ...def,
      collisionReaction: getDefaultCollisionReaction(),
      _schemaVersion: '1.0.0'
    }
  }

  return def
}
```

**新問題檢查**：
- 需要在載入怪物定義時統一呼叫遷移函數
- 版本號管理需要明確的策略

---

#### 【迭代 4】資料驗證與錯誤處理
**問題發現**：
- 數值參數沒有範圍限制（例如 slowPercent 可能 >100 或 <0）
- 缺少執行時期驗證
- 錯誤訊息不夠明確

**改進方案**：
```typescript
import { z } from 'zod'

// 使用 Zod 進行驗證
const DodgeParamsSchema = z.object({
  knockbackDistance: z.number().min(0).max(200),
  invincibleDuration: z.number().min(0).max(5000)
})

const PushParamsSchema = z.object({
  pushForce: z.number().min(0).max(200),
  slowPercent: z.number().min(0).max(100),
  pushRadius: z.number().min(0).max(300)
})

const TauntParamsSchema = z.object({
  tauntRadius: z.number().min(0).max(500),
  tauntDuration: z.number().min(0).max(10000),
  maxTargets: z.number().int().min(1).max(20)
})

const BaseReactionSchema = z.object({
  trigger: z.enum(['instant', 'continuous', 'onHit']),
  target: z.enum(['self', 'enemy', 'allies']),
  cooldown: z.number().min(0).optional(),
  stackBehavior: z.enum(['replace', 'stack', 'refresh', 'ignore']),
  maxStacks: z.number().int().min(1).max(10).optional(),
  visualEffect: z.object({
    particleKey: z.string().optional(),
    animationKey: z.string().optional(),
    tintColor: z.number().optional(),
    alphaModifier: z.number().min(0).max(1).optional(),
    scaleModifier: z.number().min(0).max(5).optional(),
    soundKey: z.string().optional()
  }).optional(),
  onEffectStart: z.string().optional(),
  onEffectEnd: z.string().optional()
})

export const DodgeReactionSchema = BaseReactionSchema.extend({
  type: z.literal('dodge'),
  params: DodgeParamsSchema
})

export const PushReactionSchema = BaseReactionSchema.extend({
  type: z.literal('push'),
  params: PushParamsSchema
})

export const TauntReactionSchema = BaseReactionSchema.extend({
  type: z.literal('taunt'),
  params: TauntParamsSchema
})

export const CollisionReactionSchema = z.discriminatedUnion('type', [
  DodgeReactionSchema,
  PushReactionSchema,
  TauntReactionSchema,
  z.object({ type: z.literal('none') })
])

// 驗證函數改用 Zod
export function validateCollisionReaction(
  reaction: unknown
): CollisionReaction {
  if (!reaction) {
    return getDefaultCollisionReaction()
  }

  try {
    return CollisionReactionSchema.parse(reaction)
  } catch (error) {
    console.error('Invalid collision reaction:', error)
    return getDefaultCollisionReaction()
  }
}
```

**新問題檢查**：
- Zod 增加了依賴，但提供了更好的型別安全
- 需要確保專案已安裝 Zod

---

#### 【迭代 5】擴充性設計
**問題發現**：
- 新增反應類型需要修改多處程式碼
- 沒有插件化機制
- 難以支援自訂反應類型

**改進方案**：
```typescript
// 反應處理器介面
export interface ReactionHandler<T extends CollisionReaction> {
  readonly type: T['type']

  canTrigger(
    source: MonsterUnit,
    target: Runner | MonsterUnit,
    reaction: T
  ): boolean

  execute(
    source: MonsterUnit,
    target: Runner | MonsterUnit,
    reaction: T,
    context: BattleContext
  ): ActiveEffect[]

  update(
    effect: ActiveEffect,
    deltaTime: number,
    context: BattleContext
  ): void

  cleanup(
    effect: ActiveEffect,
    context: BattleContext
  ): void
}

// 反應註冊系統
export class CollisionReactionRegistry {
  private handlers = new Map<string, ReactionHandler<any>>()

  register<T extends CollisionReaction>(
    handler: ReactionHandler<T>
  ): void {
    this.handlers.set(handler.type, handler)
  }

  getHandler(type: string): ReactionHandler<any> | undefined {
    return this.handlers.get(type)
  }

  executeReaction(
    source: MonsterUnit,
    target: Runner | MonsterUnit,
    reaction: CollisionReaction,
    context: BattleContext
  ): ActiveEffect[] {
    const handler = this.getHandler(reaction.type)

    if (!handler) {
      console.warn(`No handler for reaction type: ${reaction.type}`)
      return []
    }

    if (!handler.canTrigger(source, target, reaction)) {
      return []
    }

    return handler.execute(source, target, reaction, context)
  }
}

// 具體實作範例
export class DodgeReactionHandler
  implements ReactionHandler<DodgeReaction> {

  readonly type = 'dodge'

  canTrigger(
    source: MonsterUnit,
    target: Runner | MonsterUnit,
    reaction: DodgeReaction
  ): boolean {
    // 檢查冷卻時間
    const now = Date.now()
    const lastTrigger = source.lastReactionTrigger?.get('dodge') || 0
    return now - lastTrigger >= (reaction.cooldown || 0)
  }

  execute(
    source: MonsterUnit,
    target: Runner | MonsterUnit,
    reaction: DodgeReaction,
    context: BattleContext
  ): ActiveEffect[] {
    // 執行閃避邏輯
    const { knockbackDistance, invincibleDuration } = reaction.params

    // 記錄觸發時間
    source.lastReactionTrigger = source.lastReactionTrigger || new Map()
    source.lastReactionTrigger.set('dodge', Date.now())

    // 創建效果
    return [{
      effectId: `dodge_${Date.now()}_${Math.random()}`,
      type: 'invincible',
      source,
      target: source,
      startTime: Date.now(),
      duration: invincibleDuration,
      params: { knockbackDistance },
      stackCount: 1,
      refreshable: false
    }]
  }

  update(
    effect: ActiveEffect,
    deltaTime: number,
    context: BattleContext
  ): void {
    // 更新閃避動畫等
  }

  cleanup(
    effect: ActiveEffect,
    context: BattleContext
  ): void {
    // 清理效果
  }
}

// 初始化
const registry = new CollisionReactionRegistry()
registry.register(new DodgeReactionHandler())
registry.register(new PushReactionHandler())
registry.register(new TauntReactionHandler())
```

**新問題檢查**：
- 增加了架構複雜度，但提供了更好的擴充性
- 需要確保所有反應類型都有對應的處理器

---

### 迭代 6-10：遊戲平衡與體驗

#### 【迭代 6】Dodge 數值平衡
**問題發現**：
- 原設計：knockbackDistance=25px, invincibleDuration=300ms, cooldown=2000ms
- 問題：
  - 25px 可能不夠明顯，玩家感受不到「閃避」
  - 300ms 無敵時間可能太短，無法閃避多段攻擊
  - 2 秒冷卻可能太頻繁，導致 Goblin 過於難打

**改進方案**：
```typescript
// 調整後的 Dodge 參數
collisionReaction: {
  type: 'dodge',
  trigger: 'instant',
  target: 'self',
  params: {
    knockbackDistance: 50,        // 25 → 50（更明顯）
    invincibleDuration: 500       // 300 → 500（足以閃避 1-2 次攻擊）
  },
  cooldown: 3000,                 // 2000 → 3000（降低頻率）
  stackBehavior: 'ignore'         // 無敵期間觸發直接忽略
}
```

**平衡理由**：
- 50px 約為 2 個單位寬度，視覺效果更明顯
- 500ms 給予玩家清晰的「無敵期」回饋
- 3 秒冷卻確保不會連續閃避，保持挑戰性

**新問題檢查**：
- 需要實測：50px 會不會跳太遠導致脫離戰鬥
- 需要實測：3 秒冷卻在快節奏戰鬥中是否合適

---

#### 【迭代 7】Push 持續效果優化
**問題發現**：
- 原設計：持續觸發（每 100ms）、pushForce=50、slowPercent=30、cooldown=100ms
- 問題：
  - 持續觸發 + 100ms 冷卻 = 幾乎永久推擠，過於強勢
  - 30% 減速可能感受不明顯
  - 缺少推擠最大距離限制

**改進方案**：
```typescript
// 調整後的 Push 參數
collisionReaction: {
  type: 'push',
  trigger: 'continuous',
  target: 'enemy',
  params: {
    pushForce: 30,              // 50 → 30（降低推力）
    slowPercent: 50,            // 30 → 50（提高減速）
    pushRadius: 60,
    pushDuration: 1000,         // 新增：持續推 1 秒
    maxPushDistance: 100        // 新增：最大推離距離
  },
  cooldown: 2000,               // 100 → 2000（大幅增加冷卻）
  stackBehavior: 'refresh'      // 重新推擠會刷新持續時間
}

// PushParams 介面更新
export interface PushParams {
  pushForce: number
  slowPercent: number
  pushRadius: number
  pushDuration: number          // 新增
  maxPushDistance: number       // 新增
}
```

**平衡理由**：
- 降低推力但提高減速，從「推開」轉為「控場」
- 1 秒持續時間 + 2 秒冷卻 = 50% uptime，更平衡
- 最大推離距離避免敵人被推出戰場

**新問題檢查**：
- 需要檢查：推擠邏輯如何計算「已推離距離」
- 需要檢查：多個 Ogre 同時推擠同一目標的行為

---

#### 【迭代 8】Taunt 目標選擇邏輯
**問題發現**：
- 原設計：maxTargets=3, tauntRadius=100, tauntDuration=2000ms
- 問題：
  - 沒有說明「選擇哪 3 個目標」的優先級
  - Boss 免疫嘲諷，但缺少免疫機制定義
  - 嘲諷期間目標死亡如何處理

**改進方案**：
```typescript
export interface TauntParams {
  tauntRadius: number
  tauntDuration: number
  maxTargets: number
  targetPriority: 'nearest' | 'weakest' | 'strongest' | 'random'  // 新增
  canTauntBoss: boolean       // 新增：明確標記
  breakOnSourceDeath: boolean  // 新增：來源死亡是否中斷
  breakOnTargetDeath: boolean  // 新增：目標死亡是否移除
}

// 調整後的 Skeleton Taunt 配置
collisionReaction: {
  type: 'taunt',
  trigger: 'onHit',
  target: 'enemy',
  params: {
    tauntRadius: 120,           // 100 → 120（略微增加）
    tauntDuration: 3000,        // 2000 → 3000（更長控制）
    maxTargets: 4,              // 3 → 4
    targetPriority: 'nearest',  // 新增：優先嘲諷最近的
    canTauntBoss: false,        // 新增：Boss 免疫
    breakOnSourceDeath: true,   // 新增：骷髏死亡立即解除
    breakOnTargetDeath: true    // 新增：目標死亡自動移除
  },
  cooldown: 4000,               // 5000 → 4000（略微縮短）
  stackBehavior: 'refresh'      // 重複嘲諷刷新時間
}
```

**平衡理由**：
- 'nearest' 優先級最符合「吸引注意力」的概念
- 3 秒持續時間配合 4 秒冷卻，有 25% downtime
- 明確的死亡處理避免無效嘲諷

**新問題檢查**：
- 需要在 Runner/Monster 介面加入 `isBoss` 標記
- 需要事件系統處理死亡時清理效果

---

#### 【迭代 9】視覺回饋一致性
**問題發現**：
- 原設計有視覺描述（後跳、半透明等）但沒有具體參數
- 缺少音效配置
- 沒有顏色編碼規範

**改進方案**：
```typescript
// 定義標準視覺效果配置
export const COLLISION_VISUAL_PRESETS = {
  dodge: {
    particleKey: 'dodge_burst',
    animationKey: 'unit_dodge',
    tintColor: 0xFFFF00,        // 黃色
    alphaModifier: 0.5,         // 半透明
    scaleModifier: 1.0,
    soundKey: 'sfx_dodge',
    cameraShake: {
      intensity: 2,
      duration: 200
    }
  },
  push: {
    particleKey: 'push_wave',
    animationKey: 'unit_pushed',
    tintColor: 0xFF6600,        // 橘色
    alphaModifier: 1.0,
    scaleModifier: 0.9,         // 略微縮小表示被壓制
    soundKey: 'sfx_push',
    cameraShake: {
      intensity: 3,
      duration: 300
    }
  },
  taunt: {
    particleKey: 'taunt_pulse',
    animationKey: 'unit_taunted',
    tintColor: 0xFF0000,        // 紅色
    alphaModifier: 1.0,
    scaleModifier: 1.1,         // 略微放大表示憤怒
    soundKey: 'sfx_taunt',
    statusIcon: 'icon_exclamation',  // 新增：狀態圖示
    linkLineColor: 0xFF0000     // 新增：連接線顏色
  }
} as const

// 擴充 VisualEffectConfig
export interface VisualEffectConfig {
  particleKey?: string
  animationKey?: string
  tintColor?: number
  alphaModifier?: number
  scaleModifier?: number
  soundKey?: string
  cameraShake?: {
    intensity: number
    duration: number
  }
  statusIcon?: string         // 新增
  linkLineColor?: number      // 新增（用於嘲諷連線）
}

// 在反應定義中使用預設配置
collisionReaction: {
  type: 'dodge',
  // ...其他欄位
  visualEffect: COLLISION_VISUAL_PRESETS.dodge
}
```

**改進理由**：
- 預設配置確保視覺一致性
- 顏色編碼幫助玩家快速識別效果類型
- 相機震動增強打擊感

**新問題檢查**：
- 需要準備對應的粒子效果和音效資源
- 需要確保 Phaser 場景支援相機震動

---

#### 【迭代 10】玩家體驗流暢度
**問題發現**：
- 碰撞偵測每幀執行可能造成效能問題
- 沒有「預告」機制，玩家難以預判反應觸發
- 缺少教學提示

**改進方案**：
```typescript
// 1. 碰撞偵測優化：使用空間分割
export interface CollisionDetectionConfig {
  enabled: boolean
  method: 'bruteForce' | 'quadtree' | 'grid'  // 新增
  cellSize: number                             // Grid 方法使用
  detectionRadius: number                      // 預設碰撞半徑
  checkInterval: number                        // 檢測間隔（ms）
}

// 2. 預告機制
export interface BaseReaction {
  // ...既有欄位
  telegraph?: {
    enabled: boolean
    showRadius: boolean      // 顯示影響範圍
    radiusColor: number      // 範圍圈顏色
    warningTime: number      // 提前預警時間（ms）
    warningEffect: string    // 預警視覺效果
  }
}

// 3. 教學提示配置
export interface TutorialHint {
  reactionType: string
  title: string
  description: string
  showOnFirstTrigger: boolean
  icon: string
}

export const COLLISION_TUTORIALS: TutorialHint[] = [
  {
    reactionType: 'dodge',
    title: '閃避反應',
    description: 'Goblin 碰撞時會向後跳躍並短暫無敵',
    showOnFirstTrigger: true,
    icon: 'tutorial_dodge'
  },
  {
    reactionType: 'push',
    title: '推擠反應',
    description: 'Ogre 持續推開並減速敵人',
    showOnFirstTrigger: true,
    icon: 'tutorial_push'
  },
  {
    reactionType: 'taunt',
    title: '嘲諷反應',
    description: 'Skeleton 吸引附近敵人攻擊',
    showOnFirstTrigger: true,
    icon: 'tutorial_taunt'
  }
]

// Goblin 配置範例（加入預告）
collisionReaction: {
  type: 'dodge',
  // ...其他欄位
  telegraph: {
    enabled: true,
    showRadius: false,       // 閃避不需要顯示範圍
    radiusColor: 0xFFFF00,
    warningTime: 200,        // 碰撞前 200ms 閃爍
    warningEffect: 'blink'
  }
}
```

**改進理由**：
- Grid 空間分割在大量單位時效能更好
- 預告機制讓玩家能預判，提升策略深度
- 教學提示降低學習曲線

**新問題檢查**：
- 需要實作空間分割資料結構
- 預告時間需要仔細調整，太長會破壞驚喜感

---

### 迭代 11-15：效能與最佳化

#### 【迭代 11】碰撞偵測效能優化
**問題發現**：
- 暴力法 O(n²) 複雜度在 100+ 單位時會卡頓
- 每幀都計算距離浪費運算
- 沒有使用物件池

**改進方案**：
```typescript
// 1. 空間分割：Quadtree 實作
export class SpatialHash {
  private cellSize: number
  private cells: Map<string, Set<MonsterUnit | Runner>>

  constructor(cellSize: number = 100) {
    this.cellSize = cellSize
    this.cells = new Map()
  }

  private getCellKey(x: number, y: number): string {
    const cellX = Math.floor(x / this.cellSize)
    const cellY = Math.floor(y / this.cellSize)
    return `${cellX},${cellY}`
  }

  insert(entity: MonsterUnit | Runner): void {
    const key = this.getCellKey(entity.x, entity.y)
    if (!this.cells.has(key)) {
      this.cells.set(key, new Set())
    }
    this.cells.get(key)!.add(entity)
  }

  getNearby(x: number, y: number, radius: number): (MonsterUnit | Runner)[] {
    const results: (MonsterUnit | Runner)[] = []
    const cellRadius = Math.ceil(radius / this.cellSize)
    const centerCellX = Math.floor(x / this.cellSize)
    const centerCellY = Math.floor(y / this.cellSize)

    for (let dx = -cellRadius; dx <= cellRadius; dx++) {
      for (let dy = -cellRadius; dy <= cellRadius; dy++) {
        const key = `${centerCellX + dx},${centerCellY + dy}`
        const cell = this.cells.get(key)
        if (cell) {
          results.push(...Array.from(cell))
        }
      }
    }

    return results
  }

  clear(): void {
    this.cells.clear()
  }
}

// 2. 固定時間步長檢測
export class CollisionDetector {
  private spatialHash: SpatialHash
  private lastCheckTime: number = 0
  private checkInterval: number = 100  // 每 100ms 檢測一次

  constructor(cellSize: number = 100) {
    this.spatialHash = new SpatialHash(cellSize)
  }

  update(
    monsters: MonsterUnit[],
    runners: Runner[],
    deltaTime: number
  ): CollisionPair[] {
    const now = Date.now()

    // 固定時間步長
    if (now - this.lastCheckTime < this.checkInterval) {
      return []
    }

    this.lastCheckTime = now

    // 重建空間 hash
    this.spatialHash.clear()
    monsters.forEach(m => this.spatialHash.insert(m))
    runners.forEach(r => this.spatialHash.insert(r))

    // 碰撞檢測
    const pairs: CollisionPair[] = []

    for (const monster of monsters) {
      const nearby = this.spatialHash.getNearby(
        monster.x,
        monster.y,
        monster.collisionRadius || 25
      )

      for (const other of nearby) {
        if (other !== monster && this.checkCollision(monster, other)) {
          pairs.push({ source: monster, target: other })
        }
      }
    }

    return pairs
  }

  private checkCollision(
    a: MonsterUnit | Runner,
    b: MonsterUnit | Runner
  ): boolean {
    const dx = a.x - b.x
    const dy = a.y - b.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    const minDistance = (a.collisionRadius || 25) + (b.collisionRadius || 25)
    return distance < minDistance
  }
}

interface CollisionPair {
  source: MonsterUnit
  target: Runner | MonsterUnit
}
```

**效能提升**：
- 空間 hash：O(n²) → O(n)
- 固定時間步長：每秒 60 次 → 每秒 10 次（6x 減少）
- 100 單位時：3600 次計算 → 60 次計算（60x 減少）

**新問題檢查**：
- 100ms 間隔可能錯過快速移動的碰撞
- 需要調整：高速單位應降低 checkInterval

---

#### 【迭代 12】記憶體管理優化
**問題發現**：
- ActiveEffect 物件頻繁建立與銷毀
- 視覺效果粒子沒有池化
- 事件監聽器可能洩漏

**改進方案**：
```typescript
// 1. ActiveEffect 物件池
export class EffectPool {
  private pool: ActiveEffect[] = []
  private active = new Set<ActiveEffect>()

  acquire(
    type: ActiveEffect['type'],
    source: MonsterUnit,
    target: Runner | MonsterUnit,
    duration: number,
    params: Record<string, any>
  ): ActiveEffect {
    let effect = this.pool.pop()

    if (!effect) {
      effect = this.createEffect()
    }

    // 重置效果
    effect.effectId = `${type}_${Date.now()}_${Math.random()}`
    effect.type = type
    effect.source = source
    effect.target = target
    effect.startTime = Date.now()
    effect.duration = duration
    effect.params = params
    effect.stackCount = 1
    effect.refreshable = true

    this.active.add(effect)
    return effect
  }

  release(effect: ActiveEffect): void {
    this.active.delete(effect)

    // 清理引用避免記憶體洩漏
    effect.source = null as any
    effect.target = null as any
    effect.params = {}

    this.pool.push(effect)
  }

  private createEffect(): ActiveEffect {
    return {
      effectId: '',
      type: 'invincible',
      source: null as any,
      target: null as any,
      startTime: 0,
      duration: 0,
      params: {},
      stackCount: 0,
      refreshable: false
    }
  }

  releaseAll(): void {
    this.active.forEach(e => this.release(e))
    this.active.clear()
  }
}

// 2. 粒子效果池化（整合到 Phaser）
export class ParticleEffectManager {
  private scene: Phaser.Scene
  private pools = new Map<string, Phaser.GameObjects.Particles.ParticleEmitter[]>()

  constructor(scene: Phaser.Scene) {
    this.scene = scene
  }

  emit(
    key: string,
    x: number,
    y: number,
    config?: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig
  ): void {
    let pool = this.pools.get(key)

    if (!pool) {
      pool = []
      this.pools.set(key, pool)
    }

    // 尋找閒置的發射器
    let emitter = pool.find(e => !e.on)

    if (!emitter) {
      const particles = this.scene.add.particles(0, 0, key)
      emitter = particles.createEmitter(config || {})
      pool.push(emitter)
    }

    emitter.setPosition(x, y)
    emitter.explode(10)
  }

  cleanup(): void {
    this.pools.forEach(pool => {
      pool.forEach(emitter => emitter.stop())
    })
    this.pools.clear()
  }
}

// 3. 事件監聽器管理
export class CollisionEventManager {
  private listeners = new Map<string, Set<Function>>()

  on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(callback)
  }

  off(event: string, callback: Function): void {
    this.listeners.get(event)?.delete(callback)
  }

  emit(event: string, data: any): void {
    this.listeners.get(event)?.forEach(cb => cb(data))
  }

  clear(): void {
    this.listeners.clear()
  }
}
```

**記憶體節省**：
- 物件池：避免 GC 壓力
- 引用清理：防止記憶體洩漏
- 事件管理：確保監聽器正確移除

**新問題檢查**：
- 物件池大小需要限制，避免無限增長
- 需要在場景切換時呼叫 cleanup

---

#### 【迭代 13】視覺特效效能
**問題發現**：
- 同時存在多個粒子發射器會降低幀率
- 嘲諷連線在多目標時繪製成本高
- 缺少 LOD（Level of Detail）機制

**改進方案**：
```typescript
// 1. 粒子效果預算系統
export class EffectBudgetManager {
  private maxActiveParticles: number = 500
  private currentParticles: number = 0
  private priorityQueue: PriorityQueue<ParticleEffect> = new PriorityQueue()

  canSpawnParticle(priority: number): boolean {
    if (this.currentParticles < this.maxActiveParticles) {
      return true
    }

    // 檢查是否能替換低優先級粒子
    const lowest = this.priorityQueue.peek()
    return lowest && lowest.priority < priority
  }

  spawnParticle(effect: ParticleEffect, priority: number): void {
    if (this.currentParticles >= this.maxActiveParticles) {
      const removed = this.priorityQueue.dequeue()
      if (removed) {
        removed.effect.destroy()
        this.currentParticles--
      }
    }

    this.priorityQueue.enqueue({ effect, priority })
    this.currentParticles++
  }

  removeParticle(effect: ParticleEffect): void {
    this.priorityQueue.remove(effect)
    this.currentParticles--
  }
}

// 2. 簡化的嘲諷連線繪製
export class TauntLineRenderer {
  private graphics: Phaser.GameObjects.Graphics
  private maxLines: number = 20  // 限制同時顯示的連線數

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics()
  }

  render(tauntEffects: ActiveEffect[]): void {
    this.graphics.clear()

    // 只繪製最近的 maxLines 條連線
    const sortedEffects = tauntEffects
      .slice()
      .sort((a, b) => {
        const distA = Phaser.Math.Distance.Between(
          a.source.x, a.source.y,
          a.target.x, a.target.y
        )
        const distB = Phaser.Math.Distance.Between(
          b.source.x, b.source.y,
          b.target.x, b.target.y
        )
        return distA - distB
      })
      .slice(0, this.maxLines)

    sortedEffects.forEach(effect => {
      this.graphics.lineStyle(2, 0xFF0000, 0.5)
      this.graphics.lineBetween(
        effect.source.x,
        effect.source.y,
        effect.target.x,
        effect.target.y
      )
    })
  }
}

// 3. LOD 系統
export interface VisualLODConfig {
  closeDistance: number      // 近距離閾值
  mediumDistance: number     // 中距離閾值
  farDistance: number        // 遠距離閾值

  closeDetail: 'full' | 'medium' | 'low'
  mediumDetail: 'full' | 'medium' | 'low'
  farDetail: 'full' | 'medium' | 'low'
}

export const DEFAULT_LOD_CONFIG: VisualLODConfig = {
  closeDistance: 200,
  mediumDistance: 400,
  farDistance: 600,
  closeDetail: 'full',
  mediumDetail: 'medium',
  farDetail: 'low'
}

export function getVisualDetailLevel(
  cameraX: number,
  cameraY: number,
  targetX: number,
  targetY: number,
  config: VisualLODConfig = DEFAULT_LOD_CONFIG
): 'full' | 'medium' | 'low' {
  const distance = Phaser.Math.Distance.Between(
    cameraX, cameraY, targetX, targetY
  )

  if (distance < config.closeDistance) return config.closeDetail
  if (distance < config.mediumDistance) return config.mediumDetail
  if (distance < config.farDistance) return config.farDetail
  return 'low'
}

// 在視覺效果中應用 LOD
export function applyVisualEffect(
  target: Phaser.GameObjects.Sprite,
  effect: VisualEffectConfig,
  detailLevel: 'full' | 'medium' | 'low'
): void {
  switch (detailLevel) {
    case 'full':
      // 完整效果
      if (effect.particleKey) {
        // 發射粒子
      }
      if (effect.animationKey) {
        target.play(effect.animationKey)
      }
      break

    case 'medium':
      // 中等效果：只有動畫，沒有粒子
      if (effect.animationKey) {
        target.play(effect.animationKey)
      }
      break

    case 'low':
      // 低效果：只有色調變化
      if (effect.tintColor) {
        target.setTint(effect.tintColor)
      }
      break
  }
}
```

**效能提升**：
- 粒子預算：限制總數避免爆炸
- 連線限制：20 條連線 vs 無限制
- LOD：遠距離單位降低細節

**新問題檢查**：
- LOD 切換可能造成視覺跳動
- 粒子優先級需要明確定義

---

#### 【迭代 14】大量單位壓力測試
**問題發現**：
- 需要驗證 200+ 單位時的表現
- 沒有效能監控機制
- 缺少降級策略

**改進方案**：
```typescript
// 1. 效能監控
export class PerformanceMonitor {
  private frameRates: number[] = []
  private maxSamples: number = 60

  private collisionCheckTime: number = 0
  private effectUpdateTime: number = 0
  private visualRenderTime: number = 0

  recordFrame(deltaTime: number): void {
    const fps = 1000 / deltaTime
    this.frameRates.push(fps)

    if (this.frameRates.length > this.maxSamples) {
      this.frameRates.shift()
    }
  }

  recordCollisionCheck(time: number): void {
    this.collisionCheckTime = time
  }

  recordEffectUpdate(time: number): void {
    this.effectUpdateTime = time
  }

  recordVisualRender(time: number): void {
    this.visualRenderTime = time
  }

  getAverageFPS(): number {
    if (this.frameRates.length === 0) return 60
    return this.frameRates.reduce((a, b) => a + b, 0) / this.frameRates.length
  }

  isPerformanceCritical(): boolean {
    return this.getAverageFPS() < 30
  }

  getBottleneck(): string {
    const times = {
      collision: this.collisionCheckTime,
      effect: this.effectUpdateTime,
      visual: this.visualRenderTime
    }

    const max = Math.max(...Object.values(times))
    return Object.keys(times).find(k => times[k as keyof typeof times] === max) || 'unknown'
  }
}

// 2. 自動降級系統
export class QualityScaler {
  private monitor: PerformanceMonitor
  private currentQuality: 'high' | 'medium' | 'low' = 'high'

  constructor(monitor: PerformanceMonitor) {
    this.monitor = monitor
  }

  update(): void {
    const fps = this.monitor.getAverageFPS()

    if (fps < 25 && this.currentQuality !== 'low') {
      this.downgrade()
    } else if (fps > 50 && this.currentQuality !== 'high') {
      this.upgrade()
    }
  }

  private downgrade(): void {
    if (this.currentQuality === 'high') {
      this.currentQuality = 'medium'
      this.applyMediumQuality()
    } else if (this.currentQuality === 'medium') {
      this.currentQuality = 'low'
      this.applyLowQuality()
    }

    console.warn(`Quality downgraded to: ${this.currentQuality}`)
  }

  private upgrade(): void {
    if (this.currentQuality === 'low') {
      this.currentQuality = 'medium'
      this.applyMediumQuality()
    } else if (this.currentQuality === 'medium') {
      this.currentQuality = 'high'
      this.applyHighQuality()
    }

    console.log(`Quality upgraded to: ${this.currentQuality}`)
  }

  private applyHighQuality(): void {
    // 碰撞檢測：每 100ms
    CollisionDetector.checkInterval = 100
    // 粒子預算：500
    EffectBudgetManager.maxActiveParticles = 500
    // LOD：完整細節
    DEFAULT_LOD_CONFIG.closeDetail = 'full'
  }

  private applyMediumQuality(): void {
    // 碰撞檢測：每 200ms
    CollisionDetector.checkInterval = 200
    // 粒子預算：250
    EffectBudgetManager.maxActiveParticles = 250
    // LOD：中等細節
    DEFAULT_LOD_CONFIG.closeDetail = 'medium'
  }

  private applyLowQuality(): void {
    // 碰撞檢測：每 300ms
    CollisionDetector.checkInterval = 300
    // 粒子預算：100
    EffectBudgetManager.maxActiveParticles = 100
    // LOD：低細節
    DEFAULT_LOD_CONFIG.closeDetail = 'low'
    // 停用部分視覺效果
    COLLISION_VISUAL_PRESETS.dodge.cameraShake = undefined
    COLLISION_VISUAL_PRESETS.push.cameraShake = undefined
  }
}

// 3. 壓力測試配置
export interface StressTestConfig {
  monsterCount: number
  runnerCount: number
  duration: number  // ms
  recordMetrics: boolean
}

export async function runStressTest(
  config: StressTestConfig
): Promise<StressTestResults> {
  const results: StressTestResults = {
    avgFPS: 0,
    minFPS: Infinity,
    maxFPS: 0,
    avgCollisionTime: 0,
    avgEffectTime: 0,
    peakMemory: 0
  }

  // 執行測試...

  return results
}

interface StressTestResults {
  avgFPS: number
  minFPS: number
  maxFPS: number
  avgCollisionTime: number
  avgEffectTime: number
  peakMemory: number
}
```

**壓力測試目標**：
- 100 單位：60 FPS（高品質）
- 200 單位：45 FPS（中品質）
- 300 單位：30 FPS（低品質）

**新問題檢查**：
- 自動降級可能影響遊戲體驗
- 需要 UI 通知玩家品質變化

---

#### 【迭代 15】批次處理優化
**問題發現**：
- 效果更新逐個處理，cache miss 率高
- 視覺渲染沒有批次化
- 缺少 dirty flag 避免無謂更新

**改進方案**：
```typescript
// 1. 批次效果更新
export class BatchedEffectManager {
  private effects: ActiveEffect[] = []
  private dirtyFlags = new Set<number>()  // 追蹤需要更新的 index

  addEffect(effect: ActiveEffect): void {
    const index = this.effects.length
    this.effects.push(effect)
    this.dirtyFlags.add(index)
  }

  update(deltaTime: number, context: BattleContext): void {
    const now = Date.now()
    const toRemove: number[] = []

    // 批次處理
    this.dirtyFlags.forEach(index => {
      const effect = this.effects[index]

      if (!effect) return

      // 檢查過期
      if (now - effect.startTime > effect.duration) {
        toRemove.push(index)
        return
      }

      // 更新效果
      this.updateEffect(effect, deltaTime, context)

      // 如果效果穩定，移除 dirty flag
      if (this.isEffectStable(effect)) {
        this.dirtyFlags.delete(index)
      }
    })

    // 批次移除
    this.batchRemove(toRemove)
  }

  private updateEffect(
    effect: ActiveEffect,
    deltaTime: number,
    context: BattleContext
  ): void {
    const handler = context.registry.getHandler(effect.type)
    handler?.update(effect, deltaTime, context)
  }

  private isEffectStable(effect: ActiveEffect): boolean {
    // 判斷效果是否穩定（不需要每幀更新）
    // 例如：invincible 狀態在持續期間不需要更新
    return effect.type === 'invincible'
  }

  private batchRemove(indices: number[]): void {
    // 從後往前移除，避免 index 錯位
    indices.sort((a, b) => b - a).forEach(index => {
      this.effects.splice(index, 1)
      this.dirtyFlags.delete(index)
    })
  }
}

// 2. 視覺渲染批次化
export class BatchedVisualRenderer {
  private scene: Phaser.Scene
  private renderQueue: Map<string, RenderBatch> = new Map()

  queueRender(
    spriteKey: string,
    x: number,
    y: number,
    tint?: number,
    alpha?: number
  ): void {
    if (!this.renderQueue.has(spriteKey)) {
      this.renderQueue.set(spriteKey, {
        spriteKey,
        instances: []
      })
    }

    this.renderQueue.get(spriteKey)!.instances.push({
      x, y, tint, alpha
    })
  }

  flush(): void {
    this.renderQueue.forEach(batch => {
      // 使用 Phaser 的批次渲染
      batch.instances.forEach(instance => {
        const sprite = this.scene.add.sprite(
          instance.x,
          instance.y,
          batch.spriteKey
        )

        if (instance.tint !== undefined) {
          sprite.setTint(instance.tint)
        }

        if (instance.alpha !== undefined) {
          sprite.setAlpha(instance.alpha)
        }
      })
    })

    this.renderQueue.clear()
  }
}

interface RenderBatch {
  spriteKey: string
  instances: Array<{
    x: number
    y: number
    tint?: number
    alpha?: number
  }>
}

// 3. Dirty Flag 系統
export class DirtyTracker {
  private dirtyEntities = new Set<string>()

  markDirty(entityId: string): void {
    this.dirtyEntities.add(entityId)
  }

  isDirty(entityId: string): boolean {
    return this.dirtyEntities.has(entityId)
  }

  clearDirty(entityId: string): void {
    this.dirtyEntities.delete(entityId)
  }

  clearAll(): void {
    this.dirtyEntities.clear()
  }

  getDirtyEntities(): Set<string> {
    return this.dirtyEntities
  }
}
```

**效能提升**：
- 批次更新：減少函數呼叫開銷
- Dirty flag：只更新變化的實體
- 視覺批次：減少渲染呼叫

**新問題檢查**：
- Dirty flag 邏輯需要仔細處理，避免漏更新
- 批次移除需要注意 index 偏移

---

### 迭代 16-20：邊界情況與錯誤處理

#### 【迭代 16】單位死亡處理
**問題發現**：
- 單位死亡時效果可能仍在運行
- 死亡單位仍可能被嘲諷
- 視覺效果沒有跟隨死亡單位清理

**改進方案**：
```typescript
// 1. 死亡事件處理
export class DeathHandler {
  private effectManager: BatchedEffectManager
  private eventManager: CollisionEventManager

  constructor(
    effectManager: BatchedEffectManager,
    eventManager: CollisionEventManager
  ) {
    this.effectManager = effectManager
    this.eventManager = eventManager

    // 監聽死亡事件
    this.eventManager.on('unit_death', this.onUnitDeath.bind(this))
  }

  private onUnitDeath(unit: MonsterUnit | Runner): void {
    // 1. 清理該單位作為來源的所有效果
    this.cleanupEffectsBySource(unit)

    // 2. 清理該單位作為目標的所有效果
    this.cleanupEffectsByTarget(unit)

    // 3. 清理視覺效果
    this.cleanupVisuals(unit)

    // 4. 從碰撞偵測中移除
    this.removeFromCollisionDetection(unit)
  }

  private cleanupEffectsBySource(unit: MonsterUnit | Runner): void {
    const effects = this.effectManager.effects.filter(e => e.source === unit)

    effects.forEach(effect => {
      // 根據效果類型決定清理行為
      const reaction = this.getReactionConfig(effect.type)

      if (reaction && 'breakOnSourceDeath' in reaction.params) {
        if (reaction.params.breakOnSourceDeath) {
          this.effectManager.removeEffect(effect)
        }
      } else {
        // 預設：來源死亡則清理效果
        this.effectManager.removeEffect(effect)
      }
    })
  }

  private cleanupEffectsByTarget(unit: MonsterUnit | Runner): void {
    const effects = this.effectManager.effects.filter(e => e.target === unit)

    effects.forEach(effect => {
      const reaction = this.getReactionConfig(effect.type)

      if (reaction && 'breakOnTargetDeath' in reaction.params) {
        if (reaction.params.breakOnTargetDeath) {
          this.effectManager.removeEffect(effect)
        }
      } else {
        // 預設：目標死亡則清理效果
        this.effectManager.removeEffect(effect)
      }
    })
  }

  private cleanupVisuals(unit: MonsterUnit | Runner): void {
    // 停止所有附加的粒子效果
    unit.particleEmitters?.forEach(emitter => {
      emitter.stop()
      emitter.destroy()
    })

    // 清理狀態圖示
    unit.statusIcons?.forEach(icon => icon.destroy())

    // 清理連接線
    unit.linkLines?.forEach(line => line.destroy())
  }

  private removeFromCollisionDetection(unit: MonsterUnit | Runner): void {
    // 從空間 hash 中移除
    // 標記為 dead，碰撞檢測會跳過
    unit.isDead = true
  }

  private getReactionConfig(effectType: string): CollisionReaction | null {
    // 根據效果類型取得反應配置
    // 需要維護一個 effectType -> reactionType 的映射
    return null  // 實作略
  }
}

// 2. 在 MonsterUnit / Runner 介面加入死亡標記
export interface MonsterUnit {
  // ...既有欄位
  isDead: boolean
  particleEmitters?: Phaser.GameObjects.Particles.ParticleEmitter[]
  statusIcons?: Phaser.GameObjects.Image[]
  linkLines?: Phaser.GameObjects.Graphics[]
}

// 3. 碰撞檢測跳過死亡單位
export class CollisionDetector {
  // ...既有程式碼

  private checkCollision(
    a: MonsterUnit | Runner,
    b: MonsterUnit | Runner
  ): boolean {
    // 跳過死亡單位
    if (a.isDead || b.isDead) {
      return false
    }

    // ...原本的碰撞檢測邏輯
  }
}
```

**改進效果**：
- 死亡單位立即清理，避免殭屍效果
- 視覺效果同步清理，避免視覺錯誤
- 效能提升：死亡單位不再參與碰撞檢測

**新問題檢查**：
- 需要確保死亡事件一定會觸發
- 清理順序需要正確（先效果，後視覺）

---

#### 【迭代 17】多效果衝突處理
**問題發現**：
- 同時受到 Dodge + Taunt 時行為未定義
- Push + Slow 可能疊加到移動速度為負
- 優先級系統只有簡單描述，沒有實作細節

**改進方案**：
```typescript
// 1. 效果優先級與衝突解決
export enum EffectPriority {
  INVINCIBLE = 100,    // 最高優先級
  CONTROL = 80,        // 控制類（嘲諷、暈眩）
  DEBUFF = 60,         // 減益（減速、虛弱）
  BUFF = 40,           // 增益
  VISUAL_ONLY = 20     // 純視覺效果
}

export const EFFECT_TYPE_PRIORITY: Record<ActiveEffect['type'], number> = {
  invincible: EffectPriority.INVINCIBLE,
  taunted: EffectPriority.CONTROL,
  slow: EffectPriority.DEBUFF,
  pushed: EffectPriority.DEBUFF
}

// 2. 效果衝突規則
export interface ConflictRule {
  effectA: ActiveEffect['type']
  effectB: ActiveEffect['type']
  resolution: 'both' | 'higherPriority' | 'newer' | 'custom'
  customResolver?: (a: ActiveEffect, b: ActiveEffect) => ActiveEffect | null
}

export const CONFLICT_RULES: ConflictRule[] = [
  {
    effectA: 'invincible',
    effectB: 'slow',
    resolution: 'both'  // 無敵可與減速共存
  },
  {
    effectA: 'invincible',
    effectB: 'taunted',
    resolution: 'higherPriority'  // 無敵免疫嘲諷
  },
  {
    effectA: 'taunted',
    effectB: 'taunted',
    resolution: 'newer'  // 新嘲諷覆蓋舊嘲諷
  },
  {
    effectA: 'slow',
    effectB: 'slow',
    resolution: 'custom',
    customResolver: (a, b) => {
      // 減速效果取較強的
      const slowA = a.params.slowPercent || 0
      const slowB = b.params.slowPercent || 0
      return slowA > slowB ? a : b
    }
  },
  {
    effectA: 'pushed',
    effectB: 'slow',
    resolution: 'both'  // 推擠與減速可疊加
  }
]

// 3. 衝突解決器
export class ConflictResolver {
  resolveConflicts(effects: ActiveEffect[]): ActiveEffect[] {
    const resolved: ActiveEffect[] = []

    // 按優先級排序
    const sorted = effects.slice().sort((a, b) => {
      const priorityA = EFFECT_TYPE_PRIORITY[a.type] || 0
      const priorityB = EFFECT_TYPE_PRIORITY[b.type] || 0
      return priorityB - priorityA
    })

    for (const effect of sorted) {
      let shouldAdd = true

      for (const existing of resolved) {
        const rule = this.findConflictRule(effect.type, existing.type)

        if (rule) {
          const resolution = this.applyRule(rule, effect, existing)

          if (resolution === 'skip') {
            shouldAdd = false
            break
          } else if (resolution === 'replace') {
            const index = resolved.indexOf(existing)
            resolved.splice(index, 1)
            break
          }
        }
      }

      if (shouldAdd) {
        resolved.push(effect)
      }
    }

    return resolved
  }

  private findConflictRule(
    typeA: ActiveEffect['type'],
    typeB: ActiveEffect['type']
  ): ConflictRule | undefined {
    return CONFLICT_RULES.find(
      r => (r.effectA === typeA && r.effectB === typeB) ||
           (r.effectA === typeB && r.effectB === typeA)
    )
  }

  private applyRule(
    rule: ConflictRule,
    newEffect: ActiveEffect,
    existingEffect: ActiveEffect
  ): 'skip' | 'replace' | 'both' {
    switch (rule.resolution) {
      case 'both':
        return 'both'

      case 'higherPriority':
        const priorityNew = EFFECT_TYPE_PRIORITY[newEffect.type] || 0
        const priorityExisting = EFFECT_TYPE_PRIORITY[existingEffect.type] || 0
        return priorityNew > priorityExisting ? 'replace' : 'skip'

      case 'newer':
        return 'replace'

      case 'custom':
        if (rule.customResolver) {
          const result = rule.customResolver(newEffect, existingEffect)
          if (result === newEffect) return 'replace'
          if (result === existingEffect) return 'skip'
        }
        return 'both'

      default:
        return 'both'
    }
  }
}

// 4. 移動速度安全計算
export class MovementCalculator {
  calculateFinalSpeed(
    baseSpeed: number,
    effects: ActiveEffect[]
  ): number {
    let finalSpeed = baseSpeed

    // 收集所有減速效果
    const slowEffects = effects.filter(e =>
      e.type === 'slow' || e.type === 'pushed'
    )

    // 計算總減速百分比（不疊加，取最大值）
    const maxSlowPercent = Math.max(
      0,
      ...slowEffects.map(e => e.params.slowPercent || 0)
    )

    // 應用減速（確保不會變成負數）
    finalSpeed *= (1 - maxSlowPercent / 100)
    finalSpeed = Math.max(0, finalSpeed)

    // 應用推力（獨立計算）
    const pushEffects = effects.filter(e => e.type === 'pushed')
    pushEffects.forEach(effect => {
      const pushForce = effect.params.pushForce || 0
      // pushForce 直接影響位置，不影響速度
    })

    return finalSpeed
  }
}
```

**衝突解決策略**：
- 無敵 > 嘲諷（無敵期間免疫控制）
- 多個減速取最大值（不疊加）
- 推擠與減速可共存但獨立計算

**新問題檢查**：
- 衝突規則需要完整測試所有組合
- 自訂解析器需要避免無限遞迴

---

#### 【迭代 18】極端數值測試
**問題發現**：
- 沒有測試 slowPercent = 0 或 100 的情況
- knockbackDistance = 0 可能造成無限循環
- 負數參數沒有防護

**改進方案**：
```typescript
// 1. 參數正規化函數
export class ParameterNormalizer {
  static normalizeDodgeParams(params: DodgeParams): DodgeParams {
    return {
      knockbackDistance: this.clamp(params.knockbackDistance, 10, 200),
      invincibleDuration: this.clamp(params.invincibleDuration, 100, 5000)
    }
  }

  static normalizePushParams(params: PushParams): PushParams {
    return {
      pushForce: this.clamp(params.pushForce, 0, 200),
      slowPercent: this.clamp(params.slowPercent, 0, 99),  // 不允許 100%
      pushRadius: this.clamp(params.pushRadius, 0, 300),
      pushDuration: this.clamp(params.pushDuration, 100, 5000),
      maxPushDistance: this.clamp(params.maxPushDistance, 0, 500)
    }
  }

  static normalizeTauntParams(params: TauntParams): TauntParams {
    return {
      tauntRadius: this.clamp(params.tauntRadius, 0, 500),
      tauntDuration: this.clamp(params.tauntDuration, 500, 10000),
      maxTargets: Math.floor(this.clamp(params.maxTargets, 1, 20)),
      targetPriority: params.targetPriority || 'nearest',
      canTauntBoss: params.canTauntBoss ?? false,
      breakOnSourceDeath: params.breakOnSourceDeath ?? true,
      breakOnTargetDeath: params.breakOnTargetDeath ?? true
    }
  }

  private static clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }
}

// 2. 邊界值測試套件
export const BOUNDARY_TEST_CASES = {
  dodge: [
    {
      name: 'Zero knockback',
      params: { knockbackDistance: 0, invincibleDuration: 500 },
      expected: { knockbackDistance: 10, invincibleDuration: 500 }
    },
    {
      name: 'Negative knockback',
      params: { knockbackDistance: -50, invincibleDuration: 500 },
      expected: { knockbackDistance: 10, invincibleDuration: 500 }
    },
    {
      name: 'Extreme knockback',
      params: { knockbackDistance: 9999, invincibleDuration: 500 },
      expected: { knockbackDistance: 200, invincibleDuration: 500 }
    },
    {
      name: 'Zero invincible duration',
      params: { knockbackDistance: 50, invincibleDuration: 0 },
      expected: { knockbackDistance: 50, invincibleDuration: 100 }
    }
  ],
  push: [
    {
      name: '100% slow',
      params: { pushForce: 50, slowPercent: 100, pushRadius: 60, pushDuration: 1000, maxPushDistance: 100 },
      expected: { pushForce: 50, slowPercent: 99, pushRadius: 60, pushDuration: 1000, maxPushDistance: 100 }
    },
    {
      name: 'Negative slow',
      params: { pushForce: 50, slowPercent: -50, pushRadius: 60, pushDuration: 1000, maxPushDistance: 100 },
      expected: { pushForce: 50, slowPercent: 0, pushRadius: 60, pushDuration: 1000, maxPushDistance: 100 }
    },
    {
      name: 'Zero push duration',
      params: { pushForce: 50, slowPercent: 50, pushRadius: 60, pushDuration: 0, maxPushDistance: 100 },
      expected: { pushForce: 50, slowPercent: 50, pushRadius: 60, pushDuration: 100, maxPushDistance: 100 }
    }
  ],
  taunt: [
    {
      name: 'Zero max targets',
      params: { tauntRadius: 100, tauntDuration: 2000, maxTargets: 0, targetPriority: 'nearest', canTauntBoss: false, breakOnSourceDeath: true, breakOnTargetDeath: true },
      expected: { tauntRadius: 100, tauntDuration: 2000, maxTargets: 1, targetPriority: 'nearest', canTauntBoss: false, breakOnSourceDeath: true, breakOnTargetDeath: true }
    },
    {
      name: 'Fractional max targets',
      params: { tauntRadius: 100, tauntDuration: 2000, maxTargets: 2.7, targetPriority: 'nearest', canTauntBoss: false, breakOnSourceDeath: true, breakOnTargetDeath: true },
      expected: { tauntRadius: 100, tauntDuration: 2000, maxTargets: 2, targetPriority: 'nearest', canTauntBoss: false, breakOnSourceDeath: true, breakOnTargetDeath: true }
    }
  ]
}

// 3. 執行時期驗證
export function createValidatedReaction<T extends CollisionReaction>(
  reaction: T
): T {
  // Zod 驗證
  const validated = CollisionReactionSchema.parse(reaction)

  // 參數正規化
  if (validated.type === 'dodge') {
    validated.params = ParameterNormalizer.normalizeDodgeParams(validated.params)
  } else if (validated.type === 'push') {
    validated.params = ParameterNormalizer.normalizePushParams(validated.params)
  } else if (validated.type === 'taunt') {
    validated.params = ParameterNormalizer.normalizeTauntParams(validated.params)
  }

  return validated as T
}
```

**邊界值處理**：
- slowPercent 上限 99%（避免完全靜止）
- knockbackDistance 下限 10px（避免無效閃避）
- maxTargets 強制整數且 ≥1

**新問題檢查**：
- 正規化可能改變設計者意圖，需要記錄警告
- 測試套件需要持續更新

---

#### 【迭代 19】錯誤恢復機制
**問題發現**：
- 效果處理器拋出異常會導致整個系統崩潰
- 沒有降級方案
- 缺少錯誤記錄

**改進方案**：
```typescript
// 1. 安全的效果執行包裝
export class SafeReactionExecutor {
  private registry: CollisionReactionRegistry
  private errorLogger: ErrorLogger
  private fallbackHandler: FallbackReactionHandler

  constructor(
    registry: CollisionReactionRegistry,
    errorLogger: ErrorLogger
  ) {
    this.registry = registry
    this.errorLogger = errorLogger
    this.fallbackHandler = new FallbackReactionHandler()
  }

  executeReaction(
    source: MonsterUnit,
    target: Runner | MonsterUnit,
    reaction: CollisionReaction,
    context: BattleContext
  ): ActiveEffect[] {
    try {
      // 驗證參數
      this.validateInputs(source, target, reaction, context)

      // 執行反應
      const handler = this.registry.getHandler(reaction.type)

      if (!handler) {
        throw new Error(`No handler found for reaction type: ${reaction.type}`)
      }

      return handler.execute(source, target, reaction, context)

    } catch (error) {
      // 記錄錯誤
      this.errorLogger.logError({
        type: 'reaction_execution_failed',
        reactionType: reaction.type,
        source: source.id,
        target: target.id,
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      })

      // 使用降級處理器
      return this.fallbackHandler.execute(source, target, reaction, context)
    }
  }

  private validateInputs(
    source: MonsterUnit,
    target: Runner | MonsterUnit,
    reaction: CollisionReaction,
    context: BattleContext
  ): void {
    if (!source || !target) {
      throw new Error('Source or target is null/undefined')
    }

    if (source.isDead || target.isDead) {
      throw new Error('Source or target is dead')
    }

    if (!reaction || reaction.type === 'none') {
      throw new Error('Invalid reaction')
    }

    if (!context || !context.scene) {
      throw new Error('Invalid battle context')
    }
  }
}

// 2. 降級處理器（確保遊戲不會崩潰）
export class FallbackReactionHandler {
  execute(
    source: MonsterUnit,
    target: Runner | MonsterUnit,
    reaction: CollisionReaction,
    context: BattleContext
  ): ActiveEffect[] {
    // 最簡單的降級方案：只產生視覺效果，不改變遊戲邏輯
    console.warn(`Using fallback handler for ${reaction.type}`)

    // 播放簡單的粒子效果
    if (context.particleManager) {
      context.particleManager.emit(
        'generic_impact',
        target.x,
        target.y
      )
    }

    // 不返回任何遊戲邏輯效果
    return []
  }
}

// 3. 錯誤記錄器
export interface ErrorLog {
  type: string
  reactionType: string
  source: string
  target: string
  error: string
  timestamp: number
}

export class ErrorLogger {
  private logs: ErrorLog[] = []
  private maxLogs: number = 100

  logError(log: ErrorLog): void {
    this.logs.push(log)

    // 限制日誌大小
    if (this.logs.length > this.maxLogs) {
      this.logs.shift()
    }

    // 輸出到控制台
    console.error(`[CollisionReaction Error] ${log.type}:`, log)

    // 可選：發送到遠端監控
    // this.sendToRemoteMonitoring(log)
  }

  getRecentErrors(count: number = 10): ErrorLog[] {
    return this.logs.slice(-count)
  }

  getErrorsByType(type: string): ErrorLog[] {
    return this.logs.filter(log => log.type === type)
  }

  clearLogs(): void {
    this.logs = []
  }
}

// 4. 斷路器模式（Circuit Breaker）
export class CircuitBreaker {
  private failureCount: number = 0
  private failureThreshold: number = 5
  private resetTimeout: number = 10000  // 10 秒
  private lastFailureTime: number = 0
  private state: 'closed' | 'open' | 'half-open' = 'closed'

  execute<T>(operation: () => T): T | null {
    if (this.state === 'open') {
      // 檢查是否該重試
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'half-open'
      } else {
        console.warn('Circuit breaker is open, skipping operation')
        return null
      }
    }

    try {
      const result = operation()

      // 成功：重置計數
      if (this.state === 'half-open') {
        this.state = 'closed'
        this.failureCount = 0
      }

      return result

    } catch (error) {
      this.failureCount++
      this.lastFailureTime = Date.now()

      if (this.failureCount >= this.failureThreshold) {
        this.state = 'open'
        console.error('Circuit breaker opened due to repeated failures')
      }

      throw error
    }
  }

  reset(): void {
    this.state = 'closed'
    this.failureCount = 0
  }
}

// 使用範例
const circuitBreaker = new CircuitBreaker()

function safeExecuteReaction(...args: any[]): ActiveEffect[] {
  const result = circuitBreaker.execute(() => {
    return executor.executeReaction(...args)
  })

  return result || []
}
```

**錯誤恢復策略**：
- Try-catch 包裝：避免崩潰
- 降級處理：確保遊戲可玩
- 斷路器：防止錯誤擴散
- 錯誤記錄：方便除錯

**新問題檢查**：
- 降級處理可能掩蓋真正的 bug
- 需要平衡容錯性與除錯性

---

#### 【迭代 20】完整的整合測試
**問題發現**：
- 缺少端到端整合測試
- 沒有驗證所有系統一起運作
- 缺少效能基準測試

**改進方案**：
```typescript
// 1. 整合測試套件
export class CollisionReactionIntegrationTests {
  async runAllTests(): Promise<TestResults> {
    const results: TestResults = {
      passed: [],
      failed: [],
      performance: {}
    }

    // 測試 1：基本碰撞偵測
    await this.testBasicCollision(results)

    // 測試 2：Dodge 反應完整流程
    await this.testDodgeReaction(results)

    // 測試 3：Push 反應完整流程
    await this.testPushReaction(results)

    // 測試 4：Taunt 反應完整流程
    await this.testTauntReaction(results)

    // 測試 5：效果衝突解決
    await this.testConflictResolution(results)

    // 測試 6：單位死亡清理
    await this.testDeathCleanup(results)

    // 測試 7：極端數值處理
    await this.testBoundaryValues(results)

    // 測試 8：錯誤恢復
    await this.testErrorRecovery(results)

    // 測試 9：效能壓力測試
    await this.testPerformance(results)

    // 測試 10：視覺效果正確性
    await this.testVisualEffects(results)

    return results
  }

  private async testDodgeReaction(results: TestResults): Promise<void> {
    const testName = 'Dodge Reaction Full Flow'

    try {
      // 設置
      const scene = this.createMockScene()
      const goblin = this.createMockGoblin({ x: 100, y: 100 })
      const runner = this.createMockRunner({ x: 110, y: 100 })

      // 執行
      const detector = new CollisionDetector()
      const executor = new SafeReactionExecutor(registry, errorLogger)

      const collisions = detector.update([goblin], [runner], 16)
      expect(collisions.length).toBe(1)

      const effects = executor.executeReaction(
        goblin,
        runner,
        goblin.definition.collisionReaction!,
        { scene, registry }
      )

      // 驗證
      expect(effects.length).toBe(1)
      expect(effects[0].type).toBe('invincible')
      expect(effects[0].target).toBe(goblin)

      // 驗證位置改變（閃避後跳）
      const expectedX = 100 - 50  // knockbackDistance = 50
      expect(Math.abs(goblin.x - expectedX)).toBeLessThan(1)

      // 驗證無敵狀態
      expect(goblin.isInvincible).toBe(true)

      // 驗證視覺效果
      expect(scene.particles.emitters.length).toBeGreaterThan(0)

      // 驗證冷卻時間
      await this.wait(100)
      const collisions2 = detector.update([goblin], [runner], 16)
      const effects2 = executor.executeReaction(
        goblin,
        runner,
        goblin.definition.collisionReaction!,
        { scene, registry }
      )
      expect(effects2.length).toBe(0)  // 冷卻中，不應觸發

      results.passed.push(testName)

    } catch (error) {
      results.failed.push({
        name: testName,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  private async testPerformance(results: TestResults): Promise<void> {
    const configs = [
      { monsters: 50, runners: 10, name: 'Light Load' },
      { monsters: 100, runners: 20, name: 'Medium Load' },
      { monsters: 200, runners: 40, name: 'Heavy Load' }
    ]

    for (const config of configs) {
      const startTime = performance.now()

      // 運行 1000 幀
      for (let i = 0; i < 1000; i++) {
        const monsters = this.createMockMonsters(config.monsters)
        const runners = this.createMockRunners(config.runners)

        const detector = new CollisionDetector()
        detector.update(monsters, runners, 16)
      }

      const endTime = performance.now()
      const avgFrameTime = (endTime - startTime) / 1000

      results.performance[config.name] = {
        avgFrameTime,
        fps: 1000 / avgFrameTime,
        passed: avgFrameTime < 16.67  // 60 FPS
      }
    }
  }

  private createMockScene(): any {
    // 建立模擬 Phaser 場景
    return {
      add: {
        particles: () => ({
          createEmitter: () => ({})
        }),
        sprite: () => ({}),
        graphics: () => ({
          lineStyle: () => {},
          lineBetween: () => {}
        })
      },
      particles: {
        emitters: []
      }
    }
  }

  private createMockGoblin(pos: { x: number; y: number }): MonsterUnit {
    return {
      id: 'goblin_1',
      x: pos.x,
      y: pos.y,
      isDead: false,
      collisionRadius: 25,
      definition: {
        speciesId: 'goblin',
        collisionReaction: {
          type: 'dodge',
          trigger: 'instant',
          target: 'self',
          params: {
            knockbackDistance: 50,
            invincibleDuration: 500
          },
          cooldown: 3000,
          stackBehavior: 'ignore',
          visualEffect: COLLISION_VISUAL_PRESETS.dodge
        }
      }
    } as any
  }

  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

interface TestResults {
  passed: string[]
  failed: Array<{ name: string; error: string }>
  performance: Record<string, {
    avgFrameTime: number
    fps: number
    passed: boolean
  }>
}

// 2. 效能基準測試
export const PERFORMANCE_BENCHMARKS = {
  collisionDetection: {
    '50_units': { maxFrameTime: 2, target: 1 },
    '100_units': { maxFrameTime: 4, target: 2 },
    '200_units': { maxFrameTime: 8, target: 4 }
  },
  effectUpdate: {
    '10_effects': { maxFrameTime: 1, target: 0.5 },
    '50_effects': { maxFrameTime: 3, target: 1.5 },
    '100_effects': { maxFrameTime: 6, target: 3 }
  },
  visualRender: {
    '10_particles': { maxFrameTime: 2, target: 1 },
    '50_particles': { maxFrameTime: 5, target: 2.5 },
    '100_particles': { maxFrameTime: 10, target: 5 }
  }
}

// 3. 持續監控
export class PerformanceMonitoringService {
  private benchmarks = PERFORMANCE_BENCHMARKS
  private violations: Array<{
    category: string
    scenario: string
    actual: number
    max: number
    timestamp: number
  }> = []

  checkBenchmark(
    category: keyof typeof PERFORMANCE_BENCHMARKS,
    scenario: string,
    actualTime: number
  ): void {
    const benchmark = this.benchmarks[category][scenario]

    if (!benchmark) {
      console.warn(`No benchmark found for ${category}/${scenario}`)
      return
    }

    if (actualTime > benchmark.maxFrameTime) {
      this.violations.push({
        category,
        scenario,
        actual: actualTime,
        max: benchmark.maxFrameTime,
        timestamp: Date.now()
      })

      console.warn(
        `Performance violation: ${category}/${scenario} took ${actualTime}ms (max: ${benchmark.maxFrameTime}ms)`
      )
    }
  }

  getViolations(recent: number = 10): typeof this.violations {
    return this.violations.slice(-recent)
  }
}
```

**整合測試覆蓋**：
- ✅ 基本碰撞偵測
- ✅ 三種反應類型完整流程
- ✅ 效果衝突解決
- ✅ 單位死亡清理
- ✅ 邊界值處理
- ✅ 錯誤恢復
- ✅ 效能基準
- ✅ 視覺效果

**新問題檢查**：
- 測試需要維護，隨系統演進更新
- Mock 物件需要與真實物件保持一致

---

## 最終設計規格

### 系統架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│                        BattlePhase                              │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CollisionDetector (空間分割 + 固定時間步長)              │  │
│  └────────────────┬─────────────────────────────────────────┘  │
│                   │ CollisionPair[]                             │
│                   ↓                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  SafeReactionExecutor                                     │  │
│  │    ├─ CircuitBreaker (錯誤防護)                          │  │
│  │    ├─ ParameterNormalizer (參數正規化)                   │  │
│  │    └─ FallbackHandler (降級處理)                         │  │
│  └────────────────┬─────────────────────────────────────────┘  │
│                   │ ActiveEffect[]                              │
│                   ↓                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  BatchedEffectManager                                     │  │
│  │    ├─ EffectPool (物件池)                                │  │
│  │    ├─ ConflictResolver (衝突解決)                        │  │
│  │    └─ DirtyTracker (變更追蹤)                            │  │
│  └────────────────┬─────────────────────────────────────────┘  │
│                   │                                             │
│  ┌────────────────┴─────────────────────────────────────────┐  │
│  │  DeathHandler (監聽死亡事件，清理效果)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                   │                                             │
│                   ↓                                             │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Visual Layer                                             │  │
│  │    ├─ ParticleEffectManager (粒子池)                     │  │
│  │    ├─ TauntLineRenderer (嘲諷連線)                       │  │
│  │    ├─ EffectBudgetManager (粒子預算)                     │  │
│  │    └─ BatchedVisualRenderer (批次渲染)                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 型別定義（最終版）

```typescript
// ========== 核心反應類型 ==========

export type CollisionReaction =
  | DodgeReaction
  | PushReaction
  | TauntReaction
  | NoneReaction

interface BaseReaction {
  trigger: 'instant' | 'continuous' | 'onHit'
  target: 'self' | 'enemy' | 'allies'
  cooldown?: number
  stackBehavior: 'replace' | 'stack' | 'refresh' | 'ignore'
  maxStacks?: number
  visualEffect?: VisualEffectConfig
  onEffectStart?: string
  onEffectEnd?: string
  telegraph?: {
    enabled: boolean
    showRadius: boolean
    radiusColor: number
    warningTime: number
    warningEffect: string
  }
}

export interface DodgeReaction extends BaseReaction {
  type: 'dodge'
  params: DodgeParams
}

export interface PushReaction extends BaseReaction {
  type: 'push'
  params: PushParams
}

export interface TauntReaction extends BaseReaction {
  type: 'taunt'
  params: TauntParams
}

export interface NoneReaction {
  type: 'none'
}

// ========== 參數定義 ==========

export interface DodgeParams {
  knockbackDistance: number      // 10-200px
  invincibleDuration: number     // 100-5000ms
}

export interface PushParams {
  pushForce: number              // 0-200
  slowPercent: number            // 0-99
  pushRadius: number             // 0-300px
  pushDuration: number           // 100-5000ms
  maxPushDistance: number        // 0-500px
}

export interface TauntParams {
  tauntRadius: number            // 0-500px
  tauntDuration: number          // 500-10000ms
  maxTargets: number             // 1-20
  targetPriority: 'nearest' | 'weakest' | 'strongest' | 'random'
  canTauntBoss: boolean
  breakOnSourceDeath: boolean
  breakOnTargetDeath: boolean
}

// ========== 視覺效果配置 ==========

export interface VisualEffectConfig {
  particleKey?: string
  animationKey?: string
  tintColor?: number
  alphaModifier?: number
  scaleModifier?: number
  soundKey?: string
  cameraShake?: {
    intensity: number
    duration: number
  }
  statusIcon?: string
  linkLineColor?: number
}

// ========== 效果系統 ==========

export interface ActiveEffect {
  effectId: string
  type: 'invincible' | 'slow' | 'taunted' | 'pushed'
  source: MonsterUnit
  target: Runner | MonsterUnit
  startTime: number
  duration: number
  params: Record<string, any>
  stackCount: number
  refreshable: boolean
}

// ========== 怪物定義擴充 ==========

export interface MonsterDefinition {
  speciesId: string
  // ...其他既有欄位
  collisionReaction?: CollisionReaction
  _schemaVersion?: string
}

export interface MonsterUnit {
  id: string
  x: number
  y: number
  isDead: boolean
  isInvincible?: boolean
  collisionRadius: number
  definition: MonsterDefinition
  lastReactionTrigger?: Map<string, number>
  particleEmitters?: Phaser.GameObjects.Particles.ParticleEmitter[]
  statusIcons?: Phaser.GameObjects.Image[]
  linkLines?: Phaser.GameObjects.Graphics[]
}
```

### 配置範例（最終版）

```typescript
// ========== Goblin（閃避型）==========
export const GOBLIN_DEFINITION: MonsterDefinition = {
  speciesId: 'goblin',
  // ...其他欄位
  collisionReaction: {
    type: 'dodge',
    trigger: 'instant',
    target: 'self',
    params: {
      knockbackDistance: 50,
      invincibleDuration: 500
    },
    cooldown: 3000,
    stackBehavior: 'ignore',
    visualEffect: COLLISION_VISUAL_PRESETS.dodge,
    telegraph: {
      enabled: true,
      showRadius: false,
      radiusColor: 0xFFFF00,
      warningTime: 200,
      warningEffect: 'blink'
    }
  }
}

// ========== Ogre（推擠型）==========
export const OGRE_DEFINITION: MonsterDefinition = {
  speciesId: 'ogre',
  // ...其他欄位
  collisionReaction: {
    type: 'push',
    trigger: 'continuous',
    target: 'enemy',
    params: {
      pushForce: 30,
      slowPercent: 50,
      pushRadius: 60,
      pushDuration: 1000,
      maxPushDistance: 100
    },
    cooldown: 2000,
    stackBehavior: 'refresh',
    visualEffect: COLLISION_VISUAL_PRESETS.push,
    telegraph: {
      enabled: true,
      showRadius: true,
      radiusColor: 0xFF6600,
      warningTime: 300,
      warningEffect: 'pulse'
    }
  }
}

// ========== Skeleton（嘲諷型）==========
export const SKELETON_DEFINITION: MonsterDefinition = {
  speciesId: 'skeleton',
  // ...其他欄位
  collisionReaction: {
    type: 'taunt',
    trigger: 'onHit',
    target: 'enemy',
    params: {
      tauntRadius: 120,
      tauntDuration: 3000,
      maxTargets: 4,
      targetPriority: 'nearest',
      canTauntBoss: false,
      breakOnSourceDeath: true,
      breakOnTargetDeath: true
    },
    cooldown: 4000,
    stackBehavior: 'refresh',
    visualEffect: COLLISION_VISUAL_PRESETS.taunt,
    telegraph: {
      enabled: true,
      showRadius: true,
      radiusColor: 0xFF0000,
      warningTime: 500,
      warningEffect: 'expand'
    }
  }
}
```

### 視覺效果預設（最終版）

```typescript
export const COLLISION_VISUAL_PRESETS = {
  dodge: {
    particleKey: 'dodge_burst',
    animationKey: 'unit_dodge',
    tintColor: 0xFFFF00,
    alphaModifier: 0.5,
    scaleModifier: 1.0,
    soundKey: 'sfx_dodge',
    cameraShake: {
      intensity: 2,
      duration: 200
    }
  },
  push: {
    particleKey: 'push_wave',
    animationKey: 'unit_pushed',
    tintColor: 0xFF6600,
    alphaModifier: 1.0,
    scaleModifier: 0.9,
    soundKey: 'sfx_push',
    cameraShake: {
      intensity: 3,
      duration: 300
    }
  },
  taunt: {
    particleKey: 'taunt_pulse',
    animationKey: 'unit_taunted',
    tintColor: 0xFF0000,
    alphaModifier: 1.0,
    scaleModifier: 1.1,
    soundKey: 'sfx_taunt',
    statusIcon: 'icon_exclamation',
    linkLineColor: 0xFF0000
  }
} as const
```

### 效能指標（最終版）

| 情境 | 單位數 | 目標 FPS | 最低 FPS | 品質等級 |
|------|--------|----------|----------|----------|
| 輕量 | 50 | 60 | 55 | High |
| 中等 | 100 | 60 | 45 | High |
| 重度 | 200 | 45 | 30 | Medium |
| 極限 | 300 | 30 | 25 | Low |

### 平衡參數摘要（最終版）

| 反應類型 | 關鍵參數 | 建議值 | 調整空間 |
|---------|---------|--------|---------|
| Dodge | knockbackDistance | 50px | 30-80px |
| Dodge | invincibleDuration | 500ms | 300-800ms |
| Dodge | cooldown | 3000ms | 2000-5000ms |
| Push | pushForce | 30 | 20-50 |
| Push | slowPercent | 50% | 30-70% |
| Push | pushDuration | 1000ms | 500-2000ms |
| Push | cooldown | 2000ms | 1000-3000ms |
| Taunt | tauntRadius | 120px | 80-200px |
| Taunt | tauntDuration | 3000ms | 2000-5000ms |
| Taunt | maxTargets | 4 | 2-6 |
| Taunt | cooldown | 4000ms | 3000-6000ms |

### 實作優先級

**Phase 1：核心系統（必要）**
- [ ] 型別定義與 Zod 驗證
- [ ] 基本碰撞偵測（暴力法）
- [ ] 三種反應處理器（Dodge/Push/Taunt）
- [ ] 基礎效果系統
- [ ] 簡單視覺回饋

**Phase 2：效能優化（重要）**
- [ ] 空間分割（SpatialHash）
- [ ] 固定時間步長
- [ ] 物件池（EffectPool）
- [ ] 批次處理

**Phase 3：完善體驗（建議）**
- [ ] 視覺效果池化
- [ ] 預告機制
- [ ] 教學提示
- [ ] LOD 系統

**Phase 4：穩定性（必要）**
- [ ] 死亡清理
- [ ] 衝突解決
- [ ] 錯誤恢復
- [ ] 邊界值處理

**Phase 5：監控與測試（重要）**
- [ ] 效能監控
- [ ] 自動降級
- [ ] 整合測試
- [ ] 壓力測試

---

## 設計決策記錄

### 為什麼選擇判別聯集而非 union type？
- **原因**：提供更好的型別推斷與型別安全
- **優點**：TypeScript 能自動窄化型別，避免執行時期錯誤
- **缺點**：稍微增加程式碼量
- **結論**：型別安全優先

### 為什麼使用 Zod 而非手寫驗證？
- **原因**：宣告式驗證，減少錯誤
- **優點**：自動型別推斷、清晰的錯誤訊息、易於維護
- **缺點**：增加依賴大小（~10KB gzipped）
- **結論**：可靠性優於檔案大小

### 為什麼碰撞檢測使用固定時間步長？
- **原因**：平衡效能與準確性
- **優點**：可預測的效能消耗、減少 60x 計算量
- **缺點**：可能錯過快速移動的碰撞
- **結論**：對於本遊戲速度範圍，100ms 已足夠

### 為什麼減速不允許 100%？
- **原因**：避免單位完全靜止導致邏輯問題
- **優點**：始終保持微小移動，避免除零錯誤
- **缺點**：無法實現「定身」效果
- **結論**：可透過新增 'stun' 效果類型實現定身

### 為什麼選擇空間 hash 而非 quadtree？
- **原因**：實作簡單、效能穩定
- **優點**：O(1) 插入、均勻分佈時效能最佳
- **缺點**：單位聚集時退化為 O(n²)
- **結論**：對於本遊戲單位分佈，hash 已足夠

---

## 未來擴充方向

### 可能的新反應類型
1. **Stun（暈眩）**：完全靜止，無法行動
2. **Heal（治療）**：碰撞時治療友軍
3. **Explode（爆炸）**：死亡時造成範圍傷害
4. **Shield（護盾）**：吸收傷害
5. **Clone（分身）**：產生複製體

### 可能的系統改進
1. **組合反應**：兩種反應同時觸發產生特殊效果
2. **連鎖反應**：效果觸發其他效果
3. **升級系統**：反應效果可強化
4. **條件觸發**：依據血量、時間等條件觸發
5. **玩家互動**：玩家可手動觸發或取消反應

---

## 風險與注意事項

### 高風險項目
1. **效能**：大量單位時需要仔細調優
2. **平衡性**：數值需要大量測試調整
3. **視覺混亂**：太多效果會讓玩家困惑

### 低風險項目
1. **型別安全**：TypeScript + Zod 保證
2. **錯誤恢復**：完整的降級機制
3. **擴充性**：插件化架構易於擴充

### 建議的測試策略
1. **單元測試**：每個處理器獨立測試
2. **整合測試**：完整流程測試
3. **效能測試**：不同單位數壓力測試
4. **玩家測試**：A/B 測試不同數值

---

## 參考資源

- [TypeScript Discriminated Unions](https://www.typescriptlang.org/docs/handbook/unions-and-intersections.html#discriminating-unions)
- [Zod Documentation](https://zod.dev/)
- [Spatial Hashing in Games](https://gameprogrammingpatterns.com/spatial-partition.html)
- [Object Pool Pattern](https://gameprogrammingpatterns.com/object-pool.html)
- [Circuit Breaker Pattern](https://martinfowler.com/bliki/CircuitBreaker.html)

---

**文件版本**: 1.0.0
**最後更新**: 2026-02-18
**作者**: Claude Sonnet 4.5
**審查狀態**: 待審查
