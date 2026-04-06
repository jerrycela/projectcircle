# SPEC-001: MVP 核心遊戲玩法

> Status: PROPOSED → REVISED (R2)
> Priority: P0
> Phase: MVP
> Created: 2026-04-06
> Revised: 2026-04-06 — 修正雙審 P1x3 + P2x7

## 目標

建立可玩的最小原型：玩家在大型地圖中用虛擬搖桿移動，角色自動攻擊進入範圍的敵人，敵人也會攻擊玩家，掉落物自動收集。

## 範圍

### 包含
- 專案結構與 Phaser 3 初始化
- 程序化地圖生成（Rooms & Corridors）
- 玩家移動（虛擬搖桿 + WASD）
- 攝影機跟隨 + 世界邊界
- 自動索敵攻擊系統
- **敵人攻擊玩家 + 受傷/死亡迴圈**
- 敵人生成與 AI（房間伏擊制）
- 掉落物系統（自動收集）
- 基礎 HUD（HP、MP、金幣、樓層）
- **全域事件中心（Scene 間通訊）**

### 不包含（後續 Spec）
- 裝備穿戴 / 紙娃娃系統
- 鍛造台
- 夥伴育成系統
- 天賦升級面板
- 樓層推進
- 戰爭迷霧
- 商店 / 裝備欄 UI

## 技術架構

```
src/
  main.ts              # Phaser Game 初始化
  config.ts            # 遊戲常數與設定
  scenes/
    BootScene.ts       # 資源預載
    GameScene.ts       # 主遊戲場景
    UIScene.ts         # HUD 疊加層
  entities/
    Player.ts          # 玩家（Container 架構，預留紙娃娃）
    Enemy.ts           # 敵人基礎類別
    Loot.ts            # 掉落物基礎類別
  systems/
    DungeonGenerator.ts # 程序化地牢生成
    CombatSystem.ts     # 索敵與自動攻擊（含敵人攻擊玩家）
    LootSystem.ts       # 掉落生成與自動收集
    StatsManager.ts     # 數值管理
    EventBus.ts         # 全域事件中心
  ui/
    Joystick.ts         # 虛擬搖桿
    HUD.ts              # HP bar、金幣、樓層顯示
  utils/
    MathUtils.ts        # 距離計算等工具函式
```

## 系統設計契約

### 全域事件中心（EventBus）
- 獨立的 Phaser.Events.EventEmitter 實例
- GameScene 中的系統發出事件，UIScene 監聽更新
- 事件列表：
  - `player-hp-changed` (current, max)
  - `player-mp-changed` (current, max)
  - `player-gold-changed` (amount)
  - `player-material-changed` (type, amount)
  - `enemy-killed` (enemyType)
  - `player-died`
  - `room-entered` (roomIndex)

### Player Container 碰撞盒契約
- Container 本體透過 `scene.physics.world.enable(container)` 掛載 Arcade body
- body 尺寸：`body.setSize(32, 32)` + `body.setOffset(-16, -16)`（以 Container 原點為中心）
- 所有子節點（baseSprite、weaponSprite 等）純視覺，不參與 physics
- 碰撞對象：牆壁 StaticGroup、敵人 Group

### 敵人導航契約（P1 修正）
- 敵人與牆壁設定 collider（不允許穿牆）
- 敵人只在所屬房間內追擊，不跨房追蹤
- 追擊方式：`moveToObject`（Arcade Physics 會自然處理碰牆滑動）
- 敵人被牆卡住時：持續嘗試 moveToObject，Arcade 碰撞會產生滑動效果
- 敵人狀態機：`IDLE → CHASING → ATTACKING → KNOCKBACK → CHASING`
  - IDLE：未偵測到玩家（房間未觸發）
  - CHASING：玩家在同房間內，moveToObject 追蹤
  - ATTACKING：接觸玩家，造成傷害，攻擊冷卻
  - KNOCKBACK：受擊後短暫停止 AI（200ms），然後回 CHASING

### 虛擬搖桿契約（P2 修正）
- deadZone：5px（低於此距離不產生輸入）
- maxRadius：60px（搖桿最大拖拽半徑）
- 鬆手回正：釋放指標後搖桿歸位，速度歸零
- 輸入優先：鍵盤與搖桿同時輸入時，以最後產生輸入的為準
- 對角線正規化：斜向移動速度 = 正向速度（normalize 向量）

### 房間狀態機（P2 修正）
```typescript
enum RoomState { UNVISITED, ACTIVE, CLEARED }
```
- UNVISITED → ACTIVE：玩家座標進入 Room 矩形範圍（含走廊入口 padding 32px）
- ACTIVE → CLEARED：房間內所有敵人 HP <= 0
- 敵人 spawn safety：生成點距離玩家 >= 100px，距離牆壁 >= 32px

