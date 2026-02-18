# 戰鬥流程重設計：原地開戰 + 機關槍連射 + 走廊過場

> 日期：2026-02-18
> 狀態：設計中
> 迭代：v30（最終版）

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
  → 清除：doorObjects、slotGraphics、uiElements（消耗品卡片等）
  → 保留：roomGraphics、roomTileSprites（共 8 個物件）

BattlePhase.enter()
  → 讀取 scene.data['sharedRoomGraphics']（不重繪房間）
  → 疊加：發射台、部署面板、暈影、微塵、物理群組

BattlePhase.exit()
  → 清除戰鬥疊加元素（發射台、面板、暈影、微塵、物理群組、所有單位）
  → 不清除房間圖形

ResultPhase → 走廊動畫開始前
  → 銷毀 scene.data['sharedRoomGraphics']（舊房間不再需要）

走廊動畫結束 → ExplorePhase.enter()
  → 為新房間重新繪製房間圖形 → 存入 scene.data['sharedRoomGraphics']
```

### 4.3 sharedRoomGraphics 結構

目前 ExplorePhase 繪製房間時建立的物件清單：

```typescript
interface SharedRoomGraphics {
  roomGraphics: Phaser.GameObjects.Graphics     // 主 Graphics（地板基色、牆壁線條、角柱）
  roomTileSprites: Phaser.GameObjects.GameObject[] // 7 個物件：
    // [0] 地板 TileSprite (FLOOR_TILE 紋理)
    // [1-4] 四面牆壁 TileSprite (BRICK_WALL 紋理)
    // [5] 環境光 Graphics
    // [6] 角落光暈 Graphics
}
```

### 4.4 ExplorePhase.exit() 清理分類

| preserveRoom | 清除 | 保留 |
|--------------|------|------|
| false（預設） | 全部：roomGraphics + roomTileSprites + doorObjects + slotGraphics + uiElements | 無 |
| true（破牆時） | doorObjects（每扇門 8 物件）、slotGraphics、uiElements（消耗品卡片等） | roomGraphics、roomTileSprites |

清除時必須先呼叫 `scene.tweens.killTweensOf()` 殺死門的脈動動畫，再 destroy。

### 4.5 過渡動畫（破牆→戰鬥）

現行流程：
```
門點擊 → emit 'door-clicked' → DungeonScene.onDoorClicked()
  → scene.data.set('breachDirection', direction)
  → PhaseManager.changePhase(BATTLE)（camera fadeOut 150ms → exit → enter → fadeIn 200ms）
```

新流程（取消 camera fade，改用自訂過渡）：
```
門點擊 → emit 'door-clicked' → DungeonScene.onDoorClicked()
  → scene.data.set('breachDirection', direction)
  → 開始自訂過渡序列（不經 PhaseManager 的 camera fade）
