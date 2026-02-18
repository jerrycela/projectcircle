# 發射數量選擇器 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 點選兵種卡片後彈出橫向數字滾輪，左右滑動選數量，向上拖曳進入瞄準模式，發射指定數量。

**Architecture:** 全部修改集中在 `src/phases/battle-phase.ts`。新增 picker 狀態欄位（9 個）和方法（4 個），修改 `onDeployCardClicked`、`setupInput` 的 3 個 handler、`pointerup` 發射邏輯、`cleanupAll`。pickerMax=1 時跳過滾輪直接進入瞄準（保留原有行為）。

**Tech Stack:** TypeScript, Phaser 3 (Container, Graphics, Text, Tweens, input events)

---

### Task 1：新增 picker 狀態欄位

**Files:**
- Modify: `src/phases/battle-phase.ts:251`（burstCountBadge 欄位之後）

**Step 1：在 `private burstCountBadge` 之後插入新欄位**

找到：
```typescript
  private burstCountBadge: Phaser.GameObjects.Container | null = null
```

在它之後插入：
```typescript
  // 數量選擇器
  private pickerMode: boolean = false
  private pickerMonsterId: string | null = null
  private pickerCount: number = 1
  private pickerMax: number = 1
  private pickerContainer: Phaser.GameObjects.Container | null = null
  private pickerStartX: number = 0
  private pickerStartY: number = 0
  private pickerPrevText: Phaser.GameObjects.Text | null = null
  private pickerCurrText: Phaser.GameObjects.Text | null = null
  private pickerNextText: Phaser.GameObjects.Text | null = null
```

**Step 2：確認編譯**
```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit 2>&1
```
Expected: 無錯誤

**Step 3：Commit**
```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: add quantity picker state fields to BattlePhase"
```

---

### Task 2：實作 buildPickerUI() 和 updatePickerDisplay()

**Files:**
- Modify: `src/phases/battle-phase.ts`（在 `private enterAimMode` 之前插入）

**Step 1：在 `private enterAimMode(monsterId: string)` 之前插入兩個方法**

找到：
```typescript
  private enterAimMode(monsterId: string): void {
```

在它之前插入：

```typescript
  // ============ 數量選擇器 ============

  private buildPickerUI(): void {
    if (!this.pickerContainer) return

    const w = 120
    const h = 44

    // 背景
    const bg = this.scene.add.graphics()
    bg.fillStyle(0x1a1a2e, 0.92)
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8)
    bg.lineStyle(1, UI_ACCENT, 0.8)
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8)
    this.pickerContainer.add(bg)

    // 左側數字（前一個）
    const prevText = this.scene.add.text(-38, 0, '', {
      fontSize: '14px',
      color: '#888888',
      fontStyle: 'bold',
    })
    prevText.setOrigin(0.5)
    this.pickerContainer.add(prevText)
    this.pickerPrevText = prevText

    // 中央數字（當前）
    const currText = this.scene.add.text(0, 0, `${this.pickerCount}`, {
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 2,
    })
    currText.setOrigin(0.5)
    this.pickerContainer.add(currText)
    this.pickerCurrText = currText

    // 右側數字（下一個）
    const nextText = this.scene.add.text(38, 0, '', {
      fontSize: '14px',
      color: '#888888',
      fontStyle: 'bold',
    })
    nextText.setOrigin(0.5)
    this.pickerContainer.add(nextText)
    this.pickerNextText = nextText

    // 上方提示箭頭（↑ 向上拖曳瞄準）
    const hintText = this.scene.add.text(0, -h / 2 - 12, '↑ 拖曳瞄準', {
      fontSize: '10px',
      color: '#aaaaaa',
    })
    hintText.setOrigin(0.5)
    this.pickerContainer.add(hintText)

    this.updatePickerDisplay()
  }

  private updatePickerDisplay(): void {
    if (!this.pickerCurrText) return

    const prev = this.pickerCount - 1
    const next = this.pickerCount + 1

    if (this.pickerPrevText) {
      this.pickerPrevText.setText(prev >= 1 ? `${prev}` : '')
    }
    this.pickerCurrText.setText(`${this.pickerCount}`)
    if (this.pickerNextText) {
      this.pickerNextText.setText(next <= this.pickerMax ? `${next}` : '')
    }

    // 數字切換彈性動畫
    this.scene.tweens.add({
      targets: this.pickerCurrText,
      scaleX: { from: 1.25, to: 1.0 },
      scaleY: { from: 1.25, to: 1.0 },
      duration: 100,
      ease: 'Back.easeOut',
    })
  }

```

