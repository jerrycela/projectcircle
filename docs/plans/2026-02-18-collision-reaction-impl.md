# 碰撞反應系統 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 怪物被發射砸到敵人時，根據怪物種族觸發特殊碰撞反應（哥布林閃避、骷髏兵推擠、食人魔嘲諷）。

**Architecture:** 在 `schemas.ts` 加入 `CollisionReaction` 型別，加入 `BattleUnit` 的 cooldown 追蹤欄位，在 `checkLaunchCollisions()` 命中後呼叫新的 `applyCollisionReaction()` 方法處理三種反應。不引入 Zod，只用 TypeScript 判別聯集。

**Tech Stack:** TypeScript, Phaser 3 (tweens, setTint, setVelocity)

---

### Task 1：在 schemas.ts 加入 CollisionReaction 型別

**Files:**
- Modify: `src/data/schemas.ts` (MonsterDefinition 介面附近，約第 49 行)

**Step 1：加入型別定義**

在 `schemas.ts` 的 `MonsterDefinition` 介面**之前**插入：

```typescript
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
```

然後在 `MonsterDefinition` 介面加入 optional 欄位：

```typescript
export interface MonsterDefinition {
  readonly id: string
  readonly name: string
  readonly rarity: MonsterRarity
  readonly stats: MonsterStats
  readonly aiType: AIBehaviorType
  readonly deployCooldown: number
  readonly description: string
  readonly tags?: readonly string[]
  readonly collisionReaction?: CollisionReaction  // ← 新增這行
}
```

**Step 2：確認 TypeScript 編譯**

```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit
```

Expected: 無錯誤（只加了 optional 欄位，不影響現有定義）

**Step 3：Commit**

```bash
cd /Users/admin/ProjectCircle
git add src/data/schemas.ts
git commit -m "feat: add CollisionReaction type to schemas"
```

---

### Task 2：為三隻怪物加入碰撞反應定義

**Files:**
- Modify: `src/data/monsters/goblin.ts`
- Modify: `src/data/monsters/skeleton.ts`
- Modify: `src/data/monsters/ogre.ts`

**Step 1：更新 goblin.ts（Dodge 反應）**

```typescript
import type { MonsterDefinition } from '../schemas'

export const goblin: MonsterDefinition = {
  id: 'goblin',
  name: '哥布林',
  rarity: 'common',
  stats: {
    hp: 60,
    attack: 10,
    attackInterval: 1.0,
    moveSpeed: 130,
    attackRange: 30,
    launchType: 'bounce',
  },
  aiType: 'melee_aggressive',
  deployCooldown: 1000,
  description: '靈活走位的近戰輸出，攻擊最弱敵人',
  tags: ['melee', 'dps', 'starter'],
  collisionReaction: {
    type: 'dodge',
    knockbackDistance: 60,
    invincibleDuration: 500,
    cooldown: 3000,
  },
}
```

**Step 2：更新 skeleton.ts（Push 反應）**

```typescript
import type { MonsterDefinition } from '../schemas'

export const skeleton: MonsterDefinition = {
  id: 'skeleton',
  name: '骷髏兵',
  rarity: 'common',
  stats: {
    hp: 45,
    attack: 12,
    attackInterval: 1.8,
    moveSpeed: 0,
    attackRange: 150,
    launchType: 'pierce',
  },
  aiType: 'ranged_stationary',
  deployCooldown: 2000,
  description: '站樁射擊的遠程單位，投擲骨頭攻擊',
  tags: ['ranged', 'stationary'],
  collisionReaction: {
    type: 'push',
    pushForce: 30,
    slowPercent: 50,
    pushDuration: 1000,
    cooldown: 2000,
  },
}
```

**Step 3：更新 ogre.ts（Taunt 反應）**

```typescript
import type { MonsterDefinition } from '../schemas'

export const ogre: MonsterDefinition = {
  id: 'ogre',
  name: '食人魔',
  rarity: 'common',
  stats: {
    hp: 120,
    attack: 12,
    attackInterval: 2.0,
    moveSpeed: 80,
    attackRange: 30,
    launchType: 'bounce',
  },
  aiType: 'melee_tank',
  deployCooldown: 3000,
  description: '高 HP 的前排肉盾，衝向最近敵人吸引火力',
  tags: ['melee', 'tank'],
  collisionReaction: {
    type: 'taunt',
    tauntRadius: 120,
    tauntDuration: 3000,
    maxTargets: 4,
    cooldown: 4000,
  },
}
```

