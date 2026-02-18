/**
 * 全域常數配置
 * 所有遊戲數值的唯一來源
 */

// === 畫面尺寸 ===
export const GAME_WIDTH = 390;
export const GAME_HEIGHT = 844;
export const TILE_SIZE = 32;

// === 房間尺寸 ===
export const ROOM_WIDTH = 350;
export const ROOM_HEIGHT = 400;

// === 單位數量上限 ===
export const MAX_ALLIES = 5;
export const MAX_ENEMIES = 5;
export const DEPLOY_SLOTS = 3;

// === 進化與波次 ===
export const EVOLUTION_XP_THRESHOLD = 30;
export const WAVE_INTERVAL = 3000; // ms
export const ENEMY_SPAWN_INTERVAL = 1000; // ms

// === 色彩體系（DW3 地牢風格） ===
// 我方（怪物）- 冷灰藍調
export const ALLY_COLOR = 0x4a7a8a;
export const ALLY_OUTLINE = 0x6a9aaa;
export const ALLY_DARK = 0x2a5a6a;
export const ALLY_HIGHLIGHT = 0x8abaca;

// 敵方（冒險者）- 暗金褐調
export const ENEMY_COLOR = 0xb89a6a;
export const ENEMY_OUTLINE = 0xd4b888;
export const ENEMY_DARK = 0x8a7a4a;
export const ENEMY_HIGHLIGHT = 0xe8d0a0;

// UI 色彩
export const UI_BG = 0x0c0c14;
export const UI_PANEL = 0x16161e;
export const UI_BORDER = 0x3a3a4e;
export const UI_BORDER_LIGHT = 0x5a5a6e;
export const UI_TEXT = 0xeeeeee;
export const UI_TEXT_DIM = 0x888899;
export const UI_ACCENT = 0x5588aa;
export const UI_GOLD = 0xd4aa44;
export const UI_DANGER = 0xcc4444;
export const UI_SUCCESS = 0x44aa66;

// 房間環境色
export const ROOM_FLOOR = 0x1a1a22;
export const ROOM_WALL = 0x0e0e16;
export const ROOM_ACCENT = 0x444455;
export const ROOM_FLOOR_TILE = 0x1e1e28;
export const ROOM_SHADOW = 0x08080c;

// === 部署冷卻時間（ms） ===
export const DEPLOY_COOLDOWNS = {
  goblin: 1000,
  skeleton: 2000,
  ogre: 3000,
} as const;

// === 消耗品價格 ===
export const CONSUMABLE_PRICES = {
  trap: 30,
  heal: 30,
  reinforcement: 50,
  crystal: 40,
} as const;

// === 經濟系統 ===
export const ECONOMY = {
  adventurerReward: 15,
  paladinReward: 30,
  treasuryIncome: 20,
} as const;

// === 單位類型 ===
export type MonsterType = 'goblin' | 'skeleton' | 'ogre';
export type HeroType = 'adventurer' | 'paladin';
export type Faction = 'ally' | 'enemy';
