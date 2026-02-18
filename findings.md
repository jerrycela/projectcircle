# ProjectCircle 程式碼探索筆記

## 日期：2026-02-18
## 目的：理解現有架構，準備實作戰鬥流程重設計

---

## 核心架構

### 場景結構
- `DungeonScene` — 主場景，管理 PhaseManager + DungeonGrid
- `UIScene` — 並行 UI 場景
- `MenuScene` / `BootScene` / `OverviewScene`

### Phase 系統 (phase-manager.ts: 76 行)
- `PhaseType`: EXPLORE | BATTLE | RESULT
- `Phase` 介面: enter() / update() / exit()
- 過渡: camera fadeOut(150ms) → exit → enter → fadeIn(200ms)
- `transitioning` 鎖防止重複切換
- **重要**: 目前無 skipCameraFade 選項

### 事件流 (DungeonScene.ts: 124 行)
```
door-clicked → onDoorClicked() → set breachDirection/roomDistance/conqueredPosition → changePhase(BATTLE)
battle-won → onBattleWon() → set battleResult='won' → changePhase(RESULT)
battle-lost → onBattleLost() → set battleResult='lost' → changePhase(RESULT)
result-complete → onResultComplete() → check victory → changePhase(EXPLORE)
run-over → onRunOver() → MenuScene
```

---

## ExplorePhase (explore-phase.ts: 708 行)

### 成員變數
- `roomGraphics` — 主 Graphics (地板陰影、角柱、石柱光照)
- `roomTileSprites[]` — 7 物件: floor, wallTop/Bottom/Left/Right, ambientGlow, cornerGlows
- `doorObjects[]` — 每扇門 ~8 物件 (TileSprite + GFX + hitArea + 3 層光暈 + 邊框 + 菱形)
- `slotGraphics` — 部署槽位
- `uiElements[]` — 消耗品卡片、標籤、光環等

### cleanup() 現況
- 全部銷毀: roomGraphics → roomTileSprites → slotGraphics → doorObjects (含 killTweensOf) → uiElements
- **無 preserveRoom 參數**

### drawRoom() 產出物件 (需存入 sharedRoomGraphics)
1. roomGraphics (Graphics) — AO 陰影、石柱、高光
2. floor (TileSprite)
3. wallTop/Bottom/Left/Right (4 個 TileSprite)
4. ambientGlow (Circle) — 中央氛圍光 + tween
5. cornerGlow x4 (Circle) — 角落光暈 + tween → 存在 uiElements 中

---

## BattlePhase (battle-phase.ts: 3299 行!)

### 狀態變數 (line 157-233)
- 戰鬥狀態: breachDirection, roomDistance, waveConfig, activeWaves, currentWaveIndex
- 波次控制: heroSpawnQueue, heroSpawnTimer, waveTransitionTimer, allWavesSpawned
- 戰場單位: units[] (BattleUnit), nextUnitId
- 陷阱: trapSystem, trapSprites, pendingTraps, trapPlaceMode
- 部署面板: deployCards[], deployPanelContainer
- 瞄準模式: aimMode, aimMonsterId, aimPreview, aimLine, aimStartPoint, aimPowerText
- 消耗品: allyLimitBonus, unusedHeals, unusedCrystals, crystalsAppliedCount
- 房間渲染: roomGraphics, roomTileSprites[], breachGraphics

### enter() 流程 (line 241-298)
1. resetState()
2. 讀取 breachDirection + roomDistance
3. 查詢 waveConfig (50% variant)
4. 初始化 TrapSystem + Physics groups
5. **drawBattleRoom()** ← 重新繪製整個房間
6. createLaunchPad + createDeployPanel
7. setupInputHandlers
8. applyPurchasedConsumables
9. calculateRoomBonuses
10. playBreachAnimation → spawnChickens → startNextWave

### drawBattleRoom() (line 400-500+)
- 與 ExplorePhase.drawRoom() **幾乎重複** 但略有不同:
  - wallThickness = 6 (ExplorePhase 用 8)
  - 有 vignette corners (ExplorePhase 無)
  - 有飄浮微塵 (ExplorePhase 無)
  - 牆壁內側高光線 (ExplorePhase 也有但用 AO 方式)
- **這就是改動 A 要消除的重複繪製**

### 瞄準系統 (line 2299-2654)
- enterAimMode(monsterId) → 預覽精靈 + 呼吸動畫
- pointermove → 虛線 + 箭頭 + 力度圓環 + 百分比文字
- pointerup → dragDist < 15 取消; 否則 launchMonster(monsterId, angle, power)
- **目前: 一次只射一隻**

### launchMonster() (line 766-860)
- 接受: monsterId, angle, power
- 檢查 allyLimit
- createMonsterUnit → 設定 isLaunching, launchHitSet
- 物理參數: bounce=0.85, 無 collideWorldBounds (手動牆壁反彈)
- 水晶 buff 逐隻消耗
- 視覺: scale 彈出動畫 + 發射台粒子 + 亮閃

### cleanupAll() (line 3211+)
- 銷毀所有: input handlers, units, deploy panel, aim mode, launch pad, room graphics, traps, physics

---

## ResultPhase (result-phase.ts: 1019 行)

### 子階段: summary → evolution → room_selection → done
- summary: 金幣計數動畫 + XP 進度條 + 2s 自動推進 or tap
- evolution: 2 路線卡片選擇
- room_selection: 3 選 1 房間
- onRoomChosen() → grid.conquerRoom + 更新位置 + emit 'result-complete'

### 失敗路徑
- showRunOver() → 暗覆蓋 + 危險光暈 + stats + "再試一次" 按鈕
- emit 'run-over' → DungeonScene → MenuScene

---

## DataRegistry (registry.ts: 298 行)

### 波次配置 (line 244-289)
| roomDistance | waves | 配置 |
|-------------|-------|------|
| 1 | 2 波 | 2+2 adventurer |
| 2 | 2 波 | 3+3 adventurer |
| 3 | 3 波 | 3 + 2adv+1pal + 1pal (有 variant) |
| 4 | 3 波 | 3 + 2adv+1pal + 1pal+2adv (有 variant) |

**改動 D 需修改**: roomDistance 1-2 從 2 波改為 3 波

---

## 常數 (constants.ts: 83 行)
- GAME_WIDTH=390, GAME_HEIGHT=844 (手機尺寸)
- ROOM_WIDTH=350, ROOM_HEIGHT=400
- MAX_ALLIES=5, MAX_ENEMIES=5
- WAVE_INTERVAL=3000ms, ENEMY_SPAWN_INTERVAL=1000ms

---

## 與設計文件的對應關係

| 設計改動 | 涉及的現有程式碼 | 複雜度 |
|---------|----------------|-------|
| A. 原地開戰 | ExplorePhase.drawRoom/cleanup, BattlePhase.drawBattleRoom/enter, PhaseManager.changePhase, DungeonScene.onDoorClicked | 大 |
| B. 機關槍連射 | BattlePhase: enterAimMode, pointerup handler, launchMonster | 中 |
| C. 走廊過場 | DungeonScene.onResultComplete (新增 playCorridorTransition) | 中 |
| D. 波次調整 | DataRegistry.waveConfigs (只改資料) | 小 |