**Step 4：確認 TypeScript 編譯**

```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit
```

Expected: 無錯誤

**Step 5：Commit**

```bash
cd /Users/admin/ProjectCircle
git add src/data/monsters/goblin.ts src/data/monsters/skeleton.ts src/data/monsters/ogre.ts
git commit -m "feat: assign collisionReaction to goblin/skeleton/ogre"
```

---

### Task 3：在 BattleUnit 加入 cooldown 追蹤欄位

**Files:**
- Modify: `src/phases/battle-phase.ts`（BattleUnit 介面，約第 98 行）

**Step 1：在 BattleUnit 介面加入欄位**

找到 `interface BattleUnit {`，在最後的 `launchHitSet` 之後加入：

```typescript
  collisionReactionCooldownUntil: number  // 下次可觸發碰撞反應的時間（Date.now() 為基準，0 = 可觸發）
  isTaunting: boolean                     // 是否正在嘲諷中（避免重複嘲諷）
  isTauntInvincible: boolean             // 閃避無敵中
```

**Step 2：在 `createMonsterUnit()` 的 return 物件加入初始值**

找到 `createMonsterUnit()` 的 return 語句（約第 1135 行），加入：

```typescript
  collisionReactionCooldownUntil: 0,
  isTaunting: false,
  isTauntInvincible: false,
```

**Step 3：在 `createMonsterUnitWithEvolution()` 的 return 物件加入初始值**

找到 `createMonsterUnitWithEvolution()` 的 return 語句（約第 1230 行附近），加入相同三個欄位初始值。

**Step 4：確認 TypeScript 編譯**

```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit
```

Expected: 無錯誤

**Step 5：Commit**

```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: add collision reaction tracking fields to BattleUnit"
```

---

### Task 4：實作 applyCollisionReaction() 方法

**Files:**
- Modify: `src/phases/battle-phase.ts`（在 `checkLaunchCollisions()` 附近加入新方法）

**Step 1：在 `checkLaunchCollisions()` 之後插入新方法**

在 `checkLaunchCollisions()` 結束的 `}` 後面插入：