```

| 時間軸 | 事件 | 持續時間 |
|--------|------|---------|
| t=0 | 玩家點門，該門白色閃光（已有 250ms 效果） | 250ms |
| t=50ms | 被點的門光暈/難度指示器淡出 | 200ms |
| t=50ms | 其餘門同步淡出 | 200ms |
| t=150ms | 消耗品欄向下滑出（已購買的消耗品已存入 scene.data） | 250ms |
| t=150ms | 部署槽位淡出 | 200ms |
| t=400ms | ExplorePhase.exit({ preserveRoom: true }) | 0ms |
| t=400ms | BattlePhase.enter()（無 camera fade） | 0ms |
| t=400ms | 牆壁破裂動畫（閃光→破口→碎石→震動） | 400ms |
| t=550ms | 消耗品套用 + 房間加成計算 | 0ms |
| t=600ms | 發射台從底部升起 | 250ms |
| t=700ms | 部署面板從底部滑入 | 300ms |
| t=800ms | 第一波敵人從破口生成 | — |

總過渡時間：約 800ms，沉浸感遠勝原本的黑屏切換。

### 4.6 敵人生成位置

敵人從破口座標生成，沿用現有 `getBreachPosition()` 邏輯：

| breachDirection | 破口 X | 破口 Y | 說明 |
|-----------------|--------|--------|------|
| up | ROOM_X + ROOM_WIDTH/2 = 195 | ROOM_Y = 20 | 上牆中央 |
| down | 195 | ROOM_Y + ROOM_HEIGHT = 420 | 下牆中央 |
| left | ROOM_X = 20 | ROOM_Y + ROOM_HEIGHT/2 = 220 | 左牆中央 |
| right | ROOM_X + ROOM_WIDTH = 370 | 220 | 右牆中央 |

敵人以 scale 0→2 的 500ms 動畫出現，每秒生成一隻（ENEMY_SPAWN_INTERVAL=1000ms），場上最多 5 隻（MAX_ENEMIES=5）。此邏輯不需修改。

### 4.7 消耗品與房間加成

消耗品在 ExplorePhase 購買後存入 `scene.data['purchasedConsumables']`，BattlePhase.enter() 時呼叫 `applyPurchasedConsumables()` 套用。此流程不因原地開戰而改變。

房間加成（Treasury 金幣倍數、Training Ground 攻速、Chicken Coop 小雞）同樣在 BattlePhase.enter() 計算。小雞在破牆動畫結束後生成。

### 4.8 陷阱放置

陷阱在戰鬥中放置（非探索階段）。消耗品套用後 `pendingTraps` 計數增加，戰鬥中出現陷阱放置按鈕，玩家點擊房間內位置放置。此流程完全不受原地開戰影響。

### 4.9 實作要點

| 項目 | 改動 |
|------|------|
| ExplorePhase.exit() | 新增 `preserveRoom` 參數，為 true 時只清除 UI 不清除房間（見 4.4 表格） |
| ExplorePhase.drawRoom() | 房間圖形存入 `scene.data['sharedRoomGraphics']` |
| BattlePhase.drawBattleRoom() | 改名為 `setupBattleOverlay()`，跳過房間繪製，只疊加戰鬥元素 |
| BattlePhase.exit() | 只清除戰鬥疊加元素，不碰房間圖形 |
| PhaseManager.changePhase() | 新增 `skipCameraFade` 選項；或由 DungeonScene 直接管理過渡序列 |
| DungeonScene.onDoorClicked() | 觸發自訂過渡序列而非直接 changePhase |

## 5. 改動 B：機關槍連射

### 5.1 核心概念

點卡片 → 拖曳瞄準（跟現在一樣）→ 放開後該類型所有可用怪物以 100ms 間隔同方向連續射出。

### 5.2 連射數量計算

連射數量基於 `run.monsters` 中同 `monsterId` 的實例數：

```typescript
const burstCount = Math.min(
  state.run.monsters.filter(m => m.monsterId === selectedMonsterId).length,
  MAX_ALLIES - currentAliveAllies
)
```

**重要：進化不改變 monsterId**。一隻哥布林進化為刺客後，`monsterId` 仍為 `'goblin'`，進化資訊存在 `MonsterInstance.evolutionPath`（`'A'` 或 `'B'`）。因此同一張部署卡片會把基礎型和進化型都算在連射數量內。

**範例**：玩家擁有 3 隻 goblin（1 隻未進化、1 隻 evolutionPath='A' 刺客、1 隻 evolutionPath='B' 隊長），點哥布林卡片連射會射出 3 隻，每隻根據各自的 `evolutionPath` 透過 `DataRegistry.getEvolutionByPath()` 查詢並套用不同屬性。

### 5.3 連射流程

```
1. 玩家點部署卡片 → enterAimMode(monsterId)
2. 發射台出現預覽精靈（呼吸動畫，alpha 0.7）
3. 拖曳決定方向和力道（現有虛線 + 力度圓環 + 百分比文字）
4. 瞄準線旁額外顯示「x3」badge
5. 放開手指（拖曳 >= 15px 才觸發）
6. 計算 burstCount，建立 burstQueue
7. 排程連射：
   t=0ms    第 1 隻射出
   t=100ms  第 2 隻射出
   t=200ms  第 3 隻射出
   ...
