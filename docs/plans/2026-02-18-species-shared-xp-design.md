# 兵種共享經驗值與升級系統設計（方案 A）

> 日期：2026-02-18
> 專案：ProjectCircle 塔防遊戲
> 狀態：設計完成，待實作

## 目標

為 ProjectCircle 塔防遊戲設計一個簡單清晰的兵種共享經驗池機制，讓同類型兵種共享經驗值、共同升級，並提供即時視覺回饋與跨局遺產加成。

---

## 核心概念

### 1. 經驗值獲取

**機制**：
- 每擊殺 1 隻冒險者，獲得 1 XP
- XP 歸屬於**擊殺者的兵種**（例：哥布林擊殺 → 哥布林兵種獲得 XP）
- 經驗值存入該兵種的**共享經驗池**

**範例**：
```
哥布林 A 擊殺冒險者 → 哥布林兵種 +1 XP
哥布林 B 擊殺冒險者 → 哥布林兵種 +1 XP
骷髏 A 擊殺冒險者 → 骷髏兵種 +1 XP
```

### 2. 升級觸發

**機制**：
- 每累積 10 XP → 兵種升 1 級
- 升級**立即生效**於場上所有該兵種單位（類似星海爭霸升級）
- 新部署的單位自動繼承當前兵種等級

**範例**：
```
哥布林兵種：XP 0/10, Level 1
↓ 擊殺 10 隻冒險者
哥布林兵種：XP 0/10, Level 2（場上 5 隻哥布林立即升級）
```

### 3. 升級數值

| 屬性 | 每級加成 |
|------|---------|
| 最大 HP | +2 |
| 攻擊力 | +1 |
| 經驗需求 | 固定 10 XP/級 |

**範例屬性成長**：
```
哥布林 Level 1：HP 10, ATK 2
哥布林 Level 2：HP 12, ATK 3（+2 HP, +1 ATK）
哥布林 Level 3：HP 14, ATK 4（+2 HP, +1 ATK）
```

### 4. 視覺回饋

**升級特效（立即播放）**：
1. **金色光環**：從單位中心向外擴散，持續 0.8 秒
2. **向上箭頭**：金色箭頭從單位底部向上飄移並淡出
3. **畫面訊息**：中央顯示「Goblin Level 2!」，1.5 秒後淡出
4. **等級徽章**：單位左上角顯示 "Lv.2" 徽章（持續顯示）

**外觀進化（方案 B - 中等明顯）**：

| 等級 | 視覺變化 |
|------|---------|
| Level 1 | 原始外觀（無變化） |
| Level 2 | 輪廓加粗 + 淡金色邊框 |
| Level 3 | 體型放大 10% + 金色邊框 |
| Level 4+ | 每級體型再放大 5%，邊框顏色加深 |

**實作方式**：
- `playUpgradeEffect(unit)` - 播放升級特效動畫
- `showUpgradeMessage(monsterId, level)` - 顯示畫面訊息
- `updateMonsterVisuals(unit, level)` - 調整 sprite scale（體型）和 tint（邊框）

---

## 數據結構設計

### RunState 新增欄位

在 `src/state/game-state.ts` 中為 `RunState` 新增兵種經驗追蹤：

```typescript
export interface RunState {
  // ... 既有欄位
  speciesXP: Record<MonsterId, SpeciesXPData> // 'goblin' -> { xp, level }
}

export interface SpeciesXPData {
  xp: number       // 當前經驗值（0-9 for level 1）
  level: number    // 當前等級（1, 2, 3...）
}

// MonsterId 定義（建議使用字串字面量型別，確保型別安全）
export type MonsterId = 'goblin' | 'skeleton' | 'orc' // ... 其他怪物 ID
// 或者從 MonsterRegistry 中自動推導：
// export type MonsterId = keyof typeof MonsterRegistry
```

**初始化**：
```typescript
export function createInitialRunState(): RunState {
  return {
    // ... 既有欄位
    speciesXP: {}, // 空物件，首次部署時動態建立
  }
}
```

### AccountState 遺產加成

在 `AccountState` 中追蹤歷史最高等級，用於計算遺產加成：

```typescript
export interface AccountState {
  // ... 既有欄位
  speciesHighestLevels: Record<string, number> // 'goblin' -> 3（上局最高達到 Level 3）
}
```

