# 發射數量選擇器設計文件

**建立日期**: 2026-02-19
**狀態**: 迭代中
**標籤**: ProjectCircle, 發射系統, 數量選擇器, UI/UX

---

## 設計目標

讓玩家在發射怪物前，可以選擇要發射幾隻（1 到最大可發射數），取代現有「一律全發」的行為。

**互動流程（確認版）：**
1. 點選兵種卡片 → 卡片上方彈出橫向數字滾輪
2. 左右滑動滾輪 → 改變數量（每 30px 換一格）
3. 向上拖曳超過 20px → 自動切換為瞄準模式，滾輪消失
4. 繼續拖曳瞄準方向 → 放手，發射指定數量

---

## 迭代 1：基礎資料結構

**新增狀態欄位（BattlePhase 私有）：**

```typescript
private pickerMode: boolean = false           // 是否在選數量模式
private pickerMonsterId: string | null = null  // 目前選數量的兵種
private pickerCount: number = 1               // 目前選擇的數量
private pickerMax: number = 1                 // 最大可發射數
private pickerContainer: Phaser.GameObjects.Container | null = null  // 滾輪 UI
private pickerStartX: number = 0             // 滑動起點 X（用於計算位移）
private pickerStartY: number = 0             // 滑動起點 Y（用於手勢判斷）
```

**移除：** `enterAimMode()` 裡的 `burstCount` badge（被滾輪取代）

**問題**: 無

---

## 迭代 2：showPicker() 方法

**位置:** 卡片 container 座標系外，直接用 scene 座標

滾輪出現在選中卡片的正上方，Y 位置 = 部署面板頂部 - 60px

```typescript
private showPicker(monsterId: string, cardWorldX: number): void {
  this.hidePicker()
  this.pickerMode = true
  this.pickerMonsterId = monsterId

  // 計算最大可發射數
  const runState = gameStore.getState().run
  const instanceCount = runState.monsters.filter(m => m.monsterId === monsterId).length
  const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive).length
  this.pickerMax = Math.min(instanceCount, Math.max(1, this.getEffectiveAllyLimit() - aliveAllies))
  this.pickerCount = this.pickerMax  // 預設全選

  // 建立 Container
  const panelY = ROOM_Y + ROOM_HEIGHT + 20
  const pickerY = panelY - 60
  this.pickerContainer = this.scene.add.container(cardWorldX, pickerY)
  this.buildPickerUI()
}
```

**問題**: pickerMax 為 0 時需要保護（加 `if (this.pickerMax <= 0) return`）

---

## 迭代 3：buildPickerUI() — 視覺結構

**滾輪 UI 由三個數字組成（左：前一個，中：當前，右：下一個）**

```
┌─────────────────────────┐
│   3    [  4  ]    5     │  ← 數字滾輪（寬 120px，高 44px）
│  ←  灰  ← 白 大 →  灰  → │
└─────────────────────────┘
     ↑ 卡片正上方
```

- 背景：圓角矩形，深色半透明（0x1a1a2e, alpha 0.9）
- 邊框：1px UI_ACCENT 色
- 中央數字：20px bold 白色
- 左右數字：14px 灰色（0x888888）
- 左右各有小箭頭圖示提示可滑動
- 數字超出範圍時（1 的左邊、max 的右邊）顯示 `-` 或截止符號

**問題**: pickerMax = 1 時左右數字無意義，需隱藏左右數字只顯示「1」

---

## 迭代 4：updatePickerDisplay() — 數字更新

每次 pickerCount 改變時呼叫：