8. 每隻使用相同方向向量和力道
9. 發射台每次射出：
   - 播放閃光 + 輕微震動（camera.shake 80ms, 0.003）
   - 從發射台噴出 3 個方向粒子
10. 卡片 CD 從最後一隻射出後才開始計算
11. burstQueue 清空後 isBursting = false，恢復正常操作
```

### 5.4 與現有瞄準系統的整合

現有瞄準系統的觸控流程完全保留：

| 事件 | 處理 |
|------|------|
| pointerdown | 檢查距離發射台 <= LAUNCH_PAD_RADIUS+30，記錄起點 |
| pointermove | 計算方向/力度，繪製虛線 + 力度圓環 + 箭頭 + 百分比。**新增**：顯示「x{burstCount}」badge |
| pointerup | 拖曳 < 15px 視為誤觸取消。>= 15px 觸發連射（原為單發） |

**「x3」badge 位置**：跟隨瞄準線終點，偏移 (12, -12)，使用 `createTextBadge()` 繪製。

### 5.5 burstQueue 實作

```typescript
interface BurstEntry {
  monsterInstance: MonsterInstance        // 對應 run.monsters 中的實例
  monsterDef: MonsterDefinition          // 基礎定義（DataRegistry.getMonsterById）
  evolution: EvolutionDefinition | null  // 進化定義（DataRegistry.getEvolutionByPath）
}

