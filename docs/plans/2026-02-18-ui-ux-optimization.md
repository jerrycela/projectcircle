# ProjectCircle UI/UX 優化方案

> 日期：2026-02-18
> 專案：ProjectCircle 塔防遊戲
> 狀態：設計規劃

## 目標

針對 ProjectCircle 遊戲目前「陽春」的介面進行全面優化，提升視覺品質、互動體驗和專業度，同時保持遊戲性能和可玩性。

---

## 現況分析

### 現有介面優點 ✅

1. **一致的深色主題**：深紫藍底色（非純黑），符合地牢氛圍
2. **清晰的資訊架構**：Top bar 固定顯示金幣、房間進度、波次資訊
3. **基礎互動回饋**：金幣變化有 scale bounce 動畫
4. **ProjectDK 風格傳承**：光暈、漸層、描邊文字等視覺手法

### 需要改進的問題 ⚠️

| 問題類別 | 具體問題 | 影響 |
|---------|---------|------|
| **視覺設計** | 1. 按鈕和 UI 元件過於簡單（純色矩形） | 缺乏精緻度 |
| | 2. 圖示使用簡單 sprite，缺乏細節 | 視覺吸引力不足 |
| | 3. 字體單一（僅 monospace），缺乏層次 | 閱讀體驗平淡 |
| | 4. 色彩系統不完整，僅用硬編碼顏色 | 難以維護和調整 |
| **互動體驗** | 1. 缺少 hover 狀態的視覺回饋 | 可點擊性不明確 |
| | 2. 無 loading 狀態指示（場景切換） | 用戶不知系統狀態 |
| | 3. 無錯誤提示 UI（如金幣不足） | 用戶困惑 |
| | 4. 無聲音回饋（點擊、升級、擊殺） | 缺乏沉浸感 |
| **資訊呈現** | 1. 缺少教學提示（首次遊玩） | 學習曲線陡峭 |
| | 2. 缺少進度儲存/讀取 UI | 用戶體驗不完整 |
| | 3. 缺少統計面板（擊殺數、DPS 等） | 缺乏成就感 |
| **效能優化** | 1. 大量 tween 動畫未追蹤管理 | 潛在記憶體洩漏 |
| | 2. 無物件池（粒子、彈道） | 頻繁 GC 造成卡頓 |

---

## 設計系統建議

### 配色方案（Retro-Futurism 風格）

根據 UI/UX Pro Max 分析，建議採用 **復古未來主義（Retro-Futurism）** 風格，適合地牢塔防遊戲的黑暗氛圍。

| 角色 | 顏色 | Hex | 用途 |
|------|------|-----|------|
| **Primary** | 深石板灰 | `#1C1917` | 主要背景、深色面板 |
| **Secondary** | 暖灰色 | `#44403C` | 次要背景、卡片底色 |
| **Accent (CTA)** | 琥珀金 | `#CA8A04` | 重要按鈕、高亮元素 |
| **Background** | 淺灰白 | `#FAFAF9` | （保留，用於 light mode 未來擴充） |
| **Text** | 近黑 | `#0C0A09` | 主要文字（在淺背景上） |
| **Text Light** | 淺灰 | `#E5E5E5` | 主要文字（在深背景上） |
| **Success** | 翠綠 | `#10B981` | 勝利、正面回饋 |
| **Warning** | 橙黃 | `#F59E0B` | 警告、注意事項 |
| **Danger** | 紅色 | `#EF4444` | 錯誤、負面回饋 |
| **Info** | 藍紫 | `#8B5CF6` | 資訊、中性提示 |

**特殊效果顏色**：
- **霓虹藍**：`#00D4FF` - 升級特效、能量光環
- **霓虹紫**：`#A855F7` - 稀有效果、傳奇升級
- **霓虹綠**：`#22C55E` - 治療、增益效果

### 字體系統

```css
@import url('https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400;500;600;700&family=Jost:wght@300;400;500;600;700&display=swap');
```

| 用途 | 字體 | 權重 | 範例 |
|------|------|------|------|
| **遊戲標題** | Bodoni Moda | Bold (700) | "ProjectCircle" |
| **UI 標題** | Jost | SemiBold (600) | "Wave 2/3", "Enemies: 5" |
| **UI 正文** | Jost | Regular (400) | 按鈕文字、描述 |
| **數值顯示** | Jost | Medium (500) | "$250", "10/10 HP" |
| **副標題/提示** | Jost | Light (300) | "Dungeon Defense", 教學文字 |

