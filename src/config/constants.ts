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

// === 色彩體系（像素藝術風格） ===
// 我方（怪物）- 明亮友方藍
export const ALLY_COLOR = 0x55bbdd;
export const ALLY_OUTLINE = 0x77ddff;
export const ALLY_DARK = 0x337799;
export const ALLY_HIGHLIGHT = 0x99eeff;

// 敵方（冒險者）- 明亮敵方橙
export const ENEMY_COLOR = 0xdd8844;
export const ENEMY_OUTLINE = 0xffaa66;
export const ENEMY_DARK = 0xaa6622;
export const ENEMY_HIGHLIGHT = 0xffcc88;

// UI 色彩（像素藝術風格 — 暖紫色調）
export const UI_BG = 0x1a1428;
export const UI_PANEL = 0x221a30;
export const UI_BORDER = 0x6a5acd;
export const UI_BORDER_LIGHT = 0x8a7ae8;
export const UI_TEXT = 0xf0e8d8;
export const UI_TEXT_DIM = 0xa8a0b8;
export const UI_ACCENT = 0xffaa33;
export const UI_GOLD = 0xffd700;
export const UI_DANGER = 0xff5555;
export const UI_SUCCESS = 0x55dd88;

// UI 色彩 HEX 字串格式（供 Phaser Text style 使用）
export const UI_TEXT_HEX = '#f0e8d8';
export const UI_TEXT_DIM_HEX = '#a8a0b8';
export const UI_GOLD_HEX = '#ffd700';
export const UI_ACCENT_HEX = '#ffaa33';
export const UI_DANGER_HEX = '#ff5555';
export const UI_SUCCESS_HEX = '#55dd88';
export const ALLY_COLOR_HEX = '#55bbdd';
export const ENEMY_COLOR_HEX = '#dd8844';

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
  spike_trap: 15,
  slow_swamp: 20,
  bouncer: 35,
  weaken_totem: 30,
  alarm_bell: 25,
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
export type HeroType = 'adventurer' | 'paladin' | 'thief' | 'priest';
export type Faction = 'ally' | 'enemy';
