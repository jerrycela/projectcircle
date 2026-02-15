/**
 * 視覺工廠 - 使用 Phaser Graphics 繪製單位與房間
 */

import type Phaser from 'phaser';
import type { MonsterType, HeroType, Faction } from '../config/constants';
import {
  ALLY_COLOR,
  ALLY_OUTLINE,
  ENEMY_COLOR,
  ENEMY_OUTLINE,
  ROOM_FLOOR,
  ROOM_WALL,
  ROOM_ACCENT,
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