**Phaser 實作範例**：
```typescript
// 在 BootScene 中載入 Web Fonts
WebFont.load({
  google: {
    families: ['Bodoni Moda:400,500,600,700', 'Jost:300,400,500,600,700']
  },
  active: () => {
    this.scene.start('MenuScene')
  }
})

// 使用範例
const title = this.add.text(x, y, 'ProjectCircle', {
  fontFamily: 'Bodoni Moda',
  fontSize: '48px',
  fontStyle: '700', // Bold
  color: '#E5E5E5'
})

const uiText = this.add.text(x, y, 'Wave 2/3', {
  fontFamily: 'Jost',
  fontSize: '16px',
  fontStyle: '600', // SemiBold
  color: '#E5E5E5'
})
```

### 視覺特效（Retro-Futurism）

#### 1. CRT 掃描線效果（Scanlines）

```typescript
// 在 UIScene 或 DungeonScene 創建全螢幕掃描線
private createScanlineOverlay(): void {
  const { width, height } = this.cameras.main

  const scanlines = this.add.graphics()
  scanlines.setDepth(9999) // 最上層
  scanlines.setAlpha(0.05)

  for (let y = 0; y < height; y += 4) {
    scanlines.fillStyle(0x000000, 1)
    scanlines.fillRect(0, y, width, 2)
  }

  // 可選：慢速捲動掃描線營造 CRT 效果
  this.tweens.add({
    targets: scanlines,
    y: 4,
    duration: 100,
    repeat: -1,
    ease: 'Linear'
  })
}
```

#### 2. 霓虹光暈（Neon Glow）

用於升級特效、重要按鈕：

```typescript
// 霓虹邊框按鈕
private createNeonButton(x: number, y: number, text: string): void {
  const buttonGfx = this.add.graphics()

  // 內部發光（box-shadow 模擬）
  buttonGfx.fillStyle(0xCA8A04, 0.2)
  buttonGfx.fillRoundedRect(x - 102, y - 22, 204, 44, 8)

  buttonGfx.fillStyle(0xCA8A04, 0.3)
  buttonGfx.fillRoundedRect(x - 100, y - 20, 200, 40, 6)

  // 主體
  buttonGfx.fillStyle(0x1C1917, 1)
  buttonGfx.fillRoundedRect(x - 98, y - 18, 196, 36, 4)

  // 霓虹邊框（使用多層模擬發光）
  buttonGfx.lineStyle(2, 0xCA8A04, 0.8)
  buttonGfx.strokeRoundedRect(x - 98, y - 18, 196, 36, 4)

  buttonGfx.lineStyle(1, 0xFFD700, 0.4)
  buttonGfx.strokeRoundedRect(x - 100, y - 20, 200, 40, 6)

  // 文字（帶霓虹發光效果，使用多層文字模擬）
  const shadowText = this.add.text(x, y, text, {
    fontFamily: 'Jost',
    fontSize: '18px',
    fontStyle: '600',
    color: '#CA8A04'
  }).setOrigin(0.5).setAlpha(0.5)

  const mainText = this.add.text(x, y, text, {
    fontFamily: 'Jost',
    fontSize: '18px',
    fontStyle: '600',
    color: '#FFDD88'
  }).setOrigin(0.5)

  // 脈動動畫
  this.tweens.add({
    targets: [buttonGfx, shadowText],
    alpha: { from: 0.8, to: 1.0 },
    duration: 1200,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut'
  })
}
```

#### 3. Glitch 故障效果（用於擊殺特效）

```typescript
private playGlitchEffect(sprite: Phaser.GameObjects.Sprite): void {
  const originalX = sprite.x

  // 快速左右抖動
  this.tweens.add({
    targets: sprite,
    x: originalX + 3,
    duration: 50,
    yoyo: true,
    repeat: 3,
    ease: 'Linear',
    onComplete: () => {
      sprite.x = originalX
    }
  })

  // 色彩分離效果（使用 tint）
  const originalTint = sprite.tint
  sprite.setTint(0xFF0000) // 紅色通道
  this.time.delayedCall(50, () => {
    sprite.setTint(0x00FF00) // 綠色通道
  })
  this.time.delayedCall(100, () => {
    sprite.setTint(0x0000FF) // 藍色通道
  })
  this.time.delayedCall(150, () => {
    sprite.setTint(originalTint) // 恢復
  })
}
```