**遺產加成規則**：
- 每個兵種的「歷史最高等級 - 1」= 本局初始 ATK 加成
- 例：哥布林上局達到 Level 3 → 本局所有哥布林起始 ATK +2

**初始化**：
```typescript
export function createInitialAccountState(): AccountState {
  return {
    // ... 既有欄位
    speciesHighestLevels: {}, // 空物件，首次遊戲時為空
  }
}
```

---

## 實作流程

### Phase 1: 數據結構準備

**檔案**：`src/state/game-state.ts`

**修改內容**：
1. 新增 `SpeciesXPData` 介面
2. `RunState` 新增 `speciesXP: Record<string, SpeciesXPData>`
3. `AccountState` 新增 `speciesHighestLevels: Record<string, number>`
4. 更新 `createInitialRunState()` 和 `createInitialAccountState()`

**複雜度**：低

---

### Phase 2: 核心升級邏輯

**檔案**：`src/phases/battle-phase.ts`

**新增方法**：

#### 2.1 經驗值增加
```typescript
private addSpeciesXP(monsterId: string, xp: number): void {
  const gameState = GameStore.getState()
  const currentData = gameState.run.speciesXP[monsterId] || { xp: 0, level: 1 }

  const totalXP = currentData.xp + xp
  const initialLevel = currentData.level

  // 使用數學計算直接得出最終等級（避免大量經驗時的迴圈卡頓）
  const levelsGained = Math.floor(totalXP / 10)
  const currentLevel = initialLevel + levelsGained
  const remainingXP = totalXP % 10

  // 如果有升級，一次性觸發（避免訊息重疊）
  if (currentLevel > initialLevel) {
    this.upgradeSpecies(monsterId, initialLevel, currentLevel)
  }

  // CRITICAL: 使用展開運算符確保不可變性（不直接修改 gameState.run.speciesXP）
  GameStore.updateRun({
    speciesXP: {
      ...gameState.run.speciesXP, // 保留其他兵種的資料
      [monsterId]: { xp: remainingXP, level: currentLevel } // 建立新物件
    }
  })
}
```

#### 2.2 兵種升級
```typescript
private upgradeSpecies(monsterId: string, oldLevel: number, newLevel: number): void {
  console.log(`[BattlePhase] Species ${monsterId} upgraded from Level ${oldLevel} to Level ${newLevel}`)

  // 對場上所有該兵種單位套用升級
  this.applyUpgradeToAllUnits(monsterId, newLevel)

  // 播放升級訊息（只顯示最終等級）
  this.showUpgradeMessage(monsterId, newLevel)

  // 播放升級音效（可選實作）
  // this.scene.sound.play('upgrade_sound')
}
```

#### 2.3 套用升級到所有單位
```typescript
private applyUpgradeToAllUnits(monsterId: string, newLevel: number): void {
  const unitsToUpgrade = this.monsterUnits.filter(u => u.monsterId === monsterId)

  for (const unit of unitsToUpgrade) {
    // 檢查單位有效性（避免存取已死亡或已銷毀的單位）
    if (!unit.sprite || !unit.sprite.active || unit.currentHP <= 0) {
      continue
    }

    // 檢查單位是否有 level 欄位（防禦性編程）
    if (typeof unit.level !== 'number') {
      console.warn(`[BattlePhase] Unit missing level field, monsterId: ${unit.monsterId}`)
      unit.level = 1 // 設定預設值
    }

    // 計算本次升級的屬性增量（避免重複計算）
    const oldLevel = unit.level
    const levelGain = newLevel - oldLevel
    const hpBonus = levelGain * 2
    const atkBonus = levelGain * 1

    // 更新屬性（只加增量）
    const oldMaxHP = unit.maxHP
    unit.maxHP += hpBonus
    unit.atk += atkBonus

    // HP 恢復策略（選擇其一）：
    // 選項 1: 直接加固定值（升級獎勵 HP，類似「治療」效果）
    unit.currentHP += hpBonus
    // 選項 2: 按比例恢復（維持受傷百分比）
    // const hpPercent = unit.currentHP / oldMaxHP
    // unit.currentHP = Math.floor(unit.maxHP * hpPercent)

    unit.level = newLevel // 更新單位等級記錄

    // 播放升級特效
    this.playUpgradeEffect(unit)

    // 更新外觀
    this.updateMonsterVisuals(unit, newLevel)

    // 更新等級徽章
    this.updateLevelBadge(unit, newLevel)
  }
}
```