**Step 2：確認編譯**
```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit 2>&1
```
Expected: 無錯誤

**Step 3：Commit**
```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: implement buildPickerUI and updatePickerDisplay"
```

---

### Task 3：實作 showPicker() 和 hidePicker()

**Files:**
- Modify: `src/phases/battle-phase.ts`（在 `buildPickerUI` 之前插入）

**Step 1：在 `private buildPickerUI()` 之前插入兩個方法**

找到（剛剛插入的）：
```typescript
  private buildPickerUI(): void {
```

在它之前插入：

```typescript
  private showPicker(monsterId: string, cardWorldX: number): void {
    this.hidePicker(true)

    const runState = gameStore.getState().run
    const instanceCount = runState.monsters.filter(m => m.monsterId === monsterId).length
    const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive).length
    this.pickerMax = Math.min(instanceCount, Math.max(0, this.getEffectiveAllyLimit() - aliveAllies))

    if (this.pickerMax <= 0) return

    // pickerMax = 1：跳過滾輪直接瞄準
    if (this.pickerMax === 1) {
      this.pickerCount = 1
      this.enterAimMode(monsterId)
      return
    }

    this.pickerMode = true
    this.pickerMonsterId = monsterId
    this.pickerCount = this.pickerMax  // 預設全選

    // 計算位置（卡片上方，防超出螢幕）
    const panelY = ROOM_Y + ROOM_HEIGHT + 20
    const pickerY = panelY - 52
    const pickerWidth = 120
    const clampedX = Phaser.Math.Clamp(
      cardWorldX,
      ROOM_X + pickerWidth / 2,
      ROOM_X + ROOM_WIDTH - pickerWidth / 2
    )

    this.pickerContainer = this.scene.add.container(clampedX, pickerY)
    this.pickerContainer.setDepth(20)
    this.pickerContainer.setAlpha(0)
    this.pickerContainer.setScale(0.9)

    this.buildPickerUI()

    // 進場動畫
    this.scene.tweens.add({
      targets: this.pickerContainer,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 150,
      ease: 'Back.easeOut',
    })

    // 暗化其他卡片
    for (const c of this.deployCards) {
      if (c.monsterId !== monsterId) {
        c.cdOverlay.setVisible(true)
        c.cdOverlay.setAlpha(0.35)
      }
    }
  }

  private hidePicker(immediate = false): void {
    if (!this.pickerMode && !this.pickerContainer) return

    this.pickerMode = false
    this.pickerMonsterId = null
    this.pickerPrevText = null
    this.pickerCurrText = null
    this.pickerNextText = null

    // 還原所有卡片暗化（依照 CD 狀態重設）
    const now = this.scene.time.now
    for (const c of this.deployCards) {
      const onCD = now - c.lastDeployTime < c.cooldownMs
      c.cdOverlay.setAlpha(0.6)
      c.cdOverlay.setVisible(onCD)
    }

    if (this.pickerContainer) {
      if (immediate) {
        this.scene.tweens.killTweensOf(this.pickerContainer)
        this.pickerContainer.destroy(true)
        this.pickerContainer = null
      } else {
        this.scene.tweens.killTweensOf(this.pickerContainer)
        const container = this.pickerContainer
        this.pickerContainer = null
        this.scene.tweens.add({
          targets: container,
          alpha: 0,
          duration: 100,
          onComplete: () => container.destroy(true),
        })
      }
    }
  }

```

**Step 2：確認編譯**
```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit 2>&1
```
Expected: 無錯誤

**Step 3：Commit**
```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: implement showPicker and hidePicker methods"
```

---

### Task 4：修改 onDeployCardClicked 呼叫 showPicker

**Files:**
- Modify: `src/phases/battle-phase.ts:2422`（onDeployCardClicked 方法）

**Step 1：找到並替換整個 onDeployCardClicked 方法**

現有內容（約第 2422 行）：
```typescript
  private onDeployCardClicked(card: DeployCard): void {
    if (this.isBursting) return

    const now = this.scene.time.now
    if (now - card.lastDeployTime < card.cooldownMs) return

    if (this.aimMode) {
      this.exitAimMode()
      return
    }

    this.enterAimMode(card.monsterId)
  }
```

替換為：
```typescript
  private onDeployCardClicked(card: DeployCard): void {
    if (this.isBursting) return

    const now = this.scene.time.now
    if (now - card.lastDeployTime < card.cooldownMs) return

    // 若在瞄準模式，退出
    if (this.aimMode) {
      this.exitAimMode()
      return
    }

    // Toggle：點同一張卡片關閉 picker
    if (this.pickerMode && this.pickerMonsterId === card.monsterId) {
      this.hidePicker()
      return
    }

    // 計算卡片世界座標 X
    const containerX = this.deployPanelContainer?.x ?? 0
    const cardWorldX = containerX + card.bg.x

    this.showPicker(card.monsterId, cardWorldX)
  }
```