---

## UI 元件優化方案

### 1. Top Bar 改進（UIScene）

#### 現況問題
- 金幣和房間進度徽章過於簡單（黑色圓角矩形 + 文字）
- 圖示太小，難以辨識
- 無 hover 回饋

#### 優化方案

**金幣顯示（左側）**：
- ✅ 使用霓虹金色邊框 + 內部發光
- ✅ 增加金幣圖示尺寸（2.5x → 3x）
- ✅ 金幣增加時：綠色閃光 + 向上飄移的 "+50" 文字
- ✅ 金幣不足時：紅色抖動 + "Not enough gold!" 提示

**房間進度（右側）**：
- ✅ 使用進度條而非純文字（例：`[■■■□□] 3/5`）
- ✅ 完成房間時：金色光芒擴散 + "Room Conquered!" 文字

**波次指示（中央）**：
- ✅ 改用圖形化進度條（3 個點代表 3 波）
- ✅ 當前波次高亮（霓��藍）、完成波次（灰色）、未開始（暗灰）

**實作範例**：
```typescript
// 金幣不足提示
private showInsufficientGoldWarning(): void {
  // 抖動金幣徽章
  this.tweens.add({
    targets: this.goldBadge,
    x: this.goldBadge.x + 5,
    duration: 50,
    yoyo: true,
    repeat: 5,
    ease: 'Linear'
  })

  // 顯示文字提示
  const warning = this.add.text(
    this.goldBadge.x,
    this.goldBadge.y + 30,
    'Not enough gold!',
    {
      fontFamily: 'Jost',
      fontSize: '14px',
      fontStyle: '600',
      color: '#EF4444',
      stroke: '#000000',
      strokeThickness: 3
    }
  ).setOrigin(0.5).setAlpha(0)

  this.tweens.add({
    targets: warning,
    alpha: 1,
    y: warning.y - 10,
    duration: 300,
    ease: 'Back.easeOut',
    onComplete: () => {
      this.tweens.add({
        targets: warning,
        alpha: 0,
        delay: 1000,
        duration: 300,
        onComplete: () => warning.destroy()
      })
    }
  })
}

// 金幣增加飄移文字
private showGoldGainText(amount: number): void {
  const goldIcon = this.children.getByName('goldIcon') as Phaser.GameObjects.Sprite
  const floatText = this.add.text(
    goldIcon.x + 30,
    goldIcon.y,
    `+${amount}`,
    {
      fontFamily: 'Jost',
      fontSize: '16px',
      fontStyle: '600',
      color: '#10B981'
    }
  ).setOrigin(0.5)

  this.tweens.add({
    targets: floatText,
    y: floatText.y - 40,
    alpha: 0,
    duration: 1000,
    ease: 'Quad.easeOut',
    onComplete: () => floatText.destroy()
  })
}
```

### 2. 按鈕系統升級（MenuScene + 通用）

#### 現況問題
- 按鈕僅用簡單 drawPanel + 文字
- hover/press 狀態變化不明顯
- 無 disabled 狀態視覺
- 無 loading 狀態

#### 優化方案

創建統一的 `NeonButton` 類別：