**修改既有方法**：

#### 2.4 冒險者死亡處理
在 `onAdventurerDeath()` 或相關方法中加入經驗值獎勵：

```typescript
private onAdventurerDeath(adventurer: AdventurerUnit, killer?: MonsterUnit): void {
  // CRITICAL: 經驗值獎勵必須在此處立即處理，不依賴 killer 是否仍存活
  // 這確保了「同歸於盡」情況下經驗值仍然正確給予
  if (killer) {
    // 兵種獲得 1 XP（即使 killer 在下一幀死亡，經驗值已記錄到 speciesXP）
    this.addSpeciesXP(killer.monsterId, 1)
  }

  // ... 既有死亡處理邏輯（移除冒險者、播放死亡動畫等）
}
```

**複雜度**：高

---

### Phase 3: 視覺回饋系統

**檔案**：`src/phases/battle-phase.ts`

**新增方法**：

#### 3.1 播放升級特效
```typescript
// 在 BattlePhase 類別中新增欄位追蹤特效物件
private upgradeEffectTweens: Phaser.Tweens.Tween[] = []

private playUpgradeEffect(unit: MonsterUnit): void {
  const { sprite } = unit

  // 效能優化：限制同時播放的特效數量（避免大量單位同時升級時卡頓）
  // 實際實作時可考慮使用物件池或跳過部分單位的特效

  // 1. 金色光環擴散
  const glow = this.scene.add.circle(sprite.x, sprite.y, 10, 0xffd700, 0.8)
  const glowTween = this.scene.tweens.add({
    targets: glow,
    radius: 40,
    alpha: 0,
    duration: 800,
    onComplete: () => {
      glow.destroy()
      const index = this.upgradeEffectTweens.indexOf(glowTween)
      if (index !== -1) this.upgradeEffectTweens.splice(index, 1)
    }
  })
  this.upgradeEffectTweens.push(glowTween)

  // 2. 向上箭頭
  const arrow = this.scene.add.text(sprite.x, sprite.y, '↑', {
    fontSize: '24px',
    color: '#ffd700'
  }).setOrigin(0.5)
  const arrowTween = this.scene.tweens.add({
    targets: arrow,
    y: sprite.y - 40,
    alpha: 0,
    duration: 1000,
    onComplete: () => {
      arrow.destroy()
      const index = this.upgradeEffectTweens.indexOf(arrowTween)
      if (index !== -1) this.upgradeEffectTweens.splice(index, 1)
    }
  })
  this.upgradeEffectTweens.push(arrowTween)
}

// 在 BattlePhase 的 cleanup/shutdown 方法中清理特效
private cleanupUpgradeEffects(): void {
  for (const tween of this.upgradeEffectTweens) {
    tween.stop()
    tween.remove()
  }
  this.upgradeEffectTweens = []
}
```

#### 3.2 顯示升級訊息
```typescript
private showUpgradeMessage(monsterId: string, level: number): void {
  const monsterName = this.getMonsterDisplayName(monsterId) // 'Goblin', 'Skeleton', etc.

  const camera = this.scene.cameras.main
  const message = this.scene.add.text(
    camera.scrollX + camera.width / 2,
    camera.scrollY + camera.height / 2 - 100,
    `${monsterName} Level ${level}!`,
    {
      fontSize: '32px',
      color: '#ffd700',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }
  ).setOrigin(0.5).setDepth(1000).setScrollFactor(0) // scrollFactor(0) 確保不受相機移動影響

  this.scene.tweens.add({
    targets: message,
    alpha: 0,
    duration: 1500,
    delay: 500,
    onComplete: () => message.destroy()
  })
}

private getMonsterDisplayName(monsterId: string): string {
  // 從 registry 或配置中讀取怪物顯示名稱
  // 實作範例（實際應從 MonsterRegistry 讀取）：
  const displayNames: Record<string, string> = {
    'goblin': 'Goblin',
    'skeleton': 'Skeleton',
    'orc': 'Orc',
    // ... 其他怪物
  }
  return displayNames[monsterId] || monsterId
}
```