// BattlePhase 新增欄位
private burstQueue: BurstEntry[] = []
private burstDirection: Phaser.Math.Vector2 | null = null
private burstPower: number = 0
private lastBurstTime: number = 0
private isBursting: boolean = false
```

### 5.6 processBurstQueue 邏輯

```typescript
// 在 update(time, delta) 中呼叫
private processBurstQueue(time: number): void {
  if (!this.isBursting || this.burstQueue.length === 0) return

  // 檢查場上是否已滿
  const aliveCount = this.units.filter(u => u.alive && u.faction === 'ally').length
  if (aliveCount >= MAX_ALLIES + this.allyLimitBonus) {
    this.burstQueue = []
    this.isBursting = false
    return
  }

  // 檢查間隔（使用 scene.time.now，與現有計時一致）
  if (time - this.lastBurstTime < 100) return

  const entry = this.burstQueue.shift()!
  // launchMonster 根據 entry.evolution 決定 HP/ATK/SPD/launchType
  this.launchMonster(entry.monsterDef, this.burstDirection!, this.burstPower, entry.evolution)
  this.lastBurstTime = time

  // 每發視覺回饋
  this.playMuzzleFlash()
  this.scene.cameras.main.shake(80, 0.003)

  if (this.burstQueue.length === 0) {
    this.isBursting = false
    // CD 從此刻開始（使用 scene.time.now）
    const card = this.deployCards.find(c => c.monsterId === entry.monsterDef.id)
    if (card) card.lastDeployTime = this.scene.time.now
  }
}
```

### 5.7 水晶 Buff 與連射的交互

現有邏輯：`unusedCrystals > 0` 時部署怪物自動消耗一顆水晶，攻力 +5。

連射時每隻依序消耗水晶，直到用完。例如 3 隻連射但只有 1 顆水晶，第 1 隻 ATK+5，第 2-3 隻無 buff。此行為自然且無需額外處理。

### 5.8 限制條件

| 條件 | 處理 |
|------|------|
| 場上已有 3 隻，burstCount 為 5 | 最多再射 2 隻（`MAX_ALLIES + allyLimitBonus - aliveCount`） |
| 連射中場上滿了 | 剩餘 burstQueue 清空，isBursting = false |
| 連射中玩家想切換卡片 | 忽略（`isBursting` 為 true 時 enterAimMode 直接 return） |
| 連射中波次結束 | 繼續射完（burstQueue 不因波次變化而取消） |
| 只剩 1 隻該類型怪物 | burstCount=1，退化為單發，行為與現在完全一致 |
| 拖曳 < 15px | 視為誤觸，不觸發連射（沿用現有判斷） |
| 連射中戰鬥結束（勝利/失敗） | 清空 burstQueue，isBursting = false |

### 5.9 連射中的物理行為

連續射出的怪物之間不會直接碰撞（現有盟友碰撞為軟推力分離，separationForce=30，minDist=16px）。100ms 間隔確保物理引擎有足夠時間處理分離，不會堆疊。

彈射中（isLaunching=true）的單位會跳過分離計算，所以即使快速射出也不會互相干擾。

### 5.10 實作要點

| 項目 | 改動 |
|------|------|
| BattlePhase 新增欄位 | `burstQueue`, `burstDirection`, `burstPower`, `lastBurstTime`, `isBursting` |
| update() | 新增 `processBurstQueue(time)` 呼叫 |
| enterAimMode() | 計算並顯示可射數量 badge；`isBursting` 時 return |
| onAimRelease() / pointerup | 不再只射 1 隻，改為填充 burstQueue 並設 isBursting=true |
| launchMonster() | 新增 `evolution` 參數，依據 evolutionPath 套用不同 HP/ATK/SPD/launchType |
| resolveEvolution() | 改為接受 MonsterInstance 參數（而非只看第一個），逐隻查詢 |
| DeployCard UI | 卡片上顯示「x3」等擁有數量 badge |
| pointermove handler | 瞄準線終點旁顯示「x{burstCount}」badge |
| cleanup() | 戰鬥結束時清空 burstQueue、重置 isBursting |

## 6. 改動 C：走廊過場

### 6.1 核心概念

勝利結算完成後，播放一段走廊過場動畫（~1.5s），表現玩家穿越破口進入新房間。

### 6.2 走廊場景結構

```
走廊畫面（全螢幕 390x844）：
┌─────────────────────────────┐
│ ██████████████████████████████│ ← 頂部石牆（TileSprite, BRICK_WALL 紋理, ~80px 高）
│                               │
│  ◯              ◯            │ ← 牆上火把（橘色圓形 + alpha 閃爍）
│                               │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│ ← 石板地面（TileSprite, FLOOR_TILE 紋理, ~500px 高）
│ ▓▓▓▓▓ 向下捲動模擬前進 ▓▓▓▓▓│
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓│
│                               │
│  ◯              ◯            │ ← 下方火把
│                               │
│ ██████████████████████████████│ ← 底部石牆
│                               │
│               [跳過 >]        │ ← 右下角跳過按鈕
└─────────────────────────────┘
```

### 6.3 走廊視覺實作

利用已有的 texture-factory 紋理和 visual-factory 工具：

| 元素 | 實作方式 |
|------|---------|
| 頂部/底部石牆 | `scene.add.tileSprite(x, y, 390, 80, TEXTURE_KEYS.BRICK_WALL)` 並 setScale(3) |
| 中間地面 | `scene.add.tileSprite(x, y, 390, 500, TEXTURE_KEYS.FLOOR_TILE)` 並 setScale(3) |
| 火把 | `scene.add.circle(x, y, 8, 0xff8844)` + alpha tween (0.6-1.0, 100ms) |
| 火把光暈 | `scene.add.circle(x, y, 20, 0xff6622, 0.15)` 半透明暖光 |
| 整體暈影 | visual-factory 的暈影效果，增加隧道感 |
| 跳過按鈕 | `createTextBadge('跳過 >', ...)` 半透明，位於 (330, 800) |

### 6.4 動畫序列

| 時間軸 | 事件 | 持續時間 |
|--------|------|---------|
| t=0 | 結算面板淡出 | 300ms |
| t=300ms | 畫面淡黑（銷毀 sharedRoomGraphics） | 200ms |
| t=500ms | 走廊場景淡入（整體 alpha 0→1） | 200ms |
| t=700ms | 地面 TileSprite.tilePositionY 遞增（模擬前進），速率 3px/frame | 1000ms |
| t=700-1700ms | 火把 alpha 閃爍（隨機 0.6-1.0，每 100ms 更新） | 持續 |
| t=1700ms | 走廊場景淡黑（alpha 1→0） | 200ms |
| t=1900ms | 銷毀走廊物件，切到 ExplorePhase | 0ms |
| t=1900ms | 新房間淡入（PhaseManager fadeIn 200ms） | 200ms |

總持續時間：~2.1s。核心走廊動畫約 1.2s。

### 6.5 實作方式

**推薦方案**：在 DungeonScene 中實作，不新增 Phase。

```typescript
// DungeonScene.ts
private onResultComplete(): void {
  const conqueredCount = this.dungeonGrid.getConqueredCount()
  if (conqueredCount >= DATA_CONSTANTS.VICTORY_ROOM_COUNT) {
    this.scene.stop('UIScene')
    this.scene.start('MenuScene')
    return
  }

  // 插入走廊過場
  this.playCorridorTransition(() => {
    this.phaseManager.changePhase(PhaseType.EXPLORE)
  })
}