```typescript
// src/ui/NeonButton.ts
export class NeonButton extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics
  private glowBg: Phaser.GameObjects.Graphics
  private label: Phaser.GameObjects.Text
  private loadingSpinner?: Phaser.GameObjects.Graphics
  private isDisabled: boolean = false
  private isLoading: boolean = false

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    width: number = 200,
    height: number = 50,
    color: number = 0xCA8A04 // 預設琥珀金
  ) {
    super(scene, x, y)

    // 外層發光
    this.glowBg = scene.add.graphics()
    this.glowBg.fillStyle(color, 0.2)
    this.glowBg.fillRoundedRect(-width/2 - 4, -height/2 - 4, width + 8, height + 8, 8)
    this.add(this.glowBg)

    // 主體背景
    this.bg = scene.add.graphics()
    this.drawNormal(width, height, color)
    this.add(this.bg)

    // 文字
    this.label = scene.add.text(0, 0, text, {
      fontFamily: 'Jost',
      fontSize: '18px',
      fontStyle: '600',
      color: '#FFDD88'
    }).setOrigin(0.5)
    this.add(this.label)

    // 互動區域
    const hitZone = scene.add.zone(0, 0, width, height)
    hitZone.setInteractive({ useHandCursor: true })
    this.add(hitZone)

    // 事件處理
    hitZone.on('pointerover', () => this.onHover(width, height, color))
    hitZone.on('pointerout', () => this.onNormal(width, height, color))
    hitZone.on('pointerdown', () => this.onPress(width, height, color))

    scene.add.existing(this)
  }

  private drawNormal(w: number, h: number, color: number): void {
    this.bg.clear()
    this.bg.fillStyle(0x1C1917, 1)
    this.bg.fillRoundedRect(-w/2, -h/2, w, h, 4)
    this.bg.lineStyle(2, color, 0.8)
    this.bg.strokeRoundedRect(-w/2, -h/2, w, h, 4)
  }

  private onHover(w: number, h: number, color: number): void {
    if (this.isDisabled || this.isLoading) return

    this.bg.clear()
    this.bg.fillStyle(0x44403C, 1) // 亮一階
    this.bg.fillRoundedRect(-w/2, -h/2, w, h, 4)
    this.bg.lineStyle(2, color, 1.0)
    this.bg.strokeRoundedRect(-w/2, -h/2, w, h, 4)

    // 發光脈動
    this.scene.tweens.add({
      targets: this.glowBg,
      alpha: 0.4,
      duration: 200,
      ease: 'Quad.easeOut'
    })
  }

  private onNormal(w: number, h: number, color: number): void {
    if (this.isDisabled || this.isLoading) return
    this.drawNormal(w, h, color)

    this.scene.tweens.add({
      targets: this.glowBg,
      alpha: 0.2,
      duration: 200,
      ease: 'Quad.easeOut'
    })
  }

  private onPress(w: number, h: number, color: number): void {
    if (this.isDisabled || this.isLoading) return

    this.scene.tweens.add({
      targets: this,
      scaleX: 0.95,
      scaleY: 0.95,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut'
    })
  }

  setDisabled(disabled: boolean): void {
    this.isDisabled = disabled
    this.label.setAlpha(disabled ? 0.4 : 1)
    this.bg.setAlpha(disabled ? 0.5 : 1)
  }

  setLoading(loading: boolean): void {
    this.isLoading = loading
    this.label.setVisible(!loading)

    if (loading) {
      // 創建 loading spinner
      this.loadingSpinner = this.scene.add.graphics()
      this.loadingSpinner.lineStyle(3, 0xCA8A04, 1)
      this.loadingSpinner.arc(0, 0, 12, 0, Math.PI * 1.5)
      this.add(this.loadingSpinner)

      // 旋轉動畫
      this.scene.tweens.add({
        targets: this.loadingSpinner,
        angle: 360,
        duration: 1000,
        repeat: -1,
        ease: 'Linear'
      })
    } else {
      this.loadingSpinner?.destroy()
      this.loadingSpinner = undefined
    }
  }
}
```

**使用範例**：
```typescript
// MenuScene
const startButton = new NeonButton(this, width/2, height * 0.6, '開始遊戲', 220, 64)
startButton.on('pointerup', () => {
  startButton.setLoading(true)

  // 模擬載入
  this.time.delayedCall(500, () => {
    this.scene.start('DungeonScene')
  })
})
```

### 3. 怪物卡片（Deploy Panel）

#### 目標
在畫面底部顯示可部署的怪物卡片，類似卡牌遊戲的手牌區。

#### 設計規格

**卡片尺寸**：80x120px
**卡片間距**：12px
**位置**：畫面底部，水平置中排列

**卡片元素**：
1. **背景**：深色漸層 + 霓虹邊框（依兵種顏色）
2. **怪物圖示**：上方 1/2 區域
3. **名稱**：圖示下方（Jost SemiBold 12px）
4. **數量徽章**：右上角顯示 "x10"
5. **等級徽章**：左上角顯示 "Lv.2"
6. **CD 遮罩**：冷卻時顯示半透明黑色遮罩 + 倒數計時

**互動狀態**：
- **Normal**：淡金色邊框（alpha 0.5）
- **Hover**：邊框高亮（alpha 1.0）+ 卡片上浮 5px
- **Selected**：亮金色邊框 + 外層霓虹光暈
- **Disabled**：灰階濾鏡 + alpha 0.4

