/**
 * 視覺工廠 - 使用 Phaser Graphics 繪製單位、房間與 UI 元件
 * DW3 地牢風格：「在黑暗地牢中，只看見重要的東西」
 */

import Phaser from 'phaser';
import type { MonsterType, HeroType, Faction } from '../config/constants';
import {
  ALLY_COLOR,
  ALLY_OUTLINE,
  ENEMY_COLOR,
  ENEMY_OUTLINE,
  ROOM_FLOOR,
  ROOM_WALL,
  ROOM_ACCENT,
  ROOM_FLOOR_TILE,
  UI_BG,
  UI_BORDER,
  UI_BORDER_LIGHT,
  TILE_SIZE,
} from '../config/constants';

/**
 * 建立怪物圖形
 * - 圓形 = 肉盾 (食人魔)
 * - 三角形 = 輸出 (哥布林)
 * - 菱形 = 遠程 (骷髏兵)
 */
export function createMonsterGraphics(
  scene: Phaser.Scene,
  type: MonsterType,
  faction: Faction = 'ally'
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  const size = TILE_SIZE / 2;
  const color = faction === 'ally' ? ALLY_COLOR : ENEMY_COLOR;
  const outline = faction === 'ally' ? ALLY_OUTLINE : ENEMY_OUTLINE;

  graphics.lineStyle(2, outline, 1);
  graphics.fillStyle(color, 1);

  switch (type) {
    case 'ogre': // 圓形 - 肉盾
      graphics.fillCircle(0, 0, size);
      graphics.strokeCircle(0, 0, size);
      break;

    case 'goblin': // 三角形 - 輸出
      graphics.beginPath();
      graphics.moveTo(0, -size);
      graphics.lineTo(size, size);
      graphics.lineTo(-size, size);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      break;

    case 'skeleton': // 菱形 - 遠程
      graphics.beginPath();
      graphics.moveTo(0, -size);
      graphics.lineTo(size, 0);
      graphics.lineTo(0, size);
      graphics.lineTo(-size, 0);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      break;
  }

  return graphics;
}

/**
 * 建立英雄圖形
 * - 正方形 = 冒險者
 * - 六邊形 = 聖騎士
 */
export function createHeroGraphics(
  scene: Phaser.Scene,
  type: HeroType
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();
  const size = TILE_SIZE / 2;
  const color = ENEMY_COLOR;
  const outline = ENEMY_OUTLINE;

  graphics.lineStyle(2, outline, 1);
  graphics.fillStyle(color, 1);

  switch (type) {
    case 'adventurer': // 正方形
      graphics.fillRect(-size, -size, size * 2, size * 2);
      graphics.strokeRect(-size, -size, size * 2, size * 2);
      break;

    case 'paladin': // 六邊形（較大）
      graphics.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = Math.cos(angle) * size * 1.2;
        const y = Math.sin(angle) * size * 1.2;
        if (i === 0) {
          graphics.moveTo(x, y);
        } else {
          graphics.lineTo(x, y);
        }
      }
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      break;
  }

  return graphics;
}

/**
 * 建立房間圖形（地板底色）
 */
export function createRoomGraphics(
  scene: Phaser.Scene,
  width: number,
  height: number
): Phaser.GameObjects.Graphics {
  const graphics = scene.add.graphics();

  // 地板
  graphics.fillStyle(ROOM_FLOOR, 1);
  graphics.fillRect(0, 0, width, height);

  // 邊框
  graphics.lineStyle(4, ROOM_WALL, 1);
  graphics.strokeRect(0, 0, width, height);

  // 角落裝飾
  const cornerSize = 8;
  graphics.fillStyle(ROOM_ACCENT, 1);
  graphics.fillRect(0, 0, cornerSize, cornerSize);
  graphics.fillRect(width - cornerSize, 0, cornerSize, cornerSize);
  graphics.fillRect(0, height - cornerSize, cornerSize, cornerSize);
  graphics.fillRect(width - cornerSize, height - cornerSize, cornerSize, cornerSize);

  return graphics;
}

// ============ DW3 共用視覺工具 ============

/**
 * 繪製多層面板（像素藝術風格）
 * 5 層結構：陰影 → 純色背景 → 實色邊框 → 頂部高光 → 底部暗線
 */
export function drawPanel(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  bgAlpha: number = 0.7,
  cornerRadius: number = 6
): void {
  // Layer 1: 底部陰影（偏移 2px）
  graphics.fillStyle(0x000000, bgAlpha * 0.4);
  graphics.fillRoundedRect(x + 1, y + 2, width, height, cornerRadius);

  // Layer 2: 主背景填充（純色）
  graphics.fillStyle(UI_BG, bgAlpha);
  graphics.fillRoundedRect(x, y, width, height, cornerRadius);

  // Layer 3: 2px 實色邊框（像素風核心特徵）
  graphics.lineStyle(2, UI_BORDER, 0.9);
  graphics.strokeRoundedRect(x, y, width, height, cornerRadius);

  // Layer 4: 頂部 1px 高光線
  graphics.lineStyle(1, UI_BORDER_LIGHT, 0.5);
  graphics.beginPath();
  graphics.moveTo(x + cornerRadius, y + 1);
  graphics.lineTo(x + width - cornerRadius, y + 1);
  graphics.strokePath();

  // Layer 5: 底部 1px 暗線
  graphics.lineStyle(1, 0x0a0810, 0.6);
  graphics.beginPath();
  graphics.moveTo(x + cornerRadius, y + height - 1);
  graphics.lineTo(x + width - cornerRadius, y + height - 1);
  graphics.strokePath();
}