private playCorridorTransition(onComplete: () => void): void {
  // 1. 銷毀舊房間圖形
  const shared = this.data.get('sharedRoomGraphics')
  if (shared) {
    shared.roomGraphics?.destroy()
    shared.roomTileSprites?.forEach((s: Phaser.GameObjects.GameObject) => s.destroy())
    this.data.set('sharedRoomGraphics', null)
  }

  // 2. 繪製走廊場景（放入 container 方便統一管理）
  const corridor = this.add.container(0, 0)
  const topWall = this.add.tileSprite(195, 40, 390, 80, TEXTURE_KEYS.BRICK_WALL).setScale(3)
  const floor = this.add.tileSprite(195, 422, 390, 500, TEXTURE_KEYS.FLOOR_TILE).setScale(3)
  const bottomWall = this.add.tileSprite(195, 804, 390, 80, TEXTURE_KEYS.BRICK_WALL).setScale(3)
  // 火把 x4
  const torches = [
    this.add.circle(60, 160, 8, 0xff8844),
    this.add.circle(330, 160, 8, 0xff8844),
    this.add.circle(60, 680, 8, 0xff8844),
    this.add.circle(330, 680, 8, 0xff8844),
  ]
  corridor.add([topWall, floor, bottomWall, ...torches])
  corridor.setAlpha(0)

  // 3. 淡入
  this.tweens.add({
    targets: corridor,
    alpha: 1,
    duration: 200,
    onComplete: () => {
      // 4. 地面捲動
      this.tweens.add({
        targets: floor,
        tilePositionY: floor.tilePositionY + 200,
        duration: 1000,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          // 5. 淡出
          this.tweens.add({
            targets: corridor,
            alpha: 0,
            duration: 200,
            onComplete: () => {
              corridor.destroy(true)
              onComplete()
            }
          })
        }
      })
    }
  })

  // 6. 火把閃爍
  torches.forEach(torch => {
    this.tweens.add({
      targets: torch,
      alpha: { from: 0.6, to: 1.0 },
      duration: 100 + Math.random() * 100,
      yoyo: true,
      repeat: 12,
    })
  })
}
```

### 6.6 跳過按鈕

走廊右下角顯示半透明「跳過 >」文字，pointerup 後立即殺掉所有走廊 tween，淡黑並呼叫 onComplete。避免重複遊玩時的等待疲勞。

## 7. 改動 D：波次數量調整

### 7.1 動機

機關槍連射讓清怪速度大幅提升。若每關只有 2 波，玩家連射兩輪就結束，無法充分體驗爽快感。**每關至少 3 波**能保證：

- 第 1 波：試探性部署，熟悉敵人組成
- 第 2 波：全力連射，體驗機關槍爽感
- 第 3 波：壓力波，可能需要策略性部署

### 7.2 波次配置變更

| roomDistance | 現行 | 新配置 | 敵人總數變化 |
|-------------|------|--------|-------------|
| 1 | 2 波（2+2=4） | **3 波**（2+2+2=6） | +2 |
| 2 | 2 波（3+3=6） | **3 波**（2+3+3=8） | +2 |
| 3 | 3 波（不變） | 3 波（不變） | 0 |
| 4 | 3 波（不變） | 3 波（不變） | 0 |

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

### 7.4 戰鬥節奏分析

以 roomDistance 1（3 波×2 冒險者）為例，配合機關槍連射：

```
t=0s      破牆動畫（0.8s）
t=0.8s    Wave 1 開始：2 冒險者湧入
t=1.8s    2 冒險者全部進場（1s 間隔生成）
t=2-4s    玩家部署+連射+戰鬥
t=~5s     Wave 1 清完
t=5-8s    WAVE_INTERVAL 3s 等待 + Wave 2 開始
t=~11s    Wave 2 清完
t=11-14s  WAVE_INTERVAL 3s + Wave 3 開始
t=~17s    Wave 3 清完 → 勝利
```

每場戰鬥約 17 秒，3 次連射機會，節奏緊湊。

## 8. 資料流變更

### 8.1 完整事件流（Door Click → New Room）

```
[ExplorePhase]
  玩家點門
  → 門閃光效果 (250ms)
  → emit 'door-clicked' { direction, distance }