**實作範例**：
```typescript
// src/ui/MonsterCard.ts
export class MonsterCard extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics
  private icon: Phaser.GameObjects.Sprite
  private nameText: Phaser.GameObjects.Text
  private countBadge: Phaser.GameObjects.Container
  private levelBadge: Phaser.GameObjects.Container
  private cdOverlay?: Phaser.GameObjects.Graphics

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    monsterId: string,
    count: number,
    level: number
  ) {
    super(scene, x, y)

    const W = 80, H = 120

    // 背景漸層
    this.bg = scene.add.graphics()
    this.bg.fillGradientStyle(0x1C1917, 0x1C1917, 0x0C0A09, 0x0C0A09, 1, 1, 1, 1)
    this.bg.fillRoundedRect(-W/2, -H/2, W, H, 8)
    this.bg.lineStyle(2, 0xCA8A04, 0.5)
    this.bg.strokeRoundedRect(-W/2, -H/2, W, H, 8)
    this.add(this.bg)

    // 怪物圖示
    this.icon = scene.add.sprite(0, -20, `monster_${monsterId}`)
    this.icon.setScale(2)
    this.add(this.icon)

    // 名稱
    const displayName = this.getDisplayName(monsterId)
    this.nameText = scene.add.text(0, 35, displayName, {
      fontFamily: 'Jost',
      fontSize: '12px',
      fontStyle: '600',
      color: '#E5E5E5'
    }).setOrigin(0.5)
    this.add(this.nameText)

    // 數量徽章（右上角）
    this.countBadge = this.createBadge(W/2 - 15, -H/2 + 10, `x${count}`, '#10B981')
    this.add(this.countBadge)

    // 等級徽章（左上角）
    if (level > 1) {
      this.levelBadge = this.createBadge(-W/2 + 15, -H/2 + 10, `Lv.${level}`, '#CA8A04')
      this.add(this.levelBadge)
    }

    // 互動區域
    const hitZone = scene.add.zone(0, 0, W, H)
    hitZone.setInteractive({ useHandCursor: true })
    this.add(hitZone)

    hitZone.on('pointerover', () => this.onHover())
    hitZone.on('pointerout', () => this.onNormal())

    scene.add.existing(this)
  }

  private createBadge(x: number, y: number, text: string, color: string): Phaser.GameObjects.Container {
    const badge = this.scene.add.container(x, y)

    const bgCircle = this.scene.add.circle(0, 0, 12, 0x000000, 0.8)
    const badgeText = this.scene.add.text(0, 0, text, {
      fontFamily: 'Jost',
      fontSize: '10px',
      fontStyle: '600',
      color
    }).setOrigin(0.5)

    badge.add([bgCircle, badgeText])
    return badge
  }

  private onHover(): void {
    this.bg.clear()
    this.bg.fillGradientStyle(0x44403C, 0x44403C, 0x1C1917, 0x1C1917, 1, 1, 1, 1)
    this.bg.fillRoundedRect(-40, -60, 80, 120, 8)
    this.bg.lineStyle(2, 0xFFD700, 1.0)
    this.bg.strokeRoundedRect(-40, -60, 80, 120, 8)

    this.scene.tweens.add({
      targets: this,
      y: this.y - 5,
      duration: 150,
      ease: 'Back.easeOut'
    })
  }

  private onNormal(): void {
    this.bg.clear()
    this.bg.fillGradientStyle(0x1C1917, 0x1C1917, 0x0C0A09, 0x0C0A09, 1, 1, 1, 1)
    this.bg.fillRoundedRect(-40, -60, 80, 120, 8)
    this.bg.lineStyle(2, 0xCA8A04, 0.5)
    this.bg.strokeRoundedRect(-40, -60, 80, 120, 8)

    this.scene.tweens.add({
      targets: this,
      y: this.y + 5,
      duration: 150,
      ease: 'Quad.easeOut'
    })
  }

  private getDisplayName(monsterId: string): string {
    const names: Record<string, string> = {
      'goblin': 'Goblin',
      'skeleton': 'Skeleton',
      'orc': 'Orc'
    }
    return names[monsterId] || monsterId
  }

  updateCount(count: number): void {
    const badgeText = this.countBadge.getAt(1) as Phaser.GameObjects.Text
    badgeText.setText(`x${count}`)
  }

  updateLevel(level: number): void {
    if (level > 1 && !this.levelBadge) {
      this.levelBadge = this.createBadge(-40 + 15, -60 + 10, `Lv.${level}`, '#CA8A04')
      this.add(this.levelBadge)
    } else if (this.levelBadge) {
      const badgeText = this.levelBadge.getAt(1) as Phaser.GameObjects.Text
      badgeText.setText(`Lv.${level}`)
    }
  }

  setCooldown(remainingMs: number, totalMs: number): void {
    if (!this.cdOverlay) {
      this.cdOverlay = this.scene.add.graphics()
      this.add(this.cdOverlay)
    }

    const percent = remainingMs / totalMs
    this.cdOverlay.clear()
    this.cdOverlay.fillStyle(0x000000, 0.6)
    this.cdOverlay.fillRoundedRect(-40, -60 + (120 * (1 - percent)), 80, 120 * percent, 8)

    if (remainingMs <= 0) {
      this.cdOverlay.destroy()
      this.cdOverlay = undefined
    }
  }
}
```

