# 008: Gothic Visual Overhaul

## 概述

將遊戲的 UI 和視覺氛圍從「現代扁平風」全面改造為「Diablo I 歌德式暗黑地牢風」。保持 top-down 視角不變，專注在光照、配色、UI 框體、操控介面的歌德化。

全部使用 Phaser Graphics API 程式繪製，不依賴外部素材圖。

## 設計決策

| 決策 | 選擇 | 理由 |
|------|------|------|
| 視角 | 保持 top-down | 改 isometric 等於重寫整個遊戲 |
| 實作方式 | 全 Graphics API | 風格一致、迭代快、不依賴外部素材 |
| HP/MP 顯示 | 底部左右紅藍球 | 最忠於 Diablo 原版 |
| 技能按鈕 | 底部中央橫排 | 球體之間，類似 Diablo belt |
| 移動控制 | 固定石質十字鍵 | 取代浮動搖桿，強化復古感 |

## Phase A：GothicTheme + 配色 + FogOfWar 強化

### A1: GothicTheme.ts（新增）

共用歌德風繪製工具，所有 UI 元件依賴此模組。

**GOTHIC_COLORS 常數：**

```typescript
const GOTHIC_COLORS = {
  // 石質邊框
  STONE_DARK: 0x1a1510,    // 陰影線
  STONE_MID: 0x2a2520,     // 外框
  STONE_SURFACE: 0x3a3228, // 表面
  STONE_HIGHLIGHT: 0x4a4238, // 高光線
  STONE_PRESSED: 0x5a5248,  // 按壓狀態

  // 球體
  GLOBE_HP_FILL: 0x8b0000,    // 暗紅血液
  GLOBE_HP_EMPTY: 0x1e0a0a,   // 空球暗底
  GLOBE_MP_FILL: 0x1a0a3e,    // 深藍紫魔力
  GLOBE_MP_EMPTY: 0x0a0a1e,   // 空球暗底

  // 環境
  FLOOR_TINT: 0x3a3228,
  WALL_TINT: 0x2a2520,

  // 文字
  TEXT_PARCHMENT: 0xd4c4a0,  // 羊皮紙色
  TEXT_GOLD: 0xc9a44a,       // 低飽和金色
  TEXT_BLOOD: 0x8b0000,      // 死亡/警告

  // UI 背景
  PANEL_BG: 0x1e1a15,
  PANEL_BORDER: 0x2a2520,
};
```

**GOTHIC_FONTS 常數：**

```typescript
const GOTHIC_FONTS = {
  BODY: {
    fontFamily: 'monospace',
    color: '#d4c4a0',
    stroke: '#000000',
    strokeThickness: 2,
  },
  TITLE: {
    fontFamily: 'monospace',
    fontSize: '18px',
    color: '#d4c4a0',
    stroke: '#000000',
    strokeThickness: 3,
    fontStyle: 'bold',
  },
  GOLD: {
    fontFamily: 'monospace',
    fontSize: '13px',
    color: '#c9a44a',
    stroke: '#000000',
    strokeThickness: 2,
  },
  DEATH: {
    fontFamily: 'monospace',
    fontSize: '24px',
    color: '#8b0000',
    stroke: '#000000',
    strokeThickness: 4,
  },
};
```

**共用繪製函式：**

- `drawStoneFrame(graphics, x, y, w, h)` — 4 層石質邊框（外框 → 表面 → 高光線 → 陰影線）
- `drawStoneButton(graphics, x, y, w, h, pressed)` — 石質按鈕，按下時反轉高光/陰影
- `drawStoneCircle(graphics, x, y, radius)` — 圓形石框（球體外圈用）

### A2: FogOfWar.ts（修改）

| 參數 | 現值 | 新值 | 效果 |
|------|------|------|------|
| FOG_ALPHA | 0.85 | 0.95 | 光圈外幾乎全黑 |
| PLAYER_LIGHT_RADIUS | 224 | 180 | 可視範圍縮小，更壓迫 |

新增：
- 暖色光照染色：在玩家光圈中心疊加一個半透明橙黃色圓（alpha 0.08），模擬火炬暖光
- 地面光斑：玩家腳下橙色圓形（alpha 0.1, radius 40），增加立體感

### A3: config.ts（修改）

在 GAME_CONFIG 中新增配色區塊，供 GameScene 渲染地板/牆壁 tint 使用。

### AC（Phase A）

- [x] AC-A1: FogOfWar alpha=0.95，光圈外幾乎不可見
- [x] AC-A2: 玩家光照半徑明顯縮小（180px）
- [x] AC-A3: 光照中心有暖色橙黃 tint
- [x] AC-A4: 玩家腳下有微弱地面光斑
- [x] AC-A5: GothicTheme.ts 存在且匯出所有常數和函式
- [x] AC-A6: 遊戲可 build、可 play，不影響既有功能

