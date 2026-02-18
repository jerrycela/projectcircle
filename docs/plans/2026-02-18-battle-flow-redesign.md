# 戰鬥流程重設計：原地開戰 + 機關槍連射 + 走廊過場

> 日期：2026-02-18
> 狀態：設計中
> 迭代：v10（最終版）

## 1. 問題描述

### 問題 A：場景跳轉打斷空間感

目前破牆後畫面整個切換到 BattlePhase，重新繪製一個戰鬥房間。玩家感受不到「敵人入侵我的領地」的壓迫感，反而像是被傳送到一個新場景。

### 問題 B：逐隻彈射操作繁瑣

每隻怪物都要獨立拖曳瞄準、放開彈射，擁有 3+ 隻同類型怪物時操作重複且缺乏爽快感。

### 問題 C：地城擴張邏輯不清

如果永遠在同一個房間防守，玩家的地城版圖無法向外推進。需要在戰鬥勝利後加入「佔領並移動」的步驟。

### 問題 D：早期波次過少

機關槍連射加速清怪後，roomDistance 1-2 只有 2 波敵人，戰鬥節奏太短，玩家還沒享受到連射爽感就結束了。

## 2. 設計目標

1. 戰鬥發生在玩家當前所在的房間，不切場景
2. 同類型怪物一次瞄準、機關槍式連射，操作爽快
3. 勝利後自動佔領對面房間，走廊過場動畫移動到新位置
4. **每關至少 3 波敵人**，確保連射機制有足夠的施展空間
5. 保持現有架構（PhaseManager、DungeonGrid、GameStore）的穩定性

## 3. 新遊戲循環

```
探索 → 準備 → 破牆 → 防禦（3+ 波）→ 結算 → 進化 → 選房間 → 走廊過場 → 探索（新房間）
```

| 步驟 | 階段 | 畫面描述 |
|------|------|---------|
| 1. 探索 | ExplorePhase | 房間 + 四面門 + 部署槽位 + 消耗品欄 |
| 2. 準備 | ExplorePhase | 購買消耗品、查看門難度 |
| 3. 破牆 | ExplorePhase→BattlePhase | 探索 UI 淡出，牆壁破裂動畫 |
| 4. 防禦 | BattlePhase | 敵人從破口湧入（至少 3 波），玩家機關槍連射 |
| 5. 結算 | ResultPhase | 金幣/XP 顯示 |
| 6. 進化 | ResultPhase | 若 XP >= 30，選進化路線 |
| 7. 選房間 | ResultPhase | 為佔領的房間選擇類型 |
| 8. 走廊 | 過場動畫 | 走廊過場動畫 (~1.5s) |
| 9. 抵達 | ExplorePhase | 新房間，新的可破方向 |

## 4. 改動 A：原地開戰

### 4.1 核心概念

ExplorePhase 繪製的房間圖形（地板、牆壁、角柱、環境光）在進入 BattlePhase 時保留不動。BattlePhase 不再呼叫 `drawBattleRoom()`，改為在現有房間上疊加戰鬥元素。

### 4.2 房間圖形所有權轉移

```
ExplorePhase.enter()
  → 繪製房間圖形 → 存入 scene.data['sharedRoomGraphics']
  → 繪製門、槽位、消耗品

ExplorePhase.exit({ preserveRoom: true })
  → 清除門、槽位、消耗品
  → 不清除房間圖形（由 scene.data 持有）

BattlePhase.enter()
  → 讀取 scene.data['sharedRoomGraphics']（不重繪）
  → 疊加：發射台、部署面板、暈影、微塵

BattlePhase.exit()
  → 清除戰鬥疊加元素（發射台、面板、暈影、微塵、物理群組）
  → 不清除房間圖形

ResultPhase → 走廊動畫開始前
  → 銷毀 scene.data['sharedRoomGraphics']（舊房間不再需要）

走廊動畫結束 → ExplorePhase.enter()
  → 為新房間重新繪製房間圖形 → 存入 scene.data['sharedRoomGraphics']
```

### 4.3 sharedRoomGraphics 結構

```typescript
// 存入 scene.data['sharedRoomGraphics'] 的內容
interface SharedRoomGraphics {
  floor: Phaser.GameObjects.Graphics      // 地板
  walls: Phaser.GameObjects.Graphics      // 牆壁
  pillars: Phaser.GameObjects.Graphics    // 角柱
  ambientLight: Phaser.GameObjects.Graphics // 環境光
  vignette?: Phaser.GameObjects.Graphics  // 暈影（ExplorePhase 若有）
}
```