### 4. 教學提示系統（Tutorial Tooltips）

#### 目標
首次遊玩時，顯示逐步教學提示，引導玩家了解操作。

#### 設計規格

**提示框樣式**：
- 深色半透明背景（`0x0C0A09, alpha 0.95`）
- 霓虹藍邊框（`#00D4FF`）
- 箭頭指向目標元素
- 文字使用 Jost Regular 14px

**提示序列**：
1. "Welcome! Click a monster card to select it."
2. "Click on the battlefield to deploy your monster."
3. "Defeat all enemies to conquer the room!"
4. "Earn gold to summon more monsters."

**實作範例**：
```typescript
// src/ui/TutorialTooltip.ts
export class TutorialTooltip extends Phaser.GameObjects.Container {
  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    text: string,
    arrowDirection: 'up' | 'down' | 'left' | 'right' = 'down'
  ) {
    super(scene, x, y)

    // 文字測量
    const tempText = scene.add.text(0, 0, text, {
      fontFamily: 'Jost',
      fontSize: '14px',
      wordWrap: { width: 250 }
    })
    const textWidth = tempText.width
    const textHeight = tempText.height
    tempText.destroy()

    const padding = 12
    const boxW = textWidth + padding * 2
    const boxH = textHeight + padding * 2

    // 背景
    const bg = scene.add.graphics()
    bg.fillStyle(0x0C0A09, 0.95)
    bg.fillRoundedRect(-boxW/2, -boxH/2, boxW, boxH, 8)
    bg.lineStyle(2, 0x00D4FF, 0.8)
    bg.strokeRoundedRect(-boxW/2, -boxH/2, boxW, boxH, 8)
    this.add(bg)

    // 箭頭（根據方向）
    const arrow = scene.add.graphics()
    arrow.fillStyle(0x0C0A09, 0.95)
    arrow.lineStyle(2, 0x00D4FF, 0.8)

    if (arrowDirection === 'down') {
      arrow.beginPath()
      arrow.moveTo(0, boxH/2)
      arrow.lineTo(-8, boxH/2 + 12)
      arrow.lineTo(8, boxH/2 + 12)
      arrow.closePath()
      arrow.fillPath()
      arrow.strokePath()
    }
    // ... 其他方向的箭頭實作

    this.add(arrow)

    // 文字
    const label = scene.add.text(0, 0, text, {
      fontFamily: 'Jost',
      fontSize: '14px',
      color: '#E5E5E5',
      wordWrap: { width: 250 },
      align: 'center'
    }).setOrigin(0.5)
    this.add(label)

    // 淡入動畫
    this.setAlpha(0)
    scene.tweens.add({
      targets: this,
      alpha: 1,
      duration: 300,
      ease: 'Quad.easeOut'
    })

    scene.add.existing(this)
  }

  dismiss(): void {
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      duration: 200,
      ease: 'Quad.easeIn',
      onComplete: () => this.destroy()
    })
  }
}
```

### 5. 統計面板（Stats Panel）

#### 目標
戰鬥結束後，顯示戰鬥統計資料（擊殺數、傷害、金幣獲得等）。

#### 設計規格