/**
 * 增強 HP 條（40x8px，帶漸層、高光、外框陰影 — ProjectDK 風格）
 * >60% 綠 / >30% 黃 / <=30% 紅
 */
export function drawEnhancedHPBar(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  currentHP: number,
  maxHP: number
): void {
  graphics.clear()
  const barWidth = 40
  const barHeight = 8
  const left = x - barWidth / 2
  const top = y

  // 外框陰影（下偏 1px）
  graphics.fillStyle(0x000000, 0.5)
  graphics.fillRect(left + 1, top + 1, barWidth, barHeight)

  // 背景（深色凹槽）
  graphics.fillStyle(0x0e0e16, 1)
  graphics.fillRect(left, top, barWidth, barHeight)

  // HP 填充
  const pct = Math.max(0, currentHP / maxHP)
  const fillColor = pct > 0.6 ? 0x44cc66 : pct > 0.3 ? 0xddaa44 : 0xdd4444
  const darkColor = pct > 0.6 ? 0x228844 : pct > 0.3 ? 0xaa7722 : 0xaa2222
  const fillW = Math.round(barWidth * pct)
  if (fillW > 0) {
    // 下半較暗（模擬漸層）
    graphics.fillStyle(darkColor, 1)
    graphics.fillRect(left, top, fillW, barHeight)
    // 上半較亮
    graphics.fillStyle(fillColor, 1)
    graphics.fillRect(left, top, fillW, Math.ceil(barHeight * 0.55))
    // 頂部高光線
    const hlColor = pct > 0.6 ? 0x88ffaa : pct > 0.3 ? 0xffdd88 : 0xff8888
    graphics.fillStyle(hlColor, 0.5)
    graphics.fillRect(left + 1, top + 1, fillW - 2, 1)
  }

  // 外邊框
  graphics.lineStyle(1, 0x444466, 1)
  graphics.strokeRect(left, top, barWidth, barHeight)
}

/**
 * 建立帶背景的文字元件（pill shape badge）
 * 返回 Container（Graphics bg + Text）
 */
export function createTextBadge(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  options: {
    fontSize?: string;
    color?: string;
    bgAlpha?: number;
    paddingX?: number;
    paddingY?: number;
  } = {}
): Phaser.GameObjects.Container {
  const {
    fontSize = '14px',
    color = '#eeeeee',
    bgAlpha = 0.6,
    paddingX = 10,
    paddingY = 4,
  } = options;

  const container = scene.add.container(x, y);

  // 先建立文字以測量尺寸
  const textObj = scene.add.text(0, 0, text, {
    fontSize,
    color,
    fontFamily: 'monospace',
  });
  textObj.setOrigin(0.5);

  // 背景 pill shape
  const bgWidth = textObj.width + paddingX * 2;
  const bgHeight = textObj.height + paddingY * 2;
  const bg = scene.add.graphics();
  bg.fillStyle(UI_BG, bgAlpha);
  bg.fillRoundedRect(-bgWidth / 2, -bgHeight / 2, bgWidth, bgHeight, bgHeight / 2);

  container.add(bg);
  container.add(textObj);

  // 儲存 text 參照以便外部更新
  container.setData('textObj', textObj);
  container.setData('bgGraphics', bg);

  return container;
}

/**
 * 受擊粒子效果
 * 混合大小粒子向外擴散，支援自訂顏色
 */
export function spawnHitParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number = 4,
  color: number = 0xffffff
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 25 + Math.random() * 45;
    const targetX = x + Math.cos(angle) * speed;
    const targetY = y + Math.sin(angle) * speed;
    const isLarge = i % 2 === 0;
    const radius = isLarge ? 3 : 1.5;

    const particle = scene.add.circle(x, y, radius, color, 0.9);

    scene.tweens.add({
      targets: particle,
      x: targetX,
      y: targetY,
      alpha: 0,
      scaleX: 0.3,
      scaleY: 0.3,
      duration: isLarge ? 280 : 200,
      ease: 'Quad.easeOut',
      onComplete: () => {
        particle.destroy();
      },
    });
  }
}

/**
 * 繪製地磚格紋圖案
 * 兩色交錯繪製（ROOM_FLOOR + ROOM_FLOOR_TILE）
 */
