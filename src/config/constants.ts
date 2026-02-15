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

// === 色彩體系（地下城主題） ===
// 我方（怪物）- 紫色調
export const ALLY_COLOR = 0x8844aa;
export const ALLY_OUTLINE = 0xaa66cc;
export const ALLY_DARK = 0x662288;

// 敵方（冒險者）- 金色調
export const ENEMY_COLOR = 0xddaa44;
export const ENEMY_OUTLINE = 0xffcc66;
export const ENEMY_DARK = 0xbb8822;

// UI 色彩
export const UI_BG = 0x1a1a2e;
export const UI_PANEL = 0x252544;
export const UI_BORDER = 0x444466;
export const UI_TEXT = 0xeeeeee;
export const UI_TEXT_DIM = 0x999999;

// 房間環境色
export const ROOM_FLOOR = 0x2a2a3e;
export const ROOM_WALL = 0x1a1a28;
export const ROOM_ACCENT = 0x444455;

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