[DungeonScene.onDoorClicked()]
  → scene.data.set('breachDirection', direction)
  → 開始自訂過渡序列：
    1. 淡出門/槽位/消耗品 (350ms)
    2. ExplorePhase.exit({ preserveRoom: true })
    3. BattlePhase.enter()（無 camera fade）

[BattlePhase.enter()]
  → resetState()
  → 讀取 breachDirection + roomDistance
  → waveConfig 查詢（50% variant）
  → setupBattleOverlay()（疊加戰鬥元素，不重繪房間）
  → setupPhysicsGroups()
  → createLaunchPad() + createDeployPanel()
  → applyPurchasedConsumables()
  → calculateRoomBonuses()
  → playBreachAnimation()
    → spawnChickens()
    → startNextWave()
  → 更新 GameStore battleState.isActive = true

[BattlePhase 戰鬥中]
  → update() 每幀：
    - processBurstQueue(time)      ← 新增
    - updateHeroSpawning(delta)
    - checkLaunchCollisions()
    - checkLaunchLanding()
    - applyAllyEnemySeparation()
    - updateAI(delta)
    - checkWaveComplete()

[勝利]
  → onBattleWon()
    → 勝利 badge + 粒子
    → 1s 後 emit 'battle-won' + BATTLE_WON

[DungeonScene.onBattleWon()]
  → BattlePhase.exit()（清除疊加元素，保留 sharedRoomGraphics）
  → PhaseManager.changePhase(RESULT)

[ResultPhase]
  → 結算面板（金幣+XP）
  → 進化選擇（若有）
  → 房間選擇（3 選 1）
  → onRoomChosen()
    → DungeonGrid.conquerRoom()
    → emit 'result-complete'

[DungeonScene.onResultComplete()]
  → if conqueredCount >= VICTORY_ROOM_COUNT → MenuScene
  → else → playCorridorTransition()
    → 銷毀 sharedRoomGraphics
    → 走廊動畫 (~1.5s)
    → PhaseManager.changePhase(EXPLORE)