**面板佈局**：
- 半透明深色背景（全螢幕遮罩）
- 中央卡片（400x500px）
- 標題："Battle Summary"
- 統計項目（圖示 + 數值）：
  - Kills: 24
  - Damage Dealt: 1,250
  - Gold Earned: +150
  - Rooms Conquered: 3/5
- 底部按鈕："Continue" / "Back to Menu"

**實作範例**（省略，與 NeonButton 類似模式）

---

## 音效系統

### 音效清單

| 事件 | 音效描述 | 音量 |
|------|---------|------|
| **UI 互動** | | |
| 按鈕 hover | 輕微「嗶」聲 | 0.3 |
| 按鈕點擊 | 清脆「咔」聲 | 0.5 |
| 卡片選擇 | 卡片翻轉聲 | 0.4 |
| 錯誤提示 | 短促「咚」聲 | 0.6 |
| **戰鬥** | | |
| 怪物部署 | 傳送聲（嗖～） | 0.5 |
| 怪物攻擊 | 揮擊聲（咻！） | 0.4 |
| 冒險者死亡 | 爆炸聲 + 金幣聲 | 0.7 |
| 怪物死亡 | 慘叫聲 | 0.6 |
| **升級** | | |
| 兵種升級 | 昇華聲（叮～～） | 0.8 |
| 獲得金幣 | 金幣碰撞聲 | 0.5 |
| **房間** | | |
| 房間征服 | 勝利號角 | 0.9 |
| 波次開始 | 戰鬥鼓聲 | 0.7 |
| 波次結束 | 舒緩鐘聲 | 0.6 |

### 音效實作

```typescript
// BootScene 載入音效
this.load.audio('ui_hover', 'assets/sfx/ui_hover.mp3')
this.load.audio('ui_click', 'assets/sfx/ui_click.mp3')
this.load.audio('monster_spawn', 'assets/sfx/monster_spawn.mp3')
this.load.audio('upgrade', 'assets/sfx/upgrade.mp3')
// ... 其他音效

// 使用範例
button.on('pointerover', () => {
  this.sound.play('ui_hover', { volume: 0.3 })
})

button.on('pointerup', () => {
  this.sound.play('ui_click', { volume: 0.5 })
})
```