export function drawFloorTiles(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  tileSize: number = 20
): void {
  const cols = Math.ceil(width / tileSize);
  const rows = Math.ceil(height / tileSize);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const isAlt = (row + col) % 2 === 1;
      const color = isAlt ? ROOM_FLOOR_TILE : ROOM_FLOOR;
      graphics.fillStyle(color, 1);

      const tileX = x + col * tileSize;
      const tileY = y + row * tileSize;
      const tw = Math.min(tileSize, x + width - tileX);
      const th = Math.min(tileSize, y + height - tileY);
      graphics.fillRect(tileX, tileY, tw, th);
    }
  }
}

/**
 * 受擊閃白 + scale 微震效果
 * 支援 Arc（舊）和 Sprite（新）兩種類型
 */
export function flashUnit(
  scene: Phaser.Scene,
  sprite: Phaser.GameObjects.Arc | Phaser.GameObjects.Sprite,
  duration: number = 100
): void {
  if (sprite instanceof Phaser.GameObjects.Arc) {
    const originalColor = sprite.fillColor;
    sprite.setFillStyle(0xffffff);

    scene.tweens.add({
      targets: sprite,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    scene.time.delayedCall(duration, () => {
      if (sprite.active) {
        sprite.setFillStyle(originalColor);
      }
    });
  } else {
    // Sprite: 使用 tintFill 閃白
    sprite.setTintFill(0xffffff);

    const baseScale = sprite.scaleX;
    scene.tweens.add({
      targets: sprite,
      scaleX: baseScale * 1.15,
      scaleY: baseScale * 1.15,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeOut',
    });

    scene.time.delayedCall(duration, () => {
      if (sprite.active) {
        sprite.clearTint();
      }
    });
  }
}

/**
 * 建立投射物（帶拖尾效果）
 */
export function createProjectileFX(
  scene: Phaser.Scene,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number
): void {
  const projectile = scene.add.circle(fromX, fromY, 4, 0xffff88);

  // 拖尾：每 40ms 留一個漸消小點
  const trailInterval = scene.time.addEvent({
    delay: 40,
    repeat: -1,
    callback: () => {
      if (!projectile.active) return;
      const trail = scene.add.circle(projectile.x, projectile.y, 2, 0xffff88, 0.5);
      scene.tweens.add({
        targets: trail,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        duration: 150,
        onComplete: () => trail.destroy(),
      });
    },
  });

  scene.tweens.add({
    targets: projectile,
    x: toX,
    y: toY,
    duration: 200,
    onComplete: () => {
      trailInterval.destroy();
      projectile.destroy();
    },
  });
}

/**
 * 治療心形粒子效果
 * 小心形符號向上飄散，搭配綠色調
 */
export function spawnHeartParticles(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count: number = 4
): void {
  for (let i = 0; i < count; i++) {
    const offsetX = (Math.random() - 0.5) * 30;
    const startY = y + (Math.random() - 0.5) * 10;
    const color = i % 2 === 0 ? '#44ff44' : '#88ffaa';

    const heart = scene.add.text(x + offsetX, startY, '♥', {
      fontSize: `${10 + Math.random() * 6}px`,
      color,
      fontFamily: 'monospace',
    });
    heart.setOrigin(0.5);
    heart.setAlpha(0.9);

    scene.tweens.add({
      targets: heart,
      y: startY - 25 - Math.random() * 20,
      x: x + offsetX + (Math.random() - 0.5) * 15,
      alpha: 0,
      scaleX: 0.4,
      scaleY: 0.4,
      duration: 500 + Math.random() * 300,
      ease: 'Quad.easeOut',
      onComplete: () => heart.destroy(),
    });
  }
}

/**
 * 像素爆散死亡特效
 * 方形像素碎片向外爆散，模擬像素藝術風格的破碎效果
 */
export function spawnPixelBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  color: number = 0xffffff,
  count: number = 8
): void {
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + (Math.random() - 0.5) * 0.5;
    const speed = 30 + Math.random() * 50;
    const targetX = x + Math.cos(angle) * speed;
    const targetY = y + Math.sin(angle) * speed;
    const size = 2 + Math.random() * 3;

    // 方形像素碎片（核心像素藝術風格）
    const pixel = scene.add.rectangle(x, y, size, size, color, 0.9);
    pixel.setAngle(Math.random() * 360);

    scene.tweens.add({
      targets: pixel,
      x: targetX,
      y: targetY,
      alpha: 0,
      angle: pixel.angle + (Math.random() - 0.5) * 180,
      scaleX: 0.2,
      scaleY: 0.2,
      duration: 300 + Math.random() * 200,
      ease: 'Quad.easeOut',
      onComplete: () => pixel.destroy(),
    });
  }

  // 中心閃光
  const flash = scene.add.circle(x, y, 6, 0xffffff, 0.7);
  scene.tweens.add({
    targets: flash,
    scaleX: 2.5,
    scaleY: 2.5,
    alpha: 0,
    duration: 200,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy(),
  });
}
