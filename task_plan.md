# 戰鬥流程重設計 - 實作計畫

> 日期：2026-02-18
> 設計文件：docs/plans/2026-02-18-battle-flow-redesign.md
> 狀態：完成

## 目標

根據設計文件實作四項改動，按建議順序 D → B → A → C 執行。

## 實作順序

| 順序 | 改動 | 檔案 | 複雜度 | 狀態 |
|------|------|------|--------|------|
| 1 | D. 波次調整 | registry.ts | 小 | `complete` |
| 2 | B. 機關槍連射 | battle-phase.ts | 中 | `complete` |
| 3 | A. 原地開戰 | explore-phase + battle-phase + phase-manager + dungeon-scene | 大 | `complete` |
| 4 | C. 走廊過場 | dungeon-scene.ts | 中 | `complete` |

---

## 改動 D：波次數量調整

### 需求
- roomDistance 1：2 波 → 3 波（2+2+2 冒險者）
- roomDistance 2：2 波 → 3 波（2+3+3 冒險者）
- roomDistance 3-4：不變

### 修改檔案
- `src/data/registry.ts` line 244-289（waveConfigs）

### 驗收標準
- [x] roomDistance 1：3 波（2+2+2 冒險者）
- [x] roomDistance 2：3 波（2+3+3 冒險者）
- [x] roomDistance 3-4：保持不變
- [x] TypeScript 編譯通過

---

## 改動 B：機關槍連射

### 修改檔案
- `src/phases/battle-phase.ts`

### 實作內容
- 新增 burst 欄位：burstQueue, burstDirection, burstPower, lastBurstTime, isBursting, burstCountBadge
- processBurstQueue()：100ms 間隔逐隻發射，場上滿則清空佇列，最後一隻射出後設 CD
- pointerup handler：改為建立連射佇列（第一隻立即射出，剩餘排入 burstQueue）
- enterAimMode()：isBursting 時 return；顯示「x{burstCount}」badge
- onDeployCardClicked()：isBursting 時 return
- launchMonster()：新增 evolutionOverride 參數，支援逐隻進化屬性
- createMonsterUnitWithEvolution()：新方法，接受外部指定的 evolution
- onBattleWon/Lost：清空 burstQueue、重置 isBursting
- resetState/cleanupAll：重置/清理所有 burst 狀態

### 驗收標準
- [x] 同類型多隻怪物連射（100ms 間隔）
- [x] 連射中不可切換卡片（isBursting 鎖）
- [x] 場上滿了自動停止連射
- [x] 戰鬥結束清空佇列
- [x] 單隻退化為原有行為
- [x] TypeScript 編譯通過

---

## 改動 A：原地開戰

### 修改檔案
- `src/phases/phase-manager.ts` — PhaseExitOptions, ChangePhaseOptions, skipCameraFade 支援
- `src/phases/explore-phase.ts` — drawRoom() 存入 sharedRoomGraphics, exit(preserveRoom) 支援
- `src/phases/battle-phase.ts` — setupBattleOverlay(), usingSharedRoom 條件清理, battleOverlayElements
- `src/scenes/DungeonScene.ts` — onDoorClicked 使用 skipCameraFade+preserveRoom, destroySharedRoomGraphics()

### 實作內容
- PhaseManager: 新增 PhaseExitOptions/ChangePhaseOptions 介面, skipCameraFade 跳過 camera fade
- ExplorePhase: drawRoom() 結尾存入 scene.data['sharedRoomGraphics'], exit(preserveRoom) 保留/銷毀房間
- BattlePhase: enter() 讀取 sharedRoomGraphics 決定 setupBattleOverlay vs drawBattleRoom, cleanupAll 條件性清理
- DungeonScene: onDoorClicked 使用 {skipCameraFade, preserveRoom}, onResultComplete 銷毀 shared, destroySharedRoomGraphics 方法

### 驗收標準
- [x] ExplorePhase → BattlePhase 無 camera fade 黑屏
- [x] 房間圖形在 phase 切換中保留
- [x] 戰鬥結束後疊加元素正確清理
- [x] 結算完成時共享房間圖形正確銷毀
- [x] 回到 ExplorePhase 時重新繪製新房間
- [x] TypeScript 編譯通過

---

## 改動 C：走廊過場

### 修改檔案
- `src/scenes/DungeonScene.ts` — playCorridorTransition(), onResultComplete 改用走廊過場

### 實作內容
- onResultComplete()：勝利檢查後改呼叫 playCorridorTransition(callback) 而非直接 changePhase
- playCorridorTransition()：Container 包裝走廊場景（上下石牆 + 地面 TileSprite + 火把 x4 + 光暈 + 暈影 + 跳過按鈕）
- 動畫序列：銷毀舊房間 → 走廊淡入(200ms) → 地面捲動(1000ms) → 走廊淡出(200ms) → ExplorePhase
- 火把閃爍：alpha 0.6-1.0 隨機間隔 yoyo 動畫
- 跳過按鈕：createTextBadge('跳過 >')，pointerup 立即殺掉所有 tween 並淡出
- skipped flag 防止重複觸發 onComplete
- 新增 imports：TEXTURE_KEYS, createTextBadge

### 驗收標準
- [x] 結算完成後播放走廊過場動畫（~2.1s）
- [x] 走廊含上下石牆、地面捲動、火把閃爍、暈影
- [x] 跳過按鈕可提前結束過場
- [x] 走廊結束後正確切換到 ExplorePhase
- [x] 舊房間圖形在走廊開始時銷毀
- [x] TypeScript 編譯通過

---

## 錯誤記錄

| 錯誤 | 嘗試 | 解決方式 |
|------|------|---------|
| createTextBadge 簽名不對（TS2345） | 1 | 修正為 (scene, x, y, text, options) 正確參數順序 |