## Phase B：Health Globe + Mana Globe + HUD 重構

### B1: HealthGlobe.ts（新增）

**結構：**
- 圓形容器，直徑 80px
- 外圈：石雕邊框（drawStoneCircle）
- 內部填充：暗底色（GLOBE_HP_EMPTY）+ 紅色液體（GLOBE_HP_FILL）
- 液體高度 = 球體高度 * (currentHP / maxHP)
- 液面波動：正弦波，振幅 2px，週期 2s

**介面：**
- `constructor(scene, x, y)`
- `update(currentHp, maxHp)` — 每幀呼叫
- `destroy()`

### B2: ManaGlobe.ts（新增）

與 HealthGlobe 結構相同，配色替換為 MP 系列。

### B3: HUD.ts（重寫）

**底部佈局（y 基準 = camera.height - 120）：**

```
紅球中心: (50, camH - 50)
藍球中心: (camW - 50, camH - 50)
技能按鈕: 底部中央橫排（見 Phase D）
十字鍵: 底部中央偏下（見 Phase C）
```

**頂部資訊（保留但歌德化）：**
- 左上 Floor 標籤：套用 GOTHIC_FONTS.BODY
- 右上 Gold：套用 GOTHIC_FONTS.GOLD
- Materials 文字：套用 GOTHIC_FONTS.BODY
- [Equip] 和 [Companions] 按鈕：套用石質按鈕樣式

**刪除：**
- HP/MP 條狀繪製邏輯（drawBars 整個移除）
- hpFillW / mpFillW 相關計算

### AC（Phase B）

- [x] AC-B1: 左下角顯示紅色球體，液體高度隨 HP 變化
- [x] AC-B2: 右下角顯示藍色球體，液體高度隨 MP 變化
- [x] AC-B3: 球體液面有正弦波動效果
- [x] AC-B4: 球體外圈有石雕邊框
- [x] AC-B5: 頂部資訊改用羊皮紙色 + 黑色描邊
- [x] AC-B6: 舊的 HP/MP 條狀不再顯示
- [x] AC-B7: 遊戲可 build、可 play

## Phase C：DPad 取代 Joystick

### C1: DPad.ts（新增）

**結構：**
- 中心位置：底部中央（camW/2, camH - 45）
- 整體尺寸：110x110px
- 中心裝飾：20x20px 石質正方形
- 四個方向鍵：各 36x36px 梯形按鈕

**互動邏輯：**
- 觸控按下：對應方向鍵亮起（STONE_SURFACE → STONE_PRESSED），位移 1px 下沉
- 觸控放開：恢復原色和位置
- 支援滑動切換方向
- 對角移動：同時觸發兩個相鄰方向，合成對角速度向量
- 輸出 dirX/dirY（0 或 +-1），數位輸入非類比

**介面：**
- `constructor(scene)`
- `get dirX(): number`
- `get dirY(): number`
- `setLocked(locked: boolean)` — 對應 ui-input-lock 事件

### C2: UIScene.ts（修改）

- `Joystick` import → `DPad` import
- `this.joystick = new Joystick(this)` → `this.dpad = new DPad(this)`
- GameScene 讀取方向的邏輯適配（dirX/dirY 介面不變）

### C3: Joystick.ts（刪除）

連同 joystick-base.png、joystick-thumb.png 素材一起移除。

### AC（Phase C）

- [x] AC-C1: 底部中央顯示石質十字鍵
- [x] AC-C2: 按下方向鍵有視覺回饋（變亮 + 1px 下沉）
- [x] AC-C3: 四個方向都能正常移動玩家
- [x] AC-C4: 對角移動正常（同時按兩方向）
- [x] AC-C5: ui-input-lock 正常鎖定/解鎖十字鍵
- [x] AC-C6: 舊搖桿不再顯示
- [x] AC-C7: 遊戲可 build、可 play

## Phase D：SkillButton 歌德化 + 底部橫排

### D1: SkillButton.ts（修改）

- 直徑從 80px 視覺/100px 觸控 → 50px 視覺/60px 觸控
- 背景圓形改用 drawStoneCircle 繪製
- Cooldown 覆蓋維持順時針扇形，但顏色改為半透明深褐
- MP 不足時邊框變暗紅提示

### D2: HUD.ts 技能按鈕位置

- 3 顆橫排在紅球和藍球之間
- Y 位置：camH - 90（球體上方）
- X 位置：等距分布在 (紅球右緣 + 20) 到 (藍球左緣 - 20) 之間