### 4.4 過渡動畫（破牆→戰鬥）

| 時間軸 | 事件 | 持續時間 |
|--------|------|---------|
| t=0 | 玩家點門，被點的門光暈/難度指示器淡出 | 200ms |
| t=0 | 其餘門同步淡出 | 200ms |
| t=100ms | 消耗品欄向下滑出 | 250ms |
| t=100ms | 部署槽位淡出 | 200ms |
| t=350ms | PhaseManager 切換到 BattlePhase（無 camera fade） | 0ms |
| t=350ms | 牆壁破裂動畫（碎石 + 震動） | 400ms |
| t=500ms | 發射台從底部升起 | 250ms |
| t=600ms | 部署面板從底部滑入 | 300ms |
| t=750ms | 第一波敵人開始從破口進入 | — |

總過渡時間：約 750ms，相比原本的 camera fade（~600ms）只多 150ms，但沉浸感大幅提升。

### 4.5 實作要點

| 項目 | 改動 |
|------|------|
| ExplorePhase.exit() | 新增 `preserveRoom` 參數，為 true 時只清除 UI 不清除房間圖形 |
| ExplorePhase.drawRoom() | 房間圖形存入 `scene.data['sharedRoomGraphics']` |
| BattlePhase.drawBattleRoom() | 改名為 `setupBattleOverlay()`，讀取現有房間並疊加戰鬥元素 |
| BattlePhase.exit() | 只清除戰鬥疊加元素，不碰房間圖形 |
| PhaseManager.changePhase() | 新增 `skipCameraFade` 選項，破牆過渡使用自訂淡出序列 |

## 5. 改動 B：機關槍連射

### 5.1 核心概念

點卡片 → 拖曳瞄準（跟現在一樣）→ 放開後該類型所有可用怪物以 100ms 間隔同方向連續射出。

### 5.2 連射數量計算

連射數量基於 `run.monsters` 中同 `monsterId` 的實例數：

```typescript
// 計算某類型可連射數量
const burstCount = Math.min(
  state.run.monsters.filter(m => m.monsterId === selectedMonsterId).length,
  MAX_ALLIES - currentAliveAllies
)
```

**重要：進化不改變 monsterId**。一隻哥布林進化為刺客後，`monsterId` 仍為 `'goblin'`，進化資訊存在 `MonsterInstance.evolutionPath` 中。因此同一張部署卡片會把基礎型和進化型都算在連射數量內。

**範例**：玩家擁有 3 隻 goblin（1 隻未進化、1 隻進化為刺客、1 隻進化為隊長），點哥布林卡片連射會射出 3 隻，每隻根據各自的 `evolutionPath` 套用不同屬性。

### 5.3 連射流程

```
1. 玩家點部署卡片 → 進入瞄準模式
2. 拖曳決定方向和力道（不變）
3. 放開滑鼠/手指
4. 計算可發射數量 burstCount
5. 建立 burstQueue 陣列（包含每隻的 MonsterInstance 引用）
6. 排程連射：
   t=0ms    第 1 隻射出（根據其 evolutionPath 決定屬性）
   t=100ms  第 2 隻射出
   t=200ms  第 3 隻射出
   ...
7. 每隻使用相同方向向量和力道
8. 發射台每次射出播放一次「噠」的閃光 + 輕微震動
9. 卡片 CD 從最後一隻射出後才開始計算
```

### 5.4 burstQueue 實作

```typescript
interface BurstEntry {
  monsterInstance: MonsterInstance   // 對應 run.monsters 中的實例
  monsterDef: MonsterDefinition     // 基礎定義
  evolution: EvolutionDefinition | null  // 進化定義（若有）
}

// BattlePhase 新增欄位
private burstQueue: BurstEntry[] = []
private burstDirection: Phaser.Math.Vector2 | null = null
private burstPower: number = 0
private lastBurstTime: number = 0
private isBursting: boolean = false
```

### 5.5 processBurstQueue 邏輯