#### 3.3 更新怪物外觀
```typescript
private updateMonsterVisuals(unit: MonsterUnit, level: number): void {
  const { sprite } = unit

  if (level === 1) {
    // 原始外觀
    sprite.setScale(1.0)
    sprite.setTint(0xffffff) // 無 tint
  } else if (level === 2) {
    // 輪廓加粗 + 淡金色邊框（使用 stroke 或 tint 模擬）
    sprite.setTint(0xffeeaa) // 淡金色 tint
  } else if (level === 3) {
    // 體型放大 10% + 金色邊框
    sprite.setScale(1.1)
    sprite.setTint(0xffd700) // 金色 tint
  } else {
    // Level 4+：每級體型再放大 5%，邊框顏色加深
    // Level 10+ 停止體型放大（上限 1.45）
    const scaleBonus = Math.min(1.45, 1.1 + (level - 3) * 0.05)
    sprite.setScale(scaleBonus)
    sprite.setTint(0xffaa00) // 深金色 tint
  }
}

private updateLevelBadge(unit: MonsterUnit, level: number): void {
  // 移除舊徽章
  if (unit.levelBadge) {
    unit.levelBadge.destroy()
    unit.levelBadge = undefined
  }

  // 只有 Level 2+ 才顯示徽章
  if (level > 1) {
    const { sprite } = unit
    const badgeBg = this.scene.add.circle(0, 0, 12, 0x333333, 0.8)
    const badgeText = this.scene.add.text(0, 0, `${level}`, {
      fontSize: '10px',
      color: '#ffd700'
    }).setOrigin(0.5)

    unit.levelBadge = this.scene.add.container(
      sprite.x - 15,
      sprite.y - 15,
      [badgeBg, badgeText]
    ).setDepth(100) // 確保徽章始終顯示在單位上方
  }
}
```

**複雜度**：中

---

### Phase 4: UI 顯示元素

**檔案**：`src/phases/battle-phase.ts`

**修改內容**：

#### 4.1 等級徽章顯示
在 `createMonsterUnit()` 或相關單位創建方法中新增等級徽章：

```typescript
private createMonsterUnit(/* ... */): MonsterUnit {
  // ... 既有創建邏輯

  // 讀取當前兵種等級（首次部署時初始化）
  const gameState = GameStore.getState()
  let speciesData = gameState.run.speciesXP[monsterId]

  // 如果是首次部署此兵種，初始化經驗資料
  if (!speciesData) {
    speciesData = { xp: 0, level: 1 }
    GameStore.updateRun({
      speciesXP: {
        ...gameState.run.speciesXP,
        [monsterId]: speciesData
      }
    })
  }

  const level = speciesData.level

  // 計算等級加成（Level 1 沒有加成）
  const levelBonus = level - 1
  const hpBonus = levelBonus * 2
  const atkBonus = levelBonus * 1

  // 讀取遺產等級
  const historyLevel = gameState.account.speciesHighestLevels[monsterId] || 1
  const rawLegacyBonus = Math.max(0, historyLevel - 1) // Level 3 歷史 → +2 ATK
  const legacyBonus = Math.min(5, rawLegacyBonus) // 遺產加成上限 +5 ATK

  // 套用等級加成和遺產加成到基礎屬性
  const baseHP = monsterData.hp // 從 registry 讀取基礎 HP
  const baseATK = monsterData.atk // 從 registry 讀取基礎攻擊力
  const finalHP = baseHP + hpBonus
  const finalATK = baseATK + atkBonus + legacyBonus

  const unit: MonsterUnit = {
    // ... 既有欄位
    maxHP: finalHP,
    currentHP: finalHP,
    atk: finalATK,
    level, // 記錄初始等級
    levelBadge: undefined, // 稍後由 updateLevelBadge 創建
  }

  // 套用初始外觀（如果不是 Level 1）
  if (level > 1) {
    this.updateMonsterVisuals(unit, level)
    this.updateLevelBadge(unit, level) // 統一使用此方法創建徽章
  }

  return unit
}
```

**MonsterUnit 介面修改**：
```typescript
interface MonsterUnit {
  // ... 既有欄位
  level: number // 當前單位等級（用於追蹤升級增量）
  levelBadge?: Phaser.GameObjects.Container
}
```

**徽章位置更新**：
在單位移動或更新時，同步更新徽章位置：

```typescript
private updateMonsterUnit(unit: MonsterUnit, time: number, delta: number): void {
  // ... 既有更新邏輯

  // 更新徽章位置
  if (unit.levelBadge) {
    unit.levelBadge.setPosition(unit.sprite.x - 15, unit.sprite.y - 15)
  }
}
```