```typescript
private updatePickerDisplay(): void {
  if (!this.pickerContainer) return

  const prev = this.pickerCount - 1
  const next = this.pickerCount + 1

  // 更新三個文字物件（從 container.getAt() 取得）
  const prevText = this.pickerContainer.getAt(2) as Phaser.GameObjects.Text
  const currText = this.pickerContainer.getAt(3) as Phaser.GameObjects.Text
  const nextText = this.pickerContainer.getAt(4) as Phaser.GameObjects.Text

  prevText.setText(prev >= 1 ? `${prev}` : '')
  currText.setText(`${this.pickerCount}`)
  nextText.setText(next <= this.pickerMax ? `${next}` : '')

  // 數字切換動畫：scale bounce
  this.scene.tweens.add({
    targets: currText,
    scaleX: { from: 1.2, to: 1.0 },
    scaleY: { from: 1.2, to: 1.0 },
    duration: 100,
    ease: 'Back.easeOut',
  })
}
```

**問題**: 用 `getAt(index)` 依賴插入順序脆弱 → 改用 `setName()` + `getByName()`

---

## 迭代 5：修正 — 用 setName 取代 getAt

```typescript
// buildPickerUI 中建立時設名稱
prevText.setName('picker_prev')
currText.setName('picker_curr')
nextText.setName('picker_next')

// updatePickerDisplay 中取得
const prevText = this.pickerContainer.getByName('picker_prev') as Phaser.GameObjects.Text
const currText = this.pickerContainer.getByName('picker_curr') as Phaser.GameObjects.Text
const nextText = this.pickerContainer.getByName('picker_next') as Phaser.GameObjects.Text
```

**問題**: Phaser Container 的 `getByName` 需要確認 API 存在 → 改用 class 私有欄位直接儲存 Text 參照更可靠

---

## 迭代 6：修正 — 直接儲存 Text 參照

```typescript
private pickerPrevText: Phaser.GameObjects.Text | null = null
private pickerCurrText: Phaser.GameObjects.Text | null = null
private pickerNextText: Phaser.GameObjects.Text | null = null
```

`buildPickerUI()` 建立後直接賦值給這三個欄位。`hidePicker()` 時一併設為 null。

**好處**: 無 DOM 查找，直接操作，TypeScript 型別安全。

**問題**: hidePicker 必須在 showPicker 前呼叫，確保舊參照被清除 → `showPicker` 開頭呼叫 `hidePicker()` 已處理。

---

## 迭代 7：手勢處理 — pointerdown

點選卡片後，需要從 `onDeployCardClicked` 觸發 showPicker，同時記錄手勢起點。

**修改 onDeployCardClicked：**

```typescript
private onDeployCardClicked(card: DeployCard): void {
  if (this.isBursting) return

  const now = this.scene.time.now
  if (now - card.lastDeployTime < card.cooldownMs) return

  // 若已在 picker 模式且點的是同一張卡片，關閉（toggle）
  if (this.pickerMode && this.pickerMonsterId === card.monsterId) {
    this.hidePicker()
    return
  }

  // 取得卡片世界座標 X（container 的 x + 卡片在 container 中的偏移）
  const containerX = this.deployPanelContainer?.x ?? 0
  const cardWorldX = containerX + card.bg.x

  this.showPicker(card.monsterId, cardWorldX)
}
```

**問題**: `card.bg.x` 是 container 內的局部座標，需要加上 container.x 才是世界座標 → 已處理

---

## 迭代 8：手勢處理 — pointermove（滑動判斷）

在 `setupInput()` 中的 pointermove 加入 picker 滑動邏輯：

```typescript
this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
  // 已有瞄準模式的邏輯（保留不變）
  if (this.aimMode) {
    this.updateAimLine(pointer)
    return
  }

  if (!this.pickerMode || !pointer.isDown) return

  const dx = pointer.x - this.pickerStartX
  const dy = pointer.y - this.pickerStartY
  const absDx = Math.abs(dx)
  const absDy = Math.abs(dy)

  // 向上拖曳 > 20px 且垂直位移 > 水平位移 → 切換為瞄準
  if (dy < -20 && absDy > absDx) {
    this.hidePicker()
    this.enterAimMode(this.pickerMonsterId!)
    // 重設 aimStartPoint 為目前 pointer 位置
    this.aimStartPoint = { x: pointer.worldX, y: pointer.worldY }
    return
  }

  // 水平滑動 → 每 30px 換一格
  const steps = Math.floor(Math.abs(dx) / 30)
  if (steps > 0) {
    const delta = dx > 0 ? steps : -steps
    this.pickerCount = Phaser.Math.Clamp(this.pickerCount + delta, 1, this.pickerMax)
    this.pickerStartX = pointer.x  // 重設起點防止累積
    this.updatePickerDisplay()
  }
})
```