```typescript
// 在 update(time, delta) 中呼叫
private processBurstQueue(time: number): void {
  if (!this.isBursting || this.burstQueue.length === 0) return

  // 檢查場上是否已滿
  const aliveCount = this.units.filter(u => u.alive && u.faction === 'ally').length
  if (aliveCount >= MAX_ALLIES) {
    this.burstQueue = []
    this.isBursting = false
    return
  }

  // 檢查間隔
  if (time - this.lastBurstTime < 100) return

  const entry = this.burstQueue.shift()!
  this.launchMonster(entry.monsterDef, this.burstDirection!, this.burstPower, entry.evolution)
  this.lastBurstTime = time
  this.playMuzzleFlash()  // 發射台閃光

  if (this.burstQueue.length === 0) {
    this.isBursting = false
    // CD 從此刻開始
    const card = this.deployCards.find(c => c.monsterId === entry.monsterDef.id)
    if (card) card.lastDeployTime = this.scene.time.now
  }
}
```

### 5.6 瞄準模式 UI 增強

- 瞄準線旁顯示「x3」等數量 badge（白色描邊文字）
- 拖曳時發射台上顯示排隊的怪物圖示（向上堆疊，最多顯示 5 個）
- 連射中卡片顯示倒數（3→2→1）

### 5.7 限制條件

| 條件 | 處理 |
|------|------|
| 場上已有 3 隻，burstCount 為 5 | 最多再射 2 隻（`MAX_ALLIES - aliveCount`） |
| 連射中場上滿了 | 剩餘 burstQueue 清空，isBursting 設為 false |
| 連射中玩家想切換卡片 | 忽略（`isBursting` 為 true 時不允許 enterAimMode） |
| 連射中波次結束 | 繼續射完（burstQueue 不因波次變化而取消） |
| 只剩 1 隻該類型怪物 | 退化為單發，行為與現在完全一致 |

### 5.8 實作要點

| 項目 | 改動 |
|------|------|
| BattlePhase 新增欄位 | `burstQueue`, `burstDirection`, `burstPower`, `lastBurstTime`, `isBursting` |
| update() | 新增 `processBurstQueue(time)` 呼叫 |
| enterAimMode() | 計算並顯示可射數量 badge；`isBursting` 時拒絕進入 |
| onAimRelease() | 不再只射 1 隻，改為填充 burstQueue 並啟動 isBursting |
| launchMonster() | 新增 `evolution` 參數，支援每隻怪物使用不同進化屬性 |
| DeployCard UI | 顯示剩餘可射數量 badge |
| createDeployCard() | 卡片上顯示「x3」等擁有數量指示 |

## 6. 改動 C：走廊過場

### 6.1 核心概念

勝利結算完成後，播放一段走廊過場動畫（~1.5s），表現玩家穿越破口進入新房間。

### 6.2 走廊場景結構

```
走廊畫面（全螢幕，使用程序繪製）：
┌──────────────────────┐
│  ████████████████████ │  ← 頂部石牆（drawPanel 風格）
│                      │
│  *              *    │  ← 牆上火把（圓形 + 閃爍粒子）
│                      │
│   ▓▓▓▓▓▓▓▓▓▓▓▓▓▓   │  ← 石板地面（棋盤格紋理）
│                      │
│  *              *    │
│                      │
│  ████████████████████ │  ← 底部石牆
└──────────────────────┘
```

走廊使用 `visual-factory.ts` 的 `drawPanel()` 繪製石牆質感，火把使用圓形 + alpha 閃爍模擬火光，地面使用交替色塊的棋盤格紋理。

### 6.3 動畫序列

| 時間軸 | 事件 | 持續時間 |
|--------|------|---------|
| t=0 | 結算面板淡出 | 300ms |
| t=300ms | 畫面淡黑（銷毀舊房間 sharedRoomGraphics） | 200ms |
| t=500ms | 走廊場景淡入（石牆 + 火把 + 地面） | 200ms |
| t=700ms | 地面紋理向下捲動（模擬前進） | 1000ms |
| t=700-1700ms | 火把火焰閃爍（隨機 alpha 0.6-1.0，100ms 間隔） | 持續 |
| t=1700ms | 走廊場景淡黑 | 200ms |
| t=1900ms | 新房間 ExplorePhase 淡入 | 200ms |

總持續時間：約 2.1s（包含淡入淡出）。走廊本體動畫約 1.2s。

### 6.4 實作方式

**推薦方案**：不新增 Phase，而是在 PhaseManager 監聽 `'result-complete'` 事件的回調中插入走廊動畫，完成後才切到 ExplorePhase。

