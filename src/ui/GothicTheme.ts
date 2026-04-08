// src/ui/GothicTheme.ts
import Phaser from 'phaser';

export const GOTHIC_COLORS = {
  // Stone border palette
  STONE_DARK: 0x1a1510,
  STONE_MID: 0x2a2520,
  STONE_SURFACE: 0x3a3228,
  STONE_HIGHLIGHT: 0x4a4238,
  STONE_PRESSED: 0x5a5248,

  // Globe fills
  GLOBE_HP_FILL: 0x8b0000,
  GLOBE_HP_EMPTY: 0x1e0a0a,
  GLOBE_MP_FILL: 0x1a0a3e,
  GLOBE_MP_EMPTY: 0x0a0a1e,

  // Environment
  FLOOR_TINT: 0x3a3228,
  WALL_TINT: 0x2a2520,

  // Text
  TEXT_PARCHMENT: 0xd4c4a0,
  TEXT_GOLD: 0xc9a44a,
  TEXT_BLOOD: 0x8b0000,

  // UI backgrounds
  PANEL_BG: 0x1e1a15,
  PANEL_BORDER: 0x2a2520,
} as const;

export const GOTHIC_FONTS = {
  BODY: {
    fontFamily: '"Pirata One", monospace',
    fontSize: '14px',
    color: '#d4c4a0',
    stroke: '#000000',
    strokeThickness: 2,
  } as Phaser.Types.GameObjects.Text.TextStyle,

  TITLE: {
    fontFamily: '"Pirata One", monospace',
    fontSize: '20px',
    color: '#d4c4a0',
    stroke: '#000000',
    strokeThickness: 3,
    fontStyle: 'bold',
  } as Phaser.Types.GameObjects.Text.TextStyle,

  GOLD: {
    fontFamily: '"Pirata One", monospace',
    fontSize: '13px',
    color: '#c9a44a',
    stroke: '#000000',
    strokeThickness: 2,
  } as Phaser.Types.GameObjects.Text.TextStyle,

  DEATH: {
    fontFamily: '"Pirata One", monospace',
    fontSize: '24px',
    color: '#8b0000',
    stroke: '#000000',
    strokeThickness: 4,
  } as Phaser.Types.GameObjects.Text.TextStyle,
} as const;

/** Draw a 4-layer stone rectangular frame */
export function drawStoneFrame(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
): void {
  // Outer shadow
  g.fillStyle(GOTHIC_COLORS.STONE_DARK);
  g.fillRect(x, y, w, h);
  // Mid border (inset 2px)
  g.fillStyle(GOTHIC_COLORS.STONE_MID);
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
  // Surface (inset 4px)
  g.fillStyle(GOTHIC_COLORS.STONE_SURFACE);
  g.fillRect(x + 4, y + 4, w - 8, h - 8);
  // Top/left highlight line
  g.lineStyle(1, GOTHIC_COLORS.STONE_HIGHLIGHT);
  g.beginPath();
  g.moveTo(x + 4, y + h - 5);
  g.lineTo(x + 4, y + 4);
  g.lineTo(x + w - 5, y + 4);
  g.strokePath();
  // Bottom/right shadow line
  g.lineStyle(1, GOTHIC_COLORS.STONE_DARK);
  g.beginPath();
  g.moveTo(x + 5, y + h - 5);
  g.lineTo(x + w - 5, y + h - 5);
  g.lineTo(x + w - 5, y + 5);
  g.strokePath();
}

/** Draw a gothic panel: PANEL_BG fill + stone frame border (P3 修正: merged helper) */
export function drawGothicPanel(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
): void {
  g.fillStyle(GOTHIC_COLORS.PANEL_BG);
  g.fillRect(x + 4, y + 4, w - 8, h - 8);
  drawStoneFrame(g, x, y, w, h);
}

/** Draw a stone-styled button (pressed inverts highlight/shadow) */
export function drawStoneButton(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, w: number, h: number,
  pressed: boolean = false,
): void {
  g.fillStyle(GOTHIC_COLORS.STONE_MID);
  g.fillRect(x, y, w, h);
  g.fillStyle(pressed ? GOTHIC_COLORS.STONE_DARK : GOTHIC_COLORS.STONE_SURFACE);
  g.fillRect(x + 2, y + 2, w - 4, h - 4);

  const hiColor = pressed ? GOTHIC_COLORS.STONE_DARK : GOTHIC_COLORS.STONE_HIGHLIGHT;
  const shColor = pressed ? GOTHIC_COLORS.STONE_HIGHLIGHT : GOTHIC_COLORS.STONE_DARK;
  g.lineStyle(1, hiColor);
  g.beginPath();
  g.moveTo(x + 2, y + h - 3);
  g.lineTo(x + 2, y + 2);
  g.lineTo(x + w - 3, y + 2);
  g.strokePath();
  g.lineStyle(1, shColor);
  g.beginPath();
  g.moveTo(x + 3, y + h - 3);
  g.lineTo(x + w - 3, y + h - 3);
  g.lineTo(x + w - 3, y + 3);
  g.strokePath();
}

/** Draw a stone circular frame (for globes, skill buttons) */
export function drawStoneCircle(
  g: Phaser.GameObjects.Graphics,
  x: number, y: number, radius: number,
): void {
  // Outer shadow ring
  g.lineStyle(4, GOTHIC_COLORS.STONE_DARK);
  g.strokeCircle(x, y, radius + 2);
  // Mid ring
  g.lineStyle(3, GOTHIC_COLORS.STONE_MID);
  g.strokeCircle(x, y, radius);
  // Inner highlight (top-left arc)
  g.lineStyle(1, GOTHIC_COLORS.STONE_HIGHLIGHT);
  g.beginPath();
  g.arc(x, y, radius - 1, Math.PI * 0.8, Math.PI * 1.8, false);
  g.strokePath();
}