```typescript
  // ============ 碰撞反應處理 ============

  private applyCollisionReaction(unit: BattleUnit, enemy: BattleUnit): void {
    // 取得怪物定義（由 definitionId 查找，去除進化前綴 "evo_" 找回基底 id）
    const baseId = unit.definitionId.replace(/^evo_/, '')
    const monsterDef = DataRegistry.getMonsterById(baseId) ?? DataRegistry.getMonsterById(unit.definitionId)
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

  private applyDodgeReaction(unit: BattleUnit, enemy: BattleUnit, reaction: import('../data/schemas').DodgeReaction): void {
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

    // 速度在 200ms 後歸零（讓 tween 控制）
    this.scene.time.delayedCall(200, () => {
      if (unit.alive && unit.sprite.active) {
        const b = unit.sprite.body as Phaser.Physics.Arcade.Body
        b.setVelocity(0, 0)
      }
    })

    // 無敵閃白
    unit.isTauntInvincible = true
    unit.sprite.setTint(0xffffff)
    this.scene.tweens.add({
      targets: unit.sprite,
      alpha: { from: 0.5, to: 1.0 },
      duration: reaction.invincibleDuration / 4,
      yoyo: true,
      repeat: 2,
      onComplete: () => {
        if (unit.sprite.active) {
          unit.sprite.clearTint()
          unit.sprite.setAlpha(1)
        }
        unit.isTauntInvincible = false
      },
    })
  }

  private applyPushReaction(unit: BattleUnit, enemy: BattleUnit, reaction: import('../data/schemas').PushReaction): void {
    if (!enemy.sprite.active) return

    // 推擠方向（遠離 unit）
    const dx = enemy.sprite.x - unit.sprite.x
    const dy = enemy.sprite.y - unit.sprite.y
    const len = Math.sqrt(dx * dx + dy * dy) || 1
    const nx = dx / len
    const ny = dy / len

    const enemyBody = enemy.sprite.body as Phaser.Physics.Arcade.Body
    enemyBody.setVelocity(nx * reaction.pushForce * 8, ny * reaction.pushForce * 8)

    // 推擠後減速
    const slowFactor = 1 - (reaction.slowPercent / 100)
    const originalSpeed = enemy.moveSpeed
    enemy.moveSpeed = originalSpeed * slowFactor

    // 紅色提示
    enemy.sprite.setTint(0xff6600)

    // 恢復
    this.scene.time.delayedCall(reaction.pushDuration, () => {
      if (enemy.alive && enemy.sprite.active) {
        enemy.moveSpeed = originalSpeed
        enemy.sprite.clearTint()
        const b = enemy.sprite.body as Phaser.Physics.Arcade.Body
        b.setVelocity(0, 0)
      }
    })
  }

  private applyTauntReaction(unit: BattleUnit, reaction: import('../data/schemas').TauntReaction): void {
    if (unit.isTaunting || !unit.sprite.active) return
    unit.isTaunting = true

    // 找出範圍內的敵人，最多 maxTargets 個
    const enemies = this.units
      .filter(u => u.faction === 'enemy' && u.alive)
      .map(u => {
        const dx = u.sprite.x - unit.sprite.x
        const dy = u.sprite.y - unit.sprite.y
        return { unit: u, dist: Math.sqrt(dx * dx + dy * dy) }
      })
      .filter(({ dist }) => dist <= reaction.tauntRadius)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, reaction.maxTargets)
      .map(({ unit: u }) => u)

    // 嘲諷圈視覺
    const tauntCircle = this.scene.add.circle(
      unit.sprite.x, unit.sprite.y,
      reaction.tauntRadius,
      0xff0000, 0.1
    )
    tauntCircle.setStrokeStyle(2, 0xff0000, 0.6)
    tauntCircle.setDepth(5)

    // 圈圈淡入淡出
    this.scene.tweens.add({
      targets: tauntCircle,
      alpha: { from: 0, to: 1 },
      duration: 200,
    })

    // 對嘲諷目標的 AI 暫時強制追向 unit
    const savedTargets = enemies.map(e => ({ e, savedX: e.ai.targetX, savedY: e.ai.targetY }))
    for (const e of enemies) {
      e.ai.targetX = unit.sprite.x
      e.ai.targetY = unit.sprite.y
      e.sprite.setTint(0xff4444)
    }

    // 持續更新嘲諷目標位置（每 100ms 刷新）
    let elapsed = 0
    const tauntInterval = this.scene.time.addEvent({
      delay: 100,
      repeat: Math.floor(reaction.tauntDuration / 100),
      callback: () => {
        elapsed += 100
        for (const e of enemies) {
          if (e.alive && unit.alive) {
            e.ai.targetX = unit.sprite.x
            e.ai.targetY = unit.sprite.y
          }
        }
        // 跟隨 unit 移動更新圓圈位置
        if (unit.sprite.active) {
          tauntCircle.setPosition(unit.sprite.x, unit.sprite.y)
        }
      },
    })

    // 嘲諷結束
    this.scene.time.delayedCall(reaction.tauntDuration, () => {
      tauntInterval.destroy()
      this.scene.tweens.add({
        targets: tauntCircle,
        alpha: 0,
        duration: 200,
        onComplete: () => tauntCircle.destroy(),
      })
      for (const { e } of savedTargets) {
        if (e.alive && e.sprite.active) {
          e.sprite.clearTint()
        }
      }
      unit.isTaunting = false
    })
  }
```

**Step 2：確認 TypeScript 編譯**

```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit
```

Expected: 無錯誤。若有 import 型別錯誤，改用 `DodgeReaction` 並在檔案頂部加 import。

**Step 3：Commit**

```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: implement applyCollisionReaction with dodge/push/taunt handlers"
```

---

### Task 5：在 checkLaunchCollisions() 的命中後呼叫 applyCollisionReaction

**Files:**
- Modify: `src/phases/battle-phase.ts`（`checkLaunchCollisions()` 方法，約第 2596 行）

**Step 1：找到傷害結算區塊，插入一行**

在 `checkLaunchCollisions()` 中，找到：

```typescript
          this.applyDamage(enemy, impactDamage)
          this.flashWhite(enemy.sprite)
```

在這兩行之後加入：