```typescript
// dungeon-scene.ts 或 phase-manager.ts
private onResultComplete(): void {
  // 位置已在 ResultPhase.onRoomChosen() 中更新
  this.playCorridorTransition(() => {
    this.phaseManager.changePhase('explore')
  })
}

private playCorridorTransition(onComplete: () => void): void {
  // 1. 銷毀舊房間圖形
  this.destroySharedRoomGraphics()
  // 2. 繪製走廊場景
  const corridor = this.drawCorridorScene()
  // 3. 播放捲動動畫
  this.animateCorridorScroll(corridor, () => {
    // 4. 淡出走廊
    corridor.destroy()
    onComplete()
  })
}
```

### 6.5 跳過按鈕

走廊右下角顯示半透明「跳過 >」按鈕，點擊後立即淡黑並跳到 ExplorePhase。避免重複遊玩時的等待疲勞。

## 7. 改動 D：波次數量調整

### 7.1 動機

機關槍連射讓清怪速度大幅提升。若每關只有 2 波，玩家連射兩輪就結束，無法充分體驗爽快感。**每關至少 3 波**能保證：

- 第 1 波：試探性部署，熟悉敵人組成
- 第 2 波：全力連射，體驗機關槍爽感
- 第 3 波：壓力波，可能需要策略性部署

### 7.2 波次配置變更

| roomDistance | 現行 | 新配置 | 變更說明 |
|-------------|------|--------|---------|
| 1 | 2 波（2+2 冒險者） | **3 波**（2+2+2 冒險者） | 新增第 3 波，維持低難度 |
| 2 | 2 波（3+3 冒險者） | **3 波**（2+3+3 冒險者） | 新增前導波 2 隻，後兩波維持 |
| 3 | 3 波（不變） | 3 波（不變） | 已符合要求 |
| 4 | 3 波（不變） | 3 波（不變） | 已符合要求 |

### 7.3 具體配置（registry.ts）

```typescript
// roomDistance 1（新）
{
  roomDistance: 1,
  totalWaves: 3,
  waves: [
    { waveNumber: 1, entries: [{ heroId: 'adventurer', count: 2 }] },
    { waveNumber: 2, entries: [{ heroId: 'adventurer', count: 2 }] },
    { waveNumber: 3, entries: [{ heroId: 'adventurer', count: 2 }] },
  ],
}

// roomDistance 2（新）
{
  roomDistance: 2,
  totalWaves: 3,
  waves: [
    { waveNumber: 1, entries: [{ heroId: 'adventurer', count: 2 }] },
    { waveNumber: 2, entries: [{ heroId: 'adventurer', count: 3 }] },
    { waveNumber: 3, entries: [{ heroId: 'adventurer', count: 3 }] },
  ],
}
```

### 7.4 難度平衡考量

新增波次不等於增加整體敵人數量很多（roomDistance 1 從 4→6，roomDistance 2 從 6→8），但多了一個完整的戰鬥節拍。WAVE_INTERVAL（3000ms）提供的喘息間隔讓每波都是一個獨立的「機關槍時刻」。

## 8. 資料流變更

### 8.1 完整 Phase 生命週期

```
ExplorePhase.enter()
  → drawRoom() → 存入 scene.data['sharedRoomGraphics']
  → drawDoors(), drawSlots(), drawConsumableBar()

玩家點門 → 過渡動畫開始
  → 淡出門/槽位/消耗品（~350ms）
  → ExplorePhase.exit({ preserveRoom: true })

BattlePhase.enter()
  → setupBattleOverlay()（讀取 sharedRoomGraphics，疊加戰鬥元素）
  → createDeployPanel()（卡片顯示擁有數量）
  → spawnWave()（至少 3 波）

BattlePhase 戰鬥中
  → processBurstQueue()（每幀檢查連射排程）
  → checkLaunchCollisions()（碰撞檢測）
  → checkWaveComplete()（波次完成檢查）

勝利 → BattlePhase.exit()
  → 清除戰鬥疊加元素，保留 sharedRoomGraphics

ResultPhase.enter()
  → 顯示結算（金幣/XP）
  → 進化選擇（若有）
  → 房間選擇

ResultPhase.onRoomChosen()
  → 更新 DungeonGrid.currentPosition
  → emit 'result-complete'

'result-complete' → playCorridorTransition()
  → 銷毀 sharedRoomGraphics
  → 走廊動畫 (~1.5s)
  → callback → ExplorePhase.enter()（新房間）
```

### 8.2 DungeonGrid 位置更新時機