**Step 2：確認編譯**
```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit 2>&1
```
Expected: 無錯誤（若有錯誤，確認 `card.bg.x` 是否為正確欄位名稱）

**Step 3：Commit**
```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: modify onDeployCardClicked to show quantity picker"
```

---

### Task 5：修改 pointerdown handler — 記錄起點 + 點外關閉

**Files:**
- Modify: `src/phases/battle-phase.ts:2972`（pointerdown handler）

**Step 1：找到 pointerdown handler 並修改**

現有內容：
```typescript
    // pointerdown: 開始拖拽瞄準
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.aimMode) return

      const dx = pointer.worldX - LAUNCH_PAD_X
      const dy = pointer.worldY - LAUNCH_PAD_Y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > LAUNCH_PAD_RADIUS + 30) return

      this.aimStartPoint = { x: pointer.worldX, y: pointer.worldY }
    })
```

替換為：
```typescript
    // pointerdown: 記錄 picker 滑動起點 + 點外關閉；或開始拖拽瞄準
    this.scene.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // picker 模式：記錄滑動起點，點擊 picker 外部關閉
      if (this.pickerMode) {
        this.pickerStartX = pointer.x
        this.pickerStartY = pointer.y

        if (this.pickerContainer) {
          const bounds = this.pickerContainer.getBounds()
          if (!Phaser.Geom.Rectangle.Contains(bounds, pointer.x, pointer.y)) {
            this.hidePicker()
          }
        }
        return
      }

      if (!this.aimMode) return

      const dx = pointer.worldX - LAUNCH_PAD_X
      const dy = pointer.worldY - LAUNCH_PAD_Y
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist > LAUNCH_PAD_RADIUS + 30) return

      this.aimStartPoint = { x: pointer.worldX, y: pointer.worldY }
    })
```

**Step 2：確認編譯**
```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit 2>&1
```
Expected: 無錯誤

**Step 3：Commit**
```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: update pointerdown to handle picker gesture start and outside tap"
```

---

### Task 6：修改 pointermove handler — 左右換數字 + 向上切換瞄準

**Files:**
- Modify: `src/phases/battle-phase.ts:2984`（pointermove handler）

**Step 1：找到 pointermove handler，在開頭插入 picker 邏輯**

現有開頭：
```typescript
    // pointermove: 更新瞄準線
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.aimMode || !this.aimStartPoint || !this.aimLine) return
```

替換開頭（只改第一行判斷，其餘保留）：
```typescript
    // pointermove: picker 手勢 / 更新瞄準線
    this.scene.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      // picker 模式的手勢處理
      if (this.pickerMode && pointer.isDown) {
        const dx = pointer.x - this.pickerStartX
        const dy = pointer.y - this.pickerStartY
        const absDx = Math.abs(dx)
        const absDy = Math.abs(dy)

        // 向上拖曳 > 20px 且垂直位移 > 水平位移 → 切換為瞄準
        if (dy < -20 && absDy > absDx) {
          const monsterId = this.pickerMonsterId!
          this.hidePicker(true)
          this.enterAimMode(monsterId)
          // 以目前 pointer 位置作為瞄準起點
          this.aimStartPoint = { x: pointer.worldX, y: pointer.worldY }
          return
        }

        // 水平滑動 → 每 30px 換一格
        if (absDx >= 30) {
          const steps = Math.floor(absDx / 30)
          const delta = dx > 0 ? steps : -steps
          const newCount = Phaser.Math.Clamp(this.pickerCount + delta, 1, this.pickerMax)
          if (newCount !== this.pickerCount) {
            this.pickerCount = newCount
            this.updatePickerDisplay()
          }
          this.pickerStartX = pointer.x  // 重設起點防止累積
        }
        return
      }

      if (!this.aimMode || !this.aimStartPoint || !this.aimLine) return
```

注意：只在開頭加入 picker 邏輯，其餘瞄準線繪製程式碼完全不變。

**Step 2：確認編譯**
```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit 2>&1
```
Expected: 無錯誤

**Step 3：Commit**
```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: update pointermove to handle picker swipe and transition to aim mode"
```

---

### Task 7：修改 pointerup handler — 使用 pickerCount 作為發射數量

**Files:**
- Modify: `src/phases/battle-phase.ts:3084`（pointerup 的 burstCount 計算）