**單位銷毀時清理徽章**：
在單位死亡或被移除時，確保徽章一併清理：

```typescript
private destroyMonsterUnit(unit: MonsterUnit): void {
  // 清理等級徽章
  if (unit.levelBadge) {
    unit.levelBadge.destroy()
    unit.levelBadge = undefined
  }

  // 清理 sprite
  unit.sprite.destroy()

  // 從陣列中移除
  const index = this.monsterUnits.indexOf(unit)
  if (index !== -1) {
    this.monsterUnits.splice(index, 1)
  }
}
```

**複雜度**：中

---

### Phase 5: 遺產加成系統

**檔案**：`src/phases/battle-phase.ts`

**修改內容**：

遺產加成的計算已整合到 Phase 4.1 的 `createMonsterUnit()` 方法中（見上方完整實作）。

**遺產加成規則摘要**：
- 讀取 `AccountState.speciesHighestLevels[monsterId]`（歷史最高等級）
- 計算公式：`legacyBonus = max(0, historyLevel - 1)`
- 套用到單位的基礎 ATK：`finalATK = baseATK + atkBonus + legacyBonus`

**複雜度**：低

---

### Phase 6: 結算與持久化

**檔案**：`src/phases/result-phase.ts` 或戰鬥結束相關邏輯

**修改內容**：

#### 6.1 更新歷史最高等級
在戰鬥結束時（勝利或失敗），更新 `AccountState.speciesHighestLevels`：

```typescript
private onBattleEnd(): void {
  const gameState = GameStore.getState()
  const currentSpeciesXP = gameState.run.speciesXP
  const currentHighest = gameState.account.speciesHighestLevels

  // 遍歷所有兵種，更新歷史最高等級
  const updatedHighest = { ...currentHighest }
  for (const [monsterId, data] of Object.entries(currentSpeciesXP)) {
    const currentLevel = data.level
    const historyLevel = updatedHighest[monsterId] || 1

    if (currentLevel > historyLevel) {
      updatedHighest[monsterId] = currentLevel
    }
  }

  // 持久化到 AccountState
  GameStore.updateAccount({
    speciesHighestLevels: updatedHighest
  })
}
```

**複雜度**：低

---

## 主要修改檔案清單

| 檔案 | 修改內容 | 複雜度 |
|------|---------|--------|
| `src/state/game-state.ts` | 新增 `SpeciesXPData` 介面、`RunState.speciesXP`、`AccountState.speciesHighestLevels` | 低 |
| `src/phases/battle-phase.ts` | 經驗系統、升級邏輯、視覺特效、等級徽章、遺產加成 | 高 |
| `src/phases/result-phase.ts` | 更新歷史最高等級持久化 | 低 |
| `src/data/registry.ts` | 為怪物定義 `displayName` 欄位用於升級訊息（或在 BattlePhase 中使用映射表） | 低 |

---

## 驗收標準

### 功能驗收
- [ ] 擊殺冒險者時，擊殺者的兵種獲得 1 XP
- [ ] 累積 10 XP 時，兵種升 1 級
- [ ] 升級時，場上所有該兵種單位立即獲得 +2 HP、+1 ATK
- [ ] 新部署的單位自動繼承當前兵種等級的屬性加成
- [ ] 升級時播放金色光環、向上箭頭、畫面訊息特效
- [ ] Level 2+ 單位顯示等級徽章（"Lv.2"）
- [ ] Level 2: 淡金色 tint，Level 3: 體型放大 10% + 金色 tint，Level 4+: 持續放大 + 深金色 tint
- [ ] 戰鬥結束時，更新歷史最高等級到 `AccountState`
- [ ] 新局開始時，單位基礎 ATK 獲得遺產加成（歷史等級 - 1）

### 技術驗收
- [ ] TypeScript 編譯通過（無錯誤）
- [ ] GameStore 狀態更新符合不可變性原則：
  - [ ] `speciesXP` 更新使用 `{ ...gameState.run.speciesXP, [monsterId]: newData }`
  - [ ] `speciesHighestLevels` 更新使用 `{ ...currentHighest, [monsterId]: newLevel }`
  - [ ] 絕不直接修改 `gameState.run.speciesXP[monsterId].xp`