**音效資源建議**：
- 使用 [freesound.org](https://freesound.org/) 尋找 CC0 音效
- 或使用 [sfxr](https://sfxr.me/) 生成復古遊戲音效（符合 Retro-Futurism 風格）

---

## 效能優化

### 1. 物件池（Object Pooling）

針對頻繁創建/銷毀的物件（彈道、粒子效果、傷害數字），使用物件池：

```typescript
// src/utils/object-pool.ts
export class ObjectPool<T extends Phaser.GameObjects.GameObject> {
  private pool: T[] = []
  private active: T[] = []

  constructor(
    private scene: Phaser.Scene,
    private factory: () => T,
    private initialSize: number = 10
  ) {
    for (let i = 0; i < initialSize; i++) {
      const obj = factory()
      obj.setActive(false).setVisible(false)
      this.pool.push(obj)
    }
  }

  get(): T {
    let obj = this.pool.pop()
    if (!obj) {
      obj = this.factory()
    }
    obj.setActive(true).setVisible(true)
    this.active.push(obj)
    return obj
  }

  release(obj: T): void {
    const index = this.active.indexOf(obj)
    if (index !== -1) {
      this.active.splice(index, 1)
    }
    obj.setActive(false).setVisible(false)
    this.pool.push(obj)
  }

  clear(): void {
    for (const obj of this.active) {
      obj.destroy()
    }
    for (const obj of this.pool) {
      obj.destroy()
    }
    this.active = []
    this.pool = []
  }
}

// 使用範例
private projectilePool: ObjectPool<Phaser.GameObjects.Sprite>

create() {
  this.projectilePool = new ObjectPool(
    this,
    () => this.add.sprite(0, 0, 'projectile'),
    20
  )
}

fireProjectile(x: number, y: number, targetX: number, targetY: number) {
  const projectile = this.projectilePool.get()
  projectile.setPosition(x, y)

  this.tweens.add({
    targets: projectile,
    x: targetX,
    y: targetY,
    duration: 500,
    onComplete: () => {
      this.projectilePool.release(projectile)
    }
  })
}
```

### 2. Tween 管理

追蹤並清理所有 tween，防止記憶體洩漏：

```typescript
// BattlePhase 類別中
private activeTweens: Phaser.Tweens.Tween[] = []

private addManagedTween(tween: Phaser.Tweens.Tween): Phaser.Tweens.Tween {
  this.activeTweens.push(tween)
  tween.once('complete', () => {
    const index = this.activeTweens.indexOf(tween)
    if (index !== -1) this.activeTweens.splice(index, 1)
  })
  return tween
}

cleanup() {
  for (const tween of this.activeTweens) {
    tween.stop()
    tween.remove()
  }
  this.activeTweens = []
}
```

### 3. 減少 Graphics 重繪

使用 RenderTexture 快取靜態圖形：

```typescript
// 將房間地板繪製為 RenderTexture，避免每幀重繪
const floorRT = this.add.renderTexture(0, 0, 800, 800)
const floorGfx = this.add.graphics()
// ... 繪製地板
floorRT.draw(floorGfx)
floorGfx.destroy() // 銷毀原始 Graphics
```

---

## 實作優先級

### Phase 1: 核心視覺改進（高優先級）

- [x] 設計系統定義（顏色、字體、特效）
- [ ] Top Bar 改進（金幣、房間進度、波次指示）
- [ ] NeonButton 元件實作
- [ ] 音效系統整合

**預估時間**：2-3 天

### Phase 2: 遊戲性 UI（中優先級）

- [ ] MonsterCard 元件實作
- [ ] Deploy Panel 佈局
- [ ] 教學提示系統
- [ ] 統計面板

**預估時間**：3-4 天

### Phase 3: 特效與打磨（中優先級）

- [ ] CRT 掃描線效果
- [ ] 霓虹光暈特效
- [ ] Glitch 故障效果
- [ ] 升級特效增強

**預估時間**：2-3 天

### Phase 4: 效能優化（低優先級）

- [ ] 物件池實作
- [ ] Tween 管理系統
- [ ] RenderTexture 優化

**預估時間**：1-2 天

---

## 驗收標準

### 視覺品質
- [ ] 所有 UI 元件使用統一的設計系統（顏色、字體、圓角）
- [ ] 按鈕有清晰的 normal/hover/press/disabled 狀態
- [ ] 文字可讀性良好（對比度 4.5:1 以上）
- [ ] 特效不影響遊戲性能（維持 60 FPS）

### 互動體驗
- [ ] 所有可點擊元素有 cursor-pointer
- [ ] Hover 狀態有視覺回饋（150-300ms 過渡）
- [ ] Loading 狀態有明確指示（spinner 或 skeleton）
- [ ] 錯誤提示清晰易懂

### 音效回饋
- [ ] UI 互動有音效（hover/click）
- [ ] 戰鬥事件有音效（攻擊/死亡/升級）
- [ ] 音量平衡，不刺耳

### 效能
- [ ] 戰鬥場景維持 60 FPS
- [ ] 無記憶體洩漏（長時間遊玩不卡頓）
- [ ] 場景切換流暢（< 500ms）

---

## 參考資源

### 設計靈感
- **Slay the Spire** - 卡片 UI 設計
- **Inscryption** - 黑暗主題 + 霓虹效果
- **Hades** - 戰鬥 UI 佈局
- **Dead Cells** - 復古未來主義風格

### 技術文件
- [Phaser 3 UI Plugin](https://rexrainbow.github.io/phaser3-rex-notes/docs/site/ui-overview/)
- [WebFontLoader](https://github.com/typekit/webfontloader)
- [Phaser Object Pooling Guide](https://phaser.io/tutorials/object-pooling)

---

## 結論

本優化方案針對 ProjectCircle 遊戲的「陽春」介面問題，提供了全面的改進建議：

1. **設計系統**：Retro-Futurism 風格 + 統一配色 + 專業字體
2. **UI 元件**：NeonButton、MonsterCard、教學提示、統計面板
3. **特效系統**：CRT 掃描線、霓虹光暈、Glitch 效果
4. **音效回饋**：完整的 UI 和戰鬥音效
5. **效能優化**：物件池、Tween 管理、RenderTexture

建議按 **Phase 1 → Phase 2 → Phase 3 → Phase 4** 順序實作，優先完成視覺改進和核心 UI 元件，確保遊戲體驗的顯著提升。