**Step 1：找到發射數量計算那行並替換**

現有（約第 3082-3084 行）：
```typescript
      const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive).length
      const maxBurst = Math.max(0, this.getEffectiveAllyLimit() - aliveAllies)
      const burstCount = Math.min(instances.length, maxBurst)
```

替換為：
```typescript
      const aliveAllies = this.units.filter(u => u.faction === 'ally' && u.alive).length
      const maxBurst = Math.max(0, this.getEffectiveAllyLimit() - aliveAllies)
      // 使用 picker 選擇的數量（pickerCount 已在 showPicker 時 clamp 到合法範圍）
      // 若是 pickerMax=1 直接跳過 picker 進入瞄準，pickerCount 也已設為 1
      const burstCount = Math.min(this.pickerCount, Math.min(instances.length, maxBurst))
```

**Step 2：確認編譯**
```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit 2>&1
```
Expected: 無錯誤

**Step 3：Commit**
```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: use pickerCount as burst count in launch handler"
```

---

### Task 8：修改 cleanupAll — 加入 picker 清理

**Files:**
- Modify: `src/phases/battle-phase.ts`（cleanupAll 方法）

**Step 1：找到 cleanupAll 中 burstQueue 清理的地方，加入 picker 清理**

搜尋：
```bash
grep -n "cleanupAll\|this.burstQueue = \[\]" /Users/admin/ProjectCircle/src/phases/battle-phase.ts | head -10
```

找到 `cleanupAll` 中清理 `this.burstQueue` 的那行，在它附近加入：
```typescript
    // picker 清理（立即，不需動畫）
    this.hidePicker(true)
```

**Step 2：移除 burstCountBadge 舊邏輯（若仍存在）**

搜尋：
```bash
grep -n "burstCountBadge" /Users/admin/ProjectCircle/src/phases/battle-phase.ts
```

`burstCountBadge` 相關的 badge 建立在 `enterAimMode()` 中。由於現在 picker 取代了這個 badge，可以把 enterAimMode 中的 badge 建立邏輯移除：

找到（約第 2582-2595 行）：
```typescript
    if (burstCount > 1) {
      const badge = createTextBadge(
        ...
      )
      this.burstCountBadge = badge
    }
```

這段直接刪除（picker 已顯示數量，badge 重複且過時）。

同時確認 `exitAimMode()` 中的 badge 清理也一並移除：
```typescript
    if (this.burstCountBadge) {
      this.burstCountBadge.destroy(true)
      this.burstCountBadge = null
    }
```

**Step 3：確認編譯**
```bash
cd /Users/admin/ProjectCircle && npx tsc --noEmit 2>&1
```
Expected: 無錯誤

**Step 4：Commit**
```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "feat: add picker cleanup to cleanupAll, remove obsolete burstCountBadge"
```

---

### Task 9：手動測試與微調

**啟動遊戲**
```bash
cd /Users/admin/ProjectCircle && npm run dev
```

**測試清單：**

| 情境 | 預期結果 |
|------|---------|
| 有 3 隻哥布林，點卡片 | 滾輪出現，預設顯示 3 |
| 向左滑動 | 數字變 2，再滑變 1，不會低於 1 |
| 向右滑動 | 數字變 2、3，不會超過 3 |
| 向上拖曳 > 20px | 滾輪消失，進入瞄準模式 |
| 放手發射 | 場上出現選擇數量的怪物（非全部） |
| 點選空白區 | 滾輪消失 |
| 點同一張卡片 | 滾輪消失 |
| 點另一張卡片 | 舊滾輪消失，新卡片的滾輪出現 |
| 只有 1 隻可發射 | 直接進入瞄準，無滾輪 |
| 戰鬥結束 | 無滾輪殘留 |

**若數字換格太靈敏（30px 太小）：** 改為 40px

**若向上切換太容易誤觸：** 改為 dy < -30

**Step：Commit（若有微調）**
```bash
cd /Users/admin/ProjectCircle
git add src/phases/battle-phase.ts
git commit -m "fix: tune picker gesture thresholds based on testing"
```

---

## 完成定義

- [ ] TypeScript 編譯無錯誤
- [ ] pickerMax > 1 時點卡片出現滾輪（預設全選）
- [ ] 左右滑動正確更新數字（1 到 pickerMax）
- [ ] 向上拖曳自動切換瞄準，發射數量與滾輪顯示一致
- [ ] pickerMax = 1 時直接進入瞄準（無滾輪）
- [ ] 點外關閉、toggle 關閉、切換卡片關閉
- [ ] 戰鬥結束無視覺殘留