## 實作任務

### Task 1: 專案骨架與場景初始化
- Phaser Game config（800x600 畫面，Arcade Physics）
- BootScene：生成佔位符 texture（Graphics API）
- GameScene：空白場景可啟動
- UIScene：parallel 疊加在 GameScene 上
- EventBus：獨立模組，export 單例

**驗收**：`npm run dev` 可看到黑色畫面，console 無錯誤
**QA**：`window.__gameState` 回傳有效物件

### Task 2: 程序化地圖生成
- DungeonGenerator：Rooms & Corridors 演算法
  - 輸入：地圖寬高（grid 單位）、房間數量範圍、房間大小範圍
  - 輸出：2D number[][]（0=地板、1=牆壁）
  - 附帶 Room 資訊陣列（x, y, width, height, state: RoomState）
- **連通性保證（P2 修正）**：
  - 房間按生成順序鏈式連接（Room[0]→Room[1]→...→Room[N]）
  - 走廊用 L 型挖通（先水平後垂直）
  - 生成完畢後 flood fill 驗證：從 Room[0] 中心開始，所有 Room 中心必須可達
  - 驗證失敗 → 丟棄重新生成（最多重試 10 次）
- GameScene 中將 grid 實體化
  - 地板：深灰 #2c2c2c 方塊（64x64）
  - 牆壁：深色 #1a1a1a StaticGroup（帶碰撞）
- 設定 physics.world.setBounds 與 cameras.main.setBounds

**驗收**：每次重新整理看到不同的地牢佈局，牆壁有碰撞
**QA**：`__debug.teleportToRoom(N)` 可到達任意房間（連通性驗證）；`__gameState.dungeon.roomCount` 在範圍內

### Task 3: 玩家移動與攝影機
- Player 類別（繼承 Container，預留分層結構）
  - 佔位符：40x40 藍色矩形 + 灰色武器長條
  - Arcade Physics body：`setSize(32,32)` + `setOffset(-16,-16)`
  - 子節點純視覺不參與碰撞
  - collideWorldBounds + 與牆壁 StaticGroup 碰撞
- 虛擬搖桿（螢幕左下角）
  - deadZone 5px、maxRadius 60px、鬆手歸零
  - 對角線正規化
- WASD / 方向鍵 鍵盤控制
- 輸入優先：最後輸入源為準
- 攝影機 startFollow（lerp 0.1）
- 玩家生成於第一個房間中央

**驗收**：搖桿與鍵盤都能移動，撞牆會停，攝影機平滑跟隨
**QA**：移動後 `__gameState.player.x/y` 變化；瞬移到牆壁座標確認被推回

### Task 4: 敵人系統
- Enemy 類別
  - 蜘蛛佔位符：暗紅圓形 #8b0000（半徑 15px）
  - HP 屬性
  - 狀態機：IDLE / CHASING / ATTACKING / KNOCKBACK
  - CHASING：moveToObject 追蹤，與牆壁 collider（不穿牆）
  - 只在所屬房間內追擊
- 房間伏擊制
  - 偵測玩家座標進入 Room 矩形範圍
  - RoomState UNVISITED → ACTIVE：在 Floor tiles 生成 3~6 隻敵人
  - spawn safety：距玩家 >= 100px，距牆 >= 32px
  - ACTIVE → CLEARED：全部敵人死亡
  - CLEARED 房間不再生成
- Enemy Group + Object Pooling

**驗收**：進入新房間時敵人出現並追蹤玩家，不穿牆
**QA**：`__debug.teleportToRoom(N)` → `__gameState.dungeon.aliveEnemies > 0`；`__debug.teleportToRoom(已清房間)` → 不生成新敵人

### Task 5: 自動戰鬥系統（含敵人攻擊，P1 修正）
- 索敵圈視覺：半透明白色圓圈（半徑 150px、alpha 0.3）跟隨玩家
- CombatSystem：每 250ms 掃描圈內最近敵人（throttle 優化）
  - **觸發條件：玩家靜止時才自動攻擊（移動中不攻擊）**
  - 「停下來打 → 移動閃避 → 停下來打」的戰鬥節奏
  - Phaser.Math.Distance.Between
  - 攻擊冷卻（預設 0.8 秒）
- 玩家攻擊觸發時：
  - 武器揮砍動畫（白色弧形，0.15 秒淡出）
  - 傷害計算（Attack 範圍隨機 + 爆擊判定）
  - 浮動傷害數字（白色一般 / 綠色爆擊，向上飄 50px，0.5 秒淡出）
  - 敵人受擊（紫色粒子 #4b0082 + 微小擊退 + 白光閃爍）
  - 敵人進入 KNOCKBACK 狀態（200ms 暫停 AI）
  - HP <= 0 → 死亡 → 觸發掉落