位置更新邏輯不變（在 `ResultPhase.onRoomChosen()` 中完成），只是在 ResultPhase 和 ExplorePhase 之間插入走廊過場。

### 8.3 GameStore 狀態變更

不需要新增欄位。現有的 `phase` 欄位在走廊過場期間可維持 `'result'` 不變。`isBursting` 等連射狀態為 BattlePhase 的本地變數，不進入 GameStore。

## 9. 影響範圍

| 檔案 | 改動程度 | 說明 |
|------|---------|------|
| explore-phase.ts | 中 | exit() 支援 preserveRoom、drawRoom() 存入 sharedRoomGraphics |
| battle-phase.ts | 大 | drawBattleRoom → setupBattleOverlay、連射系統（burstQueue + processBurstQueue）、launchMonster 支援逐隻進化屬性 |
| result-phase.ts | 小 | 結算完觸發走廊動畫回調 |
| phase-manager.ts | 中 | 支援 skipCameraFade、result-complete 後插入走廊動畫 |
| dungeon-scene.ts | 中 | 新增 playCorridorTransition()、drawCorridorScene()、destroySharedRoomGraphics() |
| registry.ts | 小 | roomDistance 1-2 波次從 2 波改為 3 波 |

## 10. 風險與對策

| 風險 | 影響 | 對策 |
|------|------|------|
| sharedRoomGraphics 記憶體洩漏 | 中 | 走廊動畫開始前明確銷毀，ExplorePhase.enter() 重建。每次只存在一份。 |
| 連射中物理碰撞堆積 | 中 | 每隻射出時才加入 physics group；連射間隔 100ms 讓物理引擎有時間分離 |
| burstQueue 與波次轉換衝突 | 低 | 連射不受波次影響，burstQueue 獨立運作 |
| 走廊過場影響遊戲節奏 | 中 | 控制在 ~1.5s，加「跳過」按鈕，重複遊玩時可快速通過 |
| 進化怪物混合連射的屬性錯誤 | 中 | launchMonster 接收每隻的 MonsterInstance，根據 evolutionPath 個別查詢 |
| roomDistance 1 增加到 3 波可能拖慢早期節奏 | 低 | 每波只有 2 隻冒險者，加上連射很快就清完；WAVE_INTERVAL=3s 提供節奏感 |
| preserveRoom 時 ExplorePhase 清理不完整 | 中 | 明確列出 preserveRoom=true 時要清除和保留的圖形物件清單 |

## 11. 驗收標準

### 原地開戰
- [ ] 破牆後房間不切換，敵人在同一畫面湧入
- [ ] 門、消耗品欄有淡出動畫（~350ms 內完成）
- [ ] 部署面板和發射台有進場動畫
- [ ] 過渡期間無畫面閃爍或黑屏

### 機關槍連射
- [ ] 點卡片 + 拖曳瞄準後，同類型怪物 100ms 間隔連射
- [ ] 瞄準時顯示可射數量（「x3」badge）
- [ ] 進化怪物套用正確屬性（刺客速度 +30%、隊長近戰加成等）
- [ ] 連射中場上滿員時自動停止剩餘射出
- [ ] 連射中不可切換到其他卡片
- [ ] 卡片 CD 從最後一隻射出後才開始

### 走廊過場
- [ ] 勝利結算後走廊過場動畫 ~1.5s（可接受 1.2-2.1s）
- [ ] 走廊有「跳過」按鈕
- [ ] 走廊結束後抵達新房間，可破方向正確

### 波次調整
- [ ] roomDistance 1：3 波（2+2+2 冒險者）
- [ ] roomDistance 2：3 波（2+3+3 冒險者）
- [ ] roomDistance 3-4：保持不變

### 系統穩定性
- [ ] DungeonGrid 位置正確更新
- [ ] 5 個房間後正常觸發勝利
- [ ] sharedRoomGraphics 無記憶體洩漏（走廊前銷毀、新房間重建）
- [ ] TypeScript 編譯零錯誤

## 12. 實作順序建議

建議按以下順序實作，每步都可獨立編譯和測試：

1. **波次調整**（registry.ts）— 最小改動，立即可測
2. **連射系統**（battle-phase.ts）— 核心玩法改動，需充分測試
3. **原地開戰**（explore-phase + battle-phase + phase-manager）— 涉及多檔案協作
4. **走廊過場**（dungeon-scene.ts）— 純視覺，最後加入

每步完成後都可以獨立測試，不依賴後續步驟。