**問題**: `pickerStartX/Y` 需要在 pointerdown 時記錄，而不是 showPicker 時 → 見迭代 9

---

## 迭代 9：記錄 pointerdown 起點

在 `setupInput()` 的 pointerdown handler 加入：

```typescript
this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
  if (this.pickerMode) {
    this.pickerStartX = pointer.x
    this.pickerStartY = pointer.y
  }
  // 現有的 aimStartPoint 邏輯保留...
})
```

**問題**: 現有 pointerdown 可能已有其他邏輯 → 需先 `grep -n "pointerdown"` 確認插入位置

確認：
```bash
grep -n "pointerdown" src/phases/battle-phase.ts
```

---

## 迭代 10：hidePicker() 方法

```typescript
private hidePicker(): void {
  if (!this.pickerMode) return

  this.pickerMode = false
  this.pickerMonsterId = null
  this.pickerPrevText = null
  this.pickerCurrText = null
  this.pickerNextText = null

  if (this.pickerContainer) {
    this.scene.tweens.add({
      targets: this.pickerContainer,
      alpha: 0,
      scaleY: 0.8,
      duration: 120,
      ease: 'Back.easeIn',
      onComplete: () => {
        this.pickerContainer?.destroy(true)
        this.pickerContainer = null
      },
    })
  }
}
```

**問題**: tween 完成後 destroy，但若在 tween 進行中再次呼叫 hidePicker，會建立第二個 container → 加入 `if (this.pickerContainer)` 進入前先 killTweensOf

---

## 迭代 11：修正 — 防止重複建立

```typescript
private hidePicker(): void {
  if (!this.pickerMode && !this.pickerContainer) return  // 已是關閉狀態

  this.pickerMode = false
  this.pickerMonsterId = null
  this.pickerPrevText = null
  this.pickerCurrText = null
  this.pickerNextText = null

  if (this.pickerContainer) {
    this.scene.tweens.killTweensOf(this.pickerContainer)
    this.scene.tweens.add({
      targets: this.pickerContainer,
      alpha: 0,
      duration: 100,
      onComplete: () => {
        this.pickerContainer?.destroy(true)
        this.pickerContainer = null
      },
    })
  }
}
```

**問題**: 無

---

## 迭代 12：整合 burstCount 到發射流程

現有 `pointerup` 的發射邏輯計算 `burstCount = Math.min(instances.length, maxBurst)`，改為使用 `pickerCount`：

```typescript
// 原本
const burstCount = Math.min(instances.length, maxBurst)

// 改為
const burstCount = this.pickerCount  // 已在 showPicker 時被 clamp 到合法範圍
```

**但需確認：** `enterAimMode()` 被呼叫時（從 picker 的向上拖曳觸發），`pickerCount` 已設定好，不會被重置。

**pickerCount 的生命週期：**
- `showPicker()` 時設為 `pickerMax`（預設全選）
- 左右滑動時更新
- `hidePicker()` 時**不重置**（直到下次 showPicker）
- `pointerup` 發射後由現有邏輯決定（exitAimMode 後 pickerCount 不變，因為下次點卡片會重新設定）

**問題**: 無

---

## 迭代 13：showPicker 動畫

進場動畫讓 UI 感覺更有生命：

```typescript
// 建立 container 後設初始狀態
this.pickerContainer.setAlpha(0)
this.pickerContainer.setScale(0.9)

// 淡入 + 彈性縮放
this.scene.tweens.add({
  targets: this.pickerContainer,
  alpha: 1,
  scaleX: 1,
  scaleY: 1,
  duration: 150,
  ease: 'Back.easeOut',
})
```