- [ ] 所有 Phaser tween 動畫在完成後正確銷毀物件（`onComplete: () => obj.destroy()`）
- [ ] 等級徽章在單位移動時同步更新位置（每幀更新）
- [ ] 等級徽章在單位銷毀時一併清理（`destroyMonsterUnit()` 中調用 `destroy()`）
- [ ] 等級徽章 depth 設定正確（depth = 100，確保不被遮擋）

---

## 後續擴充建議

### 短期改進
1. **UI 優化**
   - 在畫面左側顯示「兵種經驗條」UI（類似 RTS 資源面板）
   - 顯示每個兵種的當前等級和經驗進度（例：`Goblin Lv.2 [7/10 XP]`）

2. **音效回饋**
   - 升級時播放「叮！」音效
   - 遺產加成啟用時播放開局特殊音效

### 中長期擴充
1. **特殊能力解鎖**
   - Level 5 解鎖兵種專屬被動技能（例：哥布林 Level 5 攻速 +20%）
   - Level 10 解鎖終極技能（例：骷髏 Level 10 死亡時召喚 2 隻小骷髏）

2. **遺產加成多樣化**
   - 除了 ATK 加成，增加 HP 加成選項（玩家選擇）
   - 達到特定里程碑解鎖永久加成（例：任一兵種達到 Level 10，所有兵種初始金幣 +50）

3. **經驗值來源多樣化**
   - Boss 擊殺獲得 5 XP
   - 完美通關房間（無單位死亡）額外 +3 XP

---

## 注意事項

### 平衡性考量
1. **升級速度**：10 XP/級設計預期 1 個房間（2-3 波）能讓主力兵種升 1-2 級
   - 假設每波 8 隻冒險者，3 波共 24 隻
   - 如果哥布林擊殺 40% → 獲得約 10 XP → 升 1 級
   - 建議調整：若覺得升級太慢，改為 8 XP/級；太快則改為 12 XP/級
2. **遺產加成上限**：已實作上限 +5 ATK（對應歷史 Level 6），避免無限累積導致遊戲失衡
3. **體型放大上限**：已實作 Level 10+ 停止體型放大（scale 上限 1.45），避免單位過大影響戰場佈局

### 技術債務風險
- 如果未來需要支援「單位個體化升級」（非兵種共享），需要重構 `speciesXP` 為 `individualXP`
- 建議在設計文件中明確標註「此系統為兵種共享機制，不支援個體化升級」

### 資料持久化風險
- **中途退出風險**：`onBattleEnd()` 只在戰鬥結束時保存歷史等級，如果玩家中途退出（關閉視窗、當機），本局等級進度可能丟失
- **緩解方案**：
  - 選項 1：每次兵種升級時立即更新 `AccountState.speciesHighestLevels`（實時保存）
  - 選項 2：使用 Phaser 的 `pause`/`shutdown` 事件在遊戲暫停或關閉時保存
  - 選項 3：定期（例如每 30 秒）自動保存歷史等級

---

## 結論

本設計提供一個**簡單、清晰、即時回饋強**的兵種共享經驗系統，符合以下目標：
- ✅ 操作簡單：玩家無需額外操作，系統自動運作
- ✅ 視覺回饋即時：升級特效立即播放，體型/顏色變化明顯
- ✅ 策略深度適中：遺產加成鼓勵重複遊玩，但不會過度複雜
- ✅ 實作風險低：所有修改集中在少數檔案，邏輯清晰

### 建議實作順序

**核心功能優先**（按此順序提交 commit）：
1. **Phase 1**：數據結構準備（無風險，奠定基礎）
2. **Phase 2**：核心升級邏輯（最關鍵，確保功能正常運作）
3. **Phase 6**：結算與持久化（確保資料不丟失）
4. **Phase 5**：遺產加成系統（依賴 Phase 6）

**視覺回饋次之**（可分支並行開發）：
5. **Phase 3**：視覺回饋系統（升級特效、訊息）
6. **Phase 4**：UI 顯示元素（等級徽章，可最後實作）

**驗收檢查**：
- 每個 Phase 完成後執行 `npm run build` 和 `npm test`
- 手動測試升級流程（擊殺 10 隻冒險者 → 確認升級 → 檢查屬性）
- 檢查瀏覽器 Console 是否有錯誤或警告
