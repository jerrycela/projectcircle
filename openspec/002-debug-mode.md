# SPEC-002: Debug 模式（AI QA 專用）

> Status: PROPOSED
> Priority: P0
> Phase: MVP
> Created: 2026-04-06

## 目標

讓 Claude Code 透過 agent-browser / console 快速驗證遊戲功能，實現自動化 QA。

## 設計原則

- 所有 debug 功能都透過 `window.__debug` 全域物件暴露，讓 AI 可用 JavaScript 直接呼叫
- 同時支援快捷鍵（方便人類偶爾手動測試）
- 遊戲狀態可透過 `window.__gameState` 即時讀取，AI 不需要截圖也能驗證數值

## 啟用方式

- URL 加上 `?debug=1` 自動啟用
- `window.__debug.enable()` / `window.__debug.disable()`

## window.__gameState（唯讀狀態快照）

AI 可隨時讀取驗證：

```typescript
window.__gameState = {
  player: {
    x: number, y: number,
    hp: number, maxHp: number,
    mp: number, maxMp: number,
    gold: number,
    materials: { wood: number, ore: number, cloth: number },
    attack: { min: number, max: number },
    speed: number,
    currentRoom: number | null,
  },
  dungeon: {
    floor: number,
    roomCount: number,
    roomsCleared: number,
    totalEnemies: number,
    aliveEnemies: number,
  },
  loot: {
    itemsOnGround: number,
  },
  performance: {
    fps: number,
    bodies: number,  // active physics bodies
  },
}
```

## window.__debug API

AI 用 JavaScript 呼叫來操控遊戲：

```typescript
window.__debug = {
  // 資源操控
  giveGold(amount: number): void,
  giveMaterial(type: string, amount: number): void,
  healFull(): void,           // HP + MP 回滿
  setHp(value: number): void,
  setMp(value: number): void,

  // 戰鬥測試
  spawnEnemies(count: number, type?: string): void,  // 在玩家附近生成
  killAllEnemies(): void,
  setInvincible(on: boolean): void,

  // 掉落測試
  spawnLoot(type: string, rarity?: string): void,  // 在玩家附近生成指定掉落物
  
  // 地圖操控
  teleport(x: number, y: number): void,
  teleportToRoom(roomIndex: number): void,
  // [FUTURE - not in MVP] nextFloor(): void,
  // [FUTURE - not in MVP] revealMap(): void,

  // 顯示輔助
  showColliders(on: boolean): void,
  showRoomBounds(on: boolean): void,
  showAttackRange(on: boolean): void,
  
  // 速度控制
  setGameSpeed(multiplier: number): void,  // 0.5 ~ 3.0

  // 截圖友好
  getStateSnapshot(): object,   // 回傳完整 __gameState
  log(msg: string): void,      // 寫入 console + 畫面 debug overlay
}
```

## 畫面 Debug Overlay（選用顯示）

- 左上角半透明黑底面板
- 顯示 FPS、座標、房間、敵人數、樓層
- 按 ` 鍵 toggle 顯示/隱藏
- AI 不需要這個面板也能透過 __gameState 取值

## 快捷鍵（人類備用）

| 按鍵 | 功能 | 對應 API |
|------|------|----------|
| ` | Toggle overlay | — |
| F1 | 碰撞框 | showColliders |
| F2 | 房間邊界 | showRoomBounds |
| G | +10000 金幣 | giveGold(10000) |
| H | 回滿 HP/MP | healFull() |
| K | 殺全部敵人 | killAllEnemies() |
| N | 下一層 | nextFloor() |

## QA 流程範例

AI 用 agent-browser 開啟 `localhost:5173?debug=1` 後：

```javascript
// 驗證移動：瞬移到特定房間，檢查座標
__debug.teleportToRoom(3);
console.log(__gameState.player.currentRoom); // 應為 3

// 驗證戰鬥：生成敵人，等待自動攻擊，檢查數量減少
__debug.spawnEnemies(5);
// 等幾秒...
console.log(__gameState.dungeon.aliveEnemies); // 應逐漸減少

// 驗證掉落：殺敵後檢查金幣增加
const before = __gameState.player.gold;
__debug.killAllEnemies();
// 等掉落物被吸取...
console.log(__gameState.player.gold > before); // 應為 true

// 驗證 HP 回復：降血 → 生成血球 → 檢查回血
__debug.setHp(100);
__debug.spawnLoot('healthOrb');
// 等自動吸取...
console.log(__gameState.player.hp > 100); // 應為 true
```

## 實作方式

```typescript
class DebugManager {
  // 掛載到 window.__debug 和 window.__gameState
  // GameScene.update() 每幀更新 __gameState
  // 所有操控方法委派給對應的 System/Manager
}
```

- GameScene.create() 結尾初始化（僅 debug=1 時）
- 不侵入遊戲邏輯，純粹讀取/呼叫各 Manager
- production build 可透過環境變數完全移除

## 驗收

- `window.__gameState` 即時反映遊戲狀態
- `window.__debug` 所有 MVP 標記的方法可正常呼叫（FUTURE 標記的方法可為 no-op stub）
- AI 可透過 console 完成完整 QA 流程無需截圖