**搭配的卡片高亮：**
點選的卡片加上外框高亮（2px UI_ACCENT border），其他卡片略微變暗（alpha 0.6）。
hidePicker 時還原所有卡片。

**問題**: 卡片的高亮需要在 createDeployCard 加入一個 `highlightBorder` Graphics 欄位 → 需更新 DeployCard interface

---

## 迭代 14：更新 DeployCard interface

```typescript
interface DeployCard {
  monsterId: string
  name: string
  cooldownMs: number
  lastDeployTime: number
  container: Phaser.GameObjects.Container
  bg: Phaser.GameObjects.Rectangle
  cdOverlay: Phaser.GameObjects.Rectangle
  nameText: Phaser.GameObjects.Text
  readyLine: Phaser.GameObjects.Graphics
  highlightBorder: Phaser.GameObjects.Graphics  // ← 新增
}
```

`createDeployCard()` 建立時加入：
```typescript
const highlightBorder = this.scene.add.graphics()
highlightBorder.setVisible(false)
container.add(highlightBorder)
```

`showPicker()` 中：
```typescript
// 高亮選中卡片
const selectedCard = this.deployCards.find(c => c.monsterId === monsterId)
if (selectedCard) {
  selectedCard.highlightBorder.setVisible(true)
  selectedCard.highlightBorder.lineStyle(2, UI_ACCENT, 1.0)
  selectedCard.highlightBorder.strokeRoundedRect(x, y, width, height, 4)
}
// 其他卡片變暗
for (const c of this.deployCards) {
  if (c.monsterId !== monsterId) c.bg.setAlpha(0.6)
}
```

**問題**: highlightBorder 的位置 x/y 在 createDeployCard 的局部座標，需儲存以供後用 → 在 card 物件加 `cardX / cardY / cardW / cardH` 欄位

---

## 迭代 15：簡化 — 不需要 highlightBorder 的位置問題

更簡單的方案：直接在 showPicker 時用 `cdOverlay` 的 alpha 控制暗化，不需要 highlightBorder：

```typescript
// 暗化非選中卡片（直接用既有的 cdOverlay）
for (const c of this.deployCards) {
  if (c.monsterId !== monsterId) {
    c.cdOverlay.setVisible(true)
    c.cdOverlay.setAlpha(0.4)  // 輕微暗化
  }
}

// 選中卡片的卡背顏色稍微提亮（setTint）
selectedCard?.bg.setTint(0x4466aa)
```

`hidePicker()` 時：
```typescript
for (const c of this.deployCards) {
  c.cdOverlay.setVisible(now - c.lastDeployTime < c.cooldownMs)  // 還原 CD 狀態
  c.cdOverlay.setAlpha(0.6)
  c.bg.clearTint()
}
```

**問題**: cdOverlay 原本在 CD 時才顯示，這裡借用它的 visible/alpha 需注意 updateDeployCards 的每幀覆寫 → 加入 `pickerDimming` flag 讓 updateDeployCards 跳過暗化中的卡片

---

## 迭代 16：cleanupAll 加入 picker 清理

戰鬥結束時必須清理 picker：

```typescript
private cleanupAll(): void {
  // ... 現有清理邏輯 ...

  // 新增：picker 清理
  this.hidePicker()
  this.pickerMode = false
  this.pickerContainer?.destroy(true)
  this.pickerContainer = null
  this.pickerPrevText = null
  this.pickerCurrText = null
  this.pickerNextText = null
}
```

注意：`hidePicker()` 有 tween 動畫，戰鬥結束時不需要動畫，直接 `destroy(true)` 更乾淨。加入 `immediate` 參數：

```typescript
private hidePicker(immediate = false): void {
  // ...
  if (immediate) {
    this.pickerContainer?.destroy(true)
    this.pickerContainer = null
  } else {
    // tween 淡出...
  }
}
```

**問題**: 無

---

## 迭代 17：pickerMax = 1 的邊界情況

當玩家只有 1 隻可發射時，不需要滾輪，直接進入瞄準模式：