[ExplorePhase.enter()]（新房間）
  → drawRoom() → 新的 sharedRoomGraphics
  → drawDoors() 基於新的可破方向
```

### 8.2 失敗路徑

```
[BattlePhase]
  → 所有盟友陣亡 + 無法再部署
  → 3 秒緩衝（ALL_DEAD_BUFFER）
  → onBattleLost()
    → 暗紅覆蓋層 + "失敗..." 文字
    → emit 'battle-lost'

[DungeonScene.onBattleLost()]
  → scene.data.set('battleResult', 'lost')
  → PhaseManager.changePhase(RESULT)
  → BattlePhase.exit()（清除戰鬥元素）

[ResultPhase（失敗）]
  → 顯示 "Run Over" + "Try Again" 按鈕
  → 不走走廊、不佔領房間
  → emit 'run-over'

** sharedRoomGraphics 清理**：
  → 失敗時 BattlePhase.exit() 不清除房間圖形
  → ResultPhase.exit()（或 run-over 回到 MenuScene 時）銷毀所有 scene 資源
  → 若實作 retry（重新開始 run），DungeonScene.create() 重置一切
```

### 8.3 GameStore 狀態變更

不需要新增欄位。`isBursting` 等連射狀態為 BattlePhase 的本地變數，不進入 GameStore。走廊過場期間 `phase` 維持 `'result'`。

## 9. 影響範圍

| 檔案 | 改動程度 | 說明 |
|------|---------|------|
| explore-phase.ts | 中 | exit() 支援 preserveRoom；drawRoom() 存入 sharedRoomGraphics |
| battle-phase.ts | 大 | drawBattleRoom → setupBattleOverlay；新增連射系統（burstQueue + processBurstQueue）；launchMonster 支援逐隻進化屬性；cleanup 清空 burstQueue |
| result-phase.ts | 小 | 無直接改動，走廊由 DungeonScene 在 result-complete 後處理 |
| phase-manager.ts | 中 | 新增 skipCameraFade 選項 |
| dungeon-scene.ts | 大 | 自訂破牆過渡序列；新增 playCorridorTransition()；onResultComplete() 插入走廊 |
| registry.ts | 小 | roomDistance 1-2 波次從 2 改為 3 |

## 10. 風險與對策

| 風險 | 影響 | 對策 |
|------|------|------|
| sharedRoomGraphics 記憶體洩漏 | 中 | 走廊開始前銷毀、ExplorePhase.enter() 重建，每次只存在一份。失敗路徑由 scene 銷毀時清理。 |
| 連射中物理碰撞堆積 | 中 | isLaunching 的單位跳過分離計算；100ms 間隔讓物理引擎有時間處理 |
| burstQueue 與戰鬥結束衝突 | 低 | onBattleWon/onBattleLost 清空 burstQueue 並設 isBursting=false |
| 走廊過場影響遊戲節奏 | 中 | 核心 1.2s + 淡入淡出共 2.1s；加「跳過」按鈕 |
| 進化怪物混合連射屬性錯誤 | 中 | burstQueue 攜帶每隻的 MonsterInstance，launchMonster 逐隻查詢 evolutionPath |
| roomDistance 1 增加到 3 波拖慢早期節奏 | 低 | 每波只有 2 隻，加上連射很快清完；3s 間隔提供節奏感 |
| preserveRoom 時 ExplorePhase 清理不完整 | 中 | 4.4 節明確定義 preserveRoom=true 時的清除/保留清單 |
| 自訂過渡與 PhaseManager 鎖衝突 | 中 | 過渡序列在 DungeonScene 層級管理，繞過 PhaseManager.transitioning 鎖；或擴展 PhaseManager 支援自訂過渡回調 |
| 走廊 TileSprite 紋理縮放後模糊 | 低 | BRICK_WALL/FLOOR_TILE 為 16x16 像素藝術，setScale(3) 後 48x48，Phaser 預設最近鄰插值保持像素風 |
| 連射中手指誤觸觸發其他操作 | 低 | isBursting=true 時所有卡片點擊和瞄準模式進入都被擋住 |
| 水晶 buff 在連射中不均勻分配 | 低 | 自然行為：先射出的先消耗水晶。玩家可透過部署順序控制。 |

## 11. 驗收標準

### 原地開戰
- [ ] 破牆後房間不切換，敵人在同一畫面從破口湧入
- [ ] 門、消耗品欄有淡出動畫（~350ms 內完成）
- [ ] 部署面板和發射台有進場動畫
- [ ] 過渡期間無畫面閃爍或黑屏
- [ ] 消耗品效果正常套用（陷阱/水晶/治療/增援）
- [ ] 房間加成正常計算（金幣倍數/攻速/小雞）
- [ ] 陷阱可正常放置在房間內

### 機關槍連射
- [ ] 點卡片 + 拖曳瞄準後，同類型怪物 100ms 間隔連射
- [ ] 瞄準時顯示可射數量（「x3」badge）
- [ ] 卡片上顯示擁有數量指示
- [ ] 進化怪物套用正確屬性（刺客 SPD+30%、隊長 ATK buff 等）
- [ ] 水晶 buff 逐隻消耗
- [ ] 連射中場上滿員時自動停止剩餘射出
- [ ] 連射中不可切換到其他卡片
- [ ] 卡片 CD 從最後一隻射出後才開始
- [ ] 每發有視覺回饋（閃光 + 震動）
- [ ] 拖曳 < 15px 不觸發連射（防誤觸）

### 走廊過場
- [ ] 勝利結算後走廊過場動畫播放
- [ ] 走廊使用 BRICK_WALL/FLOOR_TILE 紋理
- [ ] 地面向下捲動模擬前進
- [ ] 火把閃爍效果
- [ ] 走廊有「跳過」按鈕，點擊後立即跳過
- [ ] 走廊結束後抵達新房間，可破方向正確

### 波次調整
- [ ] roomDistance 1：3 波（2+2+2 冒險者）
- [ ] roomDistance 2：3 波（2+3+3 冒險者）
- [ ] roomDistance 3-4：保持不變

### 系統穩定性
- [ ] DungeonGrid 位置正確更新
- [ ] 5 個房間後正常觸發勝利（conqueredCount 檢查）
- [ ] 失敗後正確進入 ResultPhase（失敗路徑）
- [ ] sharedRoomGraphics 無記憶體洩漏
- [ ] 走廊物件在動畫結束後銷毀
- [ ] burstQueue 在戰鬥結束時清空
- [ ] TypeScript 編譯零錯誤

## 12. 實作順序建議

建議按以下順序實作，每步都可獨立編譯和測試：

| 順序 | 改動 | 檔案 | 測試方式 |
|------|------|------|---------|
| 1 | 波次調整 | registry.ts | 進入 roomDistance 1-2 的戰鬥，確認 3 波 |
| 2 | 連射系統 | battle-phase.ts | 擁有多隻同類怪物，拖曳後確認連射 |
| 3 | 原地開戰 | explore-phase + battle-phase + phase-manager + dungeon-scene | 破牆後房間不閃爍，UI 正確過渡 |
| 4 | 走廊過場 | dungeon-scene.ts | 勝利後走廊動畫播放，抵達新房間 |

每步完成後都可以獨立測試，不依賴後續步驟。步驟 3 是最複雜的，建議進一步拆分：

```
3a. ExplorePhase.drawRoom() 存入 sharedRoomGraphics
3b. ExplorePhase.exit({ preserveRoom: true }) 實作
3c. BattlePhase.setupBattleOverlay() 取代 drawBattleRoom()
3d. PhaseManager 支援 skipCameraFade
3e. DungeonScene 自訂過渡序列
3f. 整合測試
```