```typescript
          this.applyCollisionReaction(unit, enemy)
```

完整區塊看起來像這樣：

```typescript
          // 衝撞傷害 = ATK x 速度係數
          const speedFactor = Math.min(speed / 300, 2.0)
          const impactDamage = Math.max(1, Math.floor(unit.atk * speedFactor))
          this.applyDamage(enemy, impactDamage)
          this.flashWhite(enemy.sprite)
          this.applyCollisionReaction(unit, enemy)  // ← 新增
```

**Step 2：確認 TypeScript 編譯**

```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit
```

Expected: 無錯誤

**Step 3：啟動遊戲確認功能**

```bash
cd /Users/admin/ProjectCircle && npm run dev
```

手動測試：
- 發射哥布林砸到敵人 → 哥布林應向後彈飛，短暫閃白閃爍
- 發射骷髏兵砸到敵人 → 敵人被推開，變橘色，移動變慢
- 發射食人魔砸到敵人 → 附近敵人轉向追打食人魔，出現紅色光圈

**Step 4：Commit**

```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: trigger collisionReaction on launch hit in checkLaunchCollisions"
```

---

### Task 6：處理 import 整理與邊界情況

**Files:**
- Modify: `src/phases/battle-phase.ts`（頂部 import，約第 18 行）

**Step 1：在 import 加入 CollisionReaction 相關型別**

找到：

```typescript
import type { HeroDefinition, MonsterDefinition, BattleWaveConfig, WaveDefinition, EvolutionDefinition } from '../data/schemas'
```

改為：

```typescript
import type { HeroDefinition, MonsterDefinition, BattleWaveConfig, WaveDefinition, EvolutionDefinition, DodgeReaction, PushReaction, TauntReaction } from '../data/schemas'
```

**Step 2：移除 Task 4 中的 inline import 語法**

如果在 Task 4 中使用了 `import('../data/schemas').DodgeReaction` 這樣的 inline import 語法，現在把它們改為直接使用 `DodgeReaction`、`PushReaction`、`TauntReaction`。

**Step 3：在戰鬥結束清理中重置 taunt 狀態**

找到 `onBattleWon` 或 `cleanupAll` 或結算後的清理邏輯，在清理 units 之前確保 `isTaunting` 不會殘留（units ��被清空，所以通常不需額外處理，但需確認）。

搜尋：
```bash
grep -n "cleanupAll\|onBattleWon\|onBattleLost" /Users/admin/ProjectCircle/src/phases/battle-phase.ts | head -10
```

**Step 4：最終 TypeScript 編譯確認**

```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit
```

Expected: 無錯誤

**Step 5：最終 Commit**

```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "chore: clean up imports for collision reaction types"
```

---

## 實作注意事項

### definitionId 對應問題
進化後的怪物 `definitionId` 可能是 `"evo_goblin_a"` 之類，需要從進化定義查回基底怪物 id。`applyCollisionReaction()` 中已用 `unit.definitionId.replace(/^evo_/, '')` 處理，但若實際進化 id 格式不同，需調整。

檢查：
```bash
grep -n "fromMonsterId\|evolution.*id\|evo_" /Users/admin/ProjectCircle/src/data/evolution/ | head -20
```

### taunt 的 AI 目標更新
`applyTauntReaction()` 直接修改了 `e.ai.targetX/Y`，這是個快速方案。如果 AI 系統每幀都重新計算目標，嘲諷效果可能被覆蓋。需確認 `ai-system.ts` 的 `targetX/Y` 更新頻率：

```bash
grep -n "targetX\|targetY" /Users/admin/ProjectCircle/src/systems/ai-system.ts | head -20
```

若 AI 每幀重算，改為在 BattleUnit 加 `tauntTarget: BattleUnit | null` 欄位，在 AI 更新邏輯中優先追向 tauntTarget。

---

## 完成定義

- [ ] TypeScript 編譯無錯誤
- [ ] 哥布林發射碰撞後出現彈飛+閃爍效果
- [ ] 骷髏兵發射碰撞後敵人被推開+減速（橘色提示）
- [ ] 食人魔發射碰撞後附近敵人追向食人魔（紅圈+紅色敵人）
- [ ] 每種效果有 CD，不會無限連發
- [ ] 戰鬥結束時無視覺殘留
