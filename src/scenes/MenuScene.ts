import Phaser from 'phaser'
import { gameStore } from '../state/game-store'
import { createInitialRunState } from '../state/game-state'
import { DataRegistry } from '../data/registry'
import { drawPanel } from '../utils/visual-factory'
import { UI_ACCENT } from '../config/constants'

const EVOLUTION_XP_THRESHOLD = 30

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' })
  }

  create(): void {
    const { width, height } = this.cameras.main

    // === 背景漸層（參考 ProjectDK：深紫藍底色，非純黑） ===
    const bgGfx = this.add.graphics()
    // 底色漸層：從深紫藍（頂部）到近黑（底部）
    const bgSteps = 20
    for (let i = 0; i < bgSteps; i++) {
      const t = i / bgSteps
      const r = Math.round(12 + (1 - t) * 8)   // 20 → 12
      const g = Math.round(10 + (1 - t) * 6)    // 16 → 10
      const b = Math.round(20 + (1 - t) * 16)   // 36 → 20
      const color = (r << 16) | (g << 8) | b
      const stripH = Math.ceil(height / bgSteps)
      bgGfx.fillStyle(color, 1)
      bgGfx.fillRect(0, i * stripH, width, stripH + 1)
    }

    // === 大面積可見光暈（ProjectDK 風格：alpha 0.12-0.2，非 0.03） ===
    const glows = [
      { x: width * 0.15, y: height * 0.2, r: 160, color: 0x3344aa, a: 0.12 },
      { x: width * 0.85, y: height * 0.45, r: 130, color: 0x5566cc, a: 0.10 },
      { x: width * 0.5,  y: height * 0.75, r: 140, color: 0x4a5a8a, a: 0.14 },
      { x: width * 0.3,  y: height * 0.6,  r: 100, color: 0x6644aa, a: 0.08 },
      { x: width * 0.7,  y: height * 0.15, r: 110, color: 0x445588, a: 0.09 },
    ]
    for (const g of glows) {
      const glow = this.add.circle(g.x, g.y, g.r, g.color, g.a)
      this.tweens.add({
        targets: glow,
        x: g.x + (Math.random() - 0.5) * 30,
        y: g.y + (Math.random() - 0.5) * 20,
        alpha: g.a * 1.5,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 3000 + Math.random() * 3000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    }

    // === 星點背景（30 顆微弱閃爍的白點） ===
    for (let s = 0; s < 30; s++) {
      const star = this.add.circle(
        Math.random() * width, Math.random() * height,
        0.5 + Math.random() * 0.5, 0xffffff, 0.1 + Math.random() * 0.2
      )
      this.tweens.add({
        targets: star,
        alpha: 0.05,
        duration: 1500 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000,
        ease: 'Sine.easeInOut',
      })
    }

    // === 標題光暈底層 ===
    const titleGlow = this.add.circle(width / 2, height * 0.3, 100, 0xffaa33, 0.12)
    this.tweens.add({
      targets: titleGlow,
      alpha: 0.08,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 2500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    // 遊戲標題（帶描邊 — ProjectDK 文字手法）
    const title = this.add.text(width / 2, height * 0.3, 'ProjectCircle', {
      fontSize: '42px',
      color: '#f0e8d8',
      fontStyle: 'bold',
      stroke: '#0a0810',
      strokeThickness: 5,
    })
    title.setOrigin(0.5)
    title.setAlpha(0)
    title.setScale(0.9)
    this.tweens.add({
      targets: title,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      duration: 600,
      ease: 'Back.easeOut',
    })

    // 標題呼吸光暈
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.85 },
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay: 800,
    })

    // 副標題（帶描邊）
    const subtitle = this.add.text(width / 2, height * 0.3 + 50, '地牢防禦戰', {
      fontSize: '16px',
      color: '#a8a0b8',
      stroke: '#0a0810',
      strokeThickness: 2,
    })
    subtitle.setOrigin(0.5)
    subtitle.setAlpha(0)
    this.tweens.add({
      targets: subtitle,
      alpha: 1,
      delay: 400,
      duration: 400,
      ease: 'Quad.easeOut',
    })

    // === 按鈕（更大、有脈動邊框） ===
    const buttonWidth = 260
    const buttonHeight = 72
    const buttonX = width / 2
    const buttonY = height * 0.6

    // 按鈕底部光暈
    const btnGlow = this.add.circle(buttonX, buttonY, 100, UI_ACCENT, 0.1)
    this.tweens.add({
      targets: btnGlow,
      alpha: 0.15,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    })

    const buttonGfx = this.add.graphics()
    drawPanel(buttonGfx, buttonX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, 0.8, 10)
    // 脈動亮色邊框
    const btnBorderGfx = this.add.graphics()
    const drawBtnBorder = (alpha: number) => {
      btnBorderGfx.clear()
      btnBorderGfx.lineStyle(2, UI_ACCENT, alpha)
      btnBorderGfx.strokeRoundedRect(buttonX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, 10)
    }
    drawBtnBorder(0.4)
    // 邊框脈動
    this.tweens.addCounter({
      from: 0.3,
      to: 0.8,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onUpdate: (tween) => drawBtnBorder(tween.getValue() ?? 0.5),
    })

    // 按鈕文字（帶描邊）
    const buttonText = this.add.text(buttonX, buttonY, '開始遊戲', {
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 3,
    })
    buttonText.setOrigin(0.5)

    const hitZone = this.add.zone(buttonX, buttonY, buttonWidth, buttonHeight)
    hitZone.setInteractive({ useHandCursor: true })

    hitZone.on('pointerover', () => {
      buttonGfx.clear()
      drawPanel(buttonGfx, buttonX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, 0.9, 10)
      buttonGfx.lineStyle(2, UI_ACCENT, 1)
      buttonGfx.strokeRoundedRect(buttonX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, 10)
    })

    hitZone.on('pointerout', () => {
      buttonGfx.clear()
      drawPanel(buttonGfx, buttonX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, 0.8, 10)
      buttonGfx.setScale(1)
      buttonText.setScale(1)
    })

    hitZone.on('pointerdown', () => {
      buttonGfx.clear()
      drawPanel(buttonGfx, buttonX - buttonWidth / 2, buttonY - buttonHeight / 2, buttonWidth, buttonHeight, 1.0, 10)
      this.tweens.add({
        targets: [buttonGfx, buttonText],
        scaleX: 0.95,
        scaleY: 0.95,
        duration: 60,
        ease: 'Quad.easeOut',
      })
    })

    hitZone.on('pointerup', () => {
      // 彈回動畫
      this.tweens.add({
        targets: [buttonGfx, buttonText],
        scaleX: 1,
        scaleY: 1,
        duration: 100,
        ease: 'Back.easeOut',
      })

      // Initialize run state with 5 of each monster type for testing
      const STARTER_COUNT = 5
      const monsters: Array<{
        monsterId: string
        currentHP: number
        maxHP: number
        currentXP: number
        maxXP: number
        slotIndex: number
      }> = []
      for (const def of DataRegistry.getAllMonsters()) {
        for (let i = 0; i < STARTER_COUNT; i++) {
          monsters.push({
            monsterId: def.id,
            currentHP: def.stats.hp,
            maxHP: def.stats.hp,
            currentXP: 0,
            maxXP: EVOLUTION_XP_THRESHOLD,
            slotIndex: -1,
          })
        }
      }

      gameStore.dispatch(state => ({
        ...state,
        run: {
          ...createInitialRunState(),
          monsters,
        },
      }))

      this.scene.start('DungeonScene')
    })
  }
}