```typescript
private showPicker(monsterId: string, cardWorldX: number): void {
  // ...計算 pickerMax...

  if (this.pickerMax <= 1) {
    // 只有 1 隻，跳過 picker 直接進入瞄準
    this.pickerCount = 1
    this.enterAimMode(monsterId)
    return
  }

  // 有多隻時才顯示滾輪
  // ...
}
```

這保留了原有「1 隻直接點選就瞄準」的手感，不多一個步驟。

**問題**: 無

---

## 迭代 18：滾輪位置計算（防止超出螢幕）

滾輪寬 120px，置中於卡片 X。但若卡片在面板最左或最右，滾輪可能超出螢幕：

```typescript
const pickerWidth = 120
const clampedX = Phaser.Math.Clamp(
  cardWorldX,
  ROOM_X + pickerWidth / 2,
  ROOM_X + ROOM_WIDTH - pickerWidth / 2
)
this.pickerContainer = this.scene.add.container(clampedX, pickerY)
```

**問題**: 無

---

## 迭代 19：pointerdown 在 picker 外點擊時關閉

如果玩家點了滾輪以外的空白區域，應關閉 picker：

在 `setupInput()` 的 pointerdown handler：

```typescript
this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
  if (this.pickerMode) {
    this.pickerStartX = pointer.x
    this.pickerStartY = pointer.y

    // 點擊位置是否在 picker container 範圍內
    const pickerBounds = this.pickerContainer?.getBounds()
    if (pickerBounds && !Phaser.Geom.Rectangle.Contains(pickerBounds, pointer.x, pointer.y)) {
      // 也要確認不是點了卡片（卡片點擊由 cardBg.on('pointerup') 處理）
      this.hidePicker()
    }
  }
  // 現有邏輯...
})
```

**注意**: pointerdown 與 pointerup 的順序 — 卡片的 click 是 pointerup 觸發，所以這裡 pointerdown 先關閉舊 picker，pointerup 再開啟新 picker，不會衝突。

**問題**: `getBounds()` 在 Container 上的行為需要確認（Phaser 3 Container getBounds 存在）→ 已確認 API 存在

---

## 迭代 20：最終設計確認與修改範圍摘要

### 修改範圍

| 檔案 | 修改內容 |
|------|---------|
| `src/phases/battle-phase.ts` | 主要修改，所有 picker 邏輯 |

**新增私有欄位（9 個）：**
- `pickerMode`, `pickerMonsterId`, `pickerCount`, `pickerMax`
- `pickerContainer`, `pickerStartX`, `pickerStartY`
- `pickerPrevText`, `pickerCurrText`, `pickerNextText`

**新增方法（4 個）：**
- `showPicker(monsterId, cardWorldX)` — 顯示數量滾輪
- `hidePicker(immediate?)` — 隱藏滾輪（帶動畫或立即）
- `buildPickerUI()` — 建立三個數字 + 背景
- `updatePickerDisplay()` — 刷新三個數字文字

**修改方法（4 個）：**
- `onDeployCardClicked()` — 改為呼叫 showPicker，加 toggle 邏輯
- `setupInput()` — pointerdown 記錄起點 + 點外關閉；pointermove 加滑動換數字 + 向上切瞄準
- `pointerup handler` — burstCount 改為 `this.pickerCount`
- `cleanupAll()` — 加入 `hidePicker(true)`

### 完成定義

- [ ] pickerMax > 1 時卡片上方出現滾輪
- [ ] 左右滑動正確改變數字（1 到 pickerMax）
- [ ] 向上拖曳 > 20px 自動切換為瞄準模式
- [ ] 發射數量與滾輪顯示的數字一致
- [ ] pickerMax = 1 時跳過滾輪直接進入瞄準
- [ ] 點選另一張卡片時舊滾輪關閉、新滾輪開啟
- [ ] 點選空白處關閉滾輪
- [ ] 戰鬥結束時滾輪被清理，無視覺殘留
- [ ] TypeScript 編譯無錯誤

---

**文件版本**: 1.0.0
**最後更新**: 2026-02-19