- **敵人攻擊玩家（P1 新增）**：
  - 敵人接觸玩家（overlap 或距離 < 30px）→ 進入 ATTACKING 狀態
  - 造成 SPIDER_ATTACK 傷害，攻擊冷卻 1.5 秒
  - 玩家受擊：畫面紅色閃爍（camera flash #ff0000 alpha 0.3，100ms）
  - 玩家受擊無敵幀：500ms 內不再受傷（alpha 閃爍表示）
  - 玩家 HP <= 0 → 發出 `player-died` 事件 → 畫面暫停 → 顯示「你死了」
  - 死亡後選項：「重新開始」（重置所有狀態，重新生成地牢）

**驗收**：敵人進圈自動攻擊，傷害數字顯示，死亡消失；敵人碰到玩家會扣血，玩家可死亡
**QA**：`__debug.setHp(1)` → 讓敵人碰到 → `player-died` 事件觸發；`__debug.setInvincible(true)` → 不扣血

### Task 6: 掉落物與自動收集
- 敵人死亡時掉落（機率表，可同時掉多種）：
  - 金幣（80%）：金色小圓 #ffcc00
  - 木材（40%）：棕色方塊
  - 礦石（25%）：灰色菱形
  - 布料（20%）：白色三角
  - 血球（15%）：紅色圓形，拾取回復 HP
  - 裝備（3%）：依稀有度顏色框（白/綠/藍/紫）
- 掉落物帶上下浮動動畫
- 自動收集：玩家靠近 80px → Tween 飛向玩家 → 收集 → 更新 StatsManager → 發出對應事件

**驗收**：殺敵後地上出現掉落物，靠近自動吸取，數值正確增加
**QA**：`__debug.spawnLoot('gold')` → 靠近 → `__gameState.player.gold` 增加；`__debug.spawnLoot('healthOrb')` + `__debug.setHp(100)` → 吸取後 HP > 100

### Task 7: 基礎 HUD
- UIScene（parallel 疊加，ScrollFactor 0）
- 透過 EventBus 監聽數值變化事件更新顯示
- 左上：綠色 HP Bar + 白色文字（當前/最大 HP）
- 左上下方：藍色 MP Bar + 白色文字
- 右上：金幣數量 + 素材數量
- 左上角：「地下 1 層」文字

**驗收**：HUD 不隨攝影機移動，數值即時更新
**QA**：`__debug.giveGold(100)` → HUD 金幣數字增加；移動玩家 → HUD 位置不變

## 數值設定

```typescript
const GAME_CONFIG = {
  // 地圖
  TILE_SIZE: 64,
  MAP_WIDTH: 50,   // grid 單位 = 3200px
  MAP_HEIGHT: 50,
  ROOM_COUNT: { min: 6, max: 10 },
  ROOM_SIZE: { min: 5, max: 10 },

  // 玩家
  PLAYER_HP: 306,
  PLAYER_MP: 100,
  PLAYER_ATTACK: { min: 26, max: 38 },
  PLAYER_CRIT_CHANCE: 0.05,
  PLAYER_CRIT_DAMAGE: 1.35,
  PLAYER_SPEED: 200,        // pixels/sec
  PLAYER_MP_REGEN: 2,       // per second
  PLAYER_INVINCIBLE_MS: 500, // 受擊無敵幀

  // 戰鬥
  ATTACK_RANGE: 150,        // pixels
  ATTACK_COOLDOWN: 800,     // ms
  ATTACK_SCAN_INTERVAL: 250,// ms（索敵掃描頻率）
  KNOCKBACK_FORCE: 100,
  KNOCKBACK_DURATION: 200,  // ms

  // 敵人（第 1 層基準）
  SPIDER_HP: 50,
  SPIDER_SPEED: 80,
  SPIDER_ATTACK: 10,
  SPIDER_ATTACK_COOLDOWN: 1500, // ms
  SPIDER_ATTACK_RANGE: 30,     // px（接觸判定）
  ENEMIES_PER_ROOM: { min: 3, max: 6 },

  // 掉落
  LOOT_MAGNET_RANGE: 80,
  HEALTH_ORB_HEAL: 30,

  // 房間
  SPAWN_SAFETY_FROM_PLAYER: 100, // px
  SPAWN_SAFETY_FROM_WALL: 32,    // px
  ROOM_ENTER_PADDING: 32,        // px

  // 搖桿
  JOYSTICK_DEAD_ZONE: 5,    // px
  JOYSTICK_MAX_RADIUS: 60,  // px
}
```

## 風險與注意

- Container physics.world.enable 需確認 Phaser 版本支援度，備案為在 Container 內放隱形 Sprite 掛 body
- 地牢生成重試上限 10 次，超過則降低房間數量重新嘗試
- moveToObject 在複雜走廊可能表現不佳，MVP 階段接受此限制