### AC（Phase D）

- [x] AC-D1: 3 個技能按鈕橫排在底部球體之間
- [x] AC-D2: 技能按鈕有石質圓形邊框
- [x] AC-D3: Cooldown 視覺正常（深褐色扇形）
- [x] AC-D4: 技能施放正常運作
- [x] AC-D5: 遊戲可 build、可 play

## Phase E：面板歌德化

### E1: 共用改動模式

所有面板套用相同的歌德化改動：
- 背景：半透明黑 → PANEL_BG + drawStoneFrame 邊框
- 標題文字：套用 GOTHIC_FONTS.TITLE
- 內文：套用 GOTHIC_FONTS.BODY
- 關閉按鈕：文字 [X] → 石質圓形按鈕（drawStoneButton）
- 按鈕/選項卡：套用石質按鈕樣式

### E2: 影響範圍

- UpgradePanel.ts — 祭壇 3 選 1 卡牌 UI
- EquipmentPanel.ts — 裝備管理
- EquipmentComparePanel.ts — 裝備比較
- CompanionPanel.ts — 夥伴面板
- InitialSkillPanel.ts — 開場技能選擇

### E3: 死亡畫面

- "You Died" 文字：套用 GOTHIC_FONTS.DEATH（暗紅色）
- 加全畫面深紅色 vignette 覆蓋（中心透明，邊緣 alpha 0.4 暗紅）

### AC（Phase E）

- [x] AC-E1: UpgradePanel 有石質邊框和歌德配色
- [x] AC-E2: EquipmentPanel 有石質邊框和歌德配色
- [x] AC-E3: EquipmentComparePanel 有石質邊框和歌德配色
- [x] AC-E4: CompanionPanel 有石質邊框和歌德配色
- [x] AC-E5: InitialSkillPanel 有石質邊框和歌德配色
- [x] AC-E6: 死亡畫面顯示暗紅文字 + vignette 效果
- [x] AC-E7: 所有面板的文字使用羊皮紙色 + 黑色描邊
- [x] AC-E8: 遊戲可 build、可 play

## 不在範圍內

- 視角變更（保持 top-down）
- 遊戲實體素材替換（Player、Enemy、Loot 等像素圖 — 獨立任務）
- 系統邏輯變更（CombatSystem、DungeonGenerator 等）
- 音效/音樂
- 自訂字體載入（維持 monospace，靠配色和描邊達成歌德感）

## 風險

| 風險 | 緩解 |
|------|------|
| 十字鍵手感不如搖桿 | Phase C 完成後立即手動測試，不行就改回浮動搖桿+石質外觀 |
| 底部 120px 佔據太多遊戲畫面 | 可調整球體到 70px、技能按鈕到 44px 壓縮高度 |
| 程式繪製的石質紋理不夠逼真 | noise 疊加 + 多層漸層，像素尺度下肉眼夠用 |
| 光照太暗影響可玩性 | FOG_ALPHA 和 PLAYER_LIGHT_RADIUS 做成可調參數 |

## 實作結果（2026-04-08 ingest）

**狀態：** 已完成，30/30 AC passed，merged to main，deployed to GitHub Pages

**Branch:** feat/gothic-visual-overhaul (6 commits, merged)

**三方審查修正（已全部套用）：**
1. Globe 合併為單一參數化 class（非分開 HealthGlobe/ManaGlobe）
2. Globe 半徑從 40 改為 35，DPad keys 從 36 改為 32
3. Globe 用 GeometryMask（非 overdraw），避免 anti-aliasing seam
4. DPad 用場景級 pointer 事件（非 per-zone），支援拖動切換和雙指對角
5. DPad + HUD 加 destroy() 清理 EventBus listener
6. Floor/wall tint 在 GameScene map creation 時 apply
7. HUD.update 簽名改為 update(time, delta)
8. 死亡暈影改用多層同心環（Graphics alpha 是 additive，fillCircle alpha=0 不會 erase）
9. SkillButton 按壓回饋改用重繪較小半徑（setScale 從原點縮放會位移）
10. Task 9（joystick rename）刪除（EventBus 事件名不變，純 churn）
11. 加 drawGothicPanel helper（合併 PANEL_BG fill + drawStoneFrame）

**新增檔案：** GothicTheme.ts, Globe.ts, DPad.ts
**刪除檔案：** Joystick.ts, joystick-base.png, joystick-thumb.png
**重寫：** HUD.ts
**修改：** FogOfWar.ts, SkillButton.ts, UIScene.ts, BootScene.ts, GameScene.ts, config.ts, + 5 panels
