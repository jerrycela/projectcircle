export const GAME_CONFIG = {
  // Display (portrait — like Rumble Raiders)
  GAME_WIDTH: 450,
  GAME_HEIGHT: 800,

  // Map
  TILE_SIZE: 64,
  MAP_WIDTH: 50,
  MAP_HEIGHT: 50,
  ROOM_COUNT: { min: 6, max: 10 },
  ROOM_SIZE: { min: 5, max: 10 },

  // Player
  PLAYER_HP: 306,
  PLAYER_MP: 100,
  PLAYER_ATTACK: { min: 26, max: 38 },
  PLAYER_CRIT_CHANCE: 0.05,
  PLAYER_CRIT_DAMAGE: 1.35,
  PLAYER_SPEED: 200,
  PLAYER_MP_REGEN: 2,
  PLAYER_INVINCIBLE_MS: 500,

  // Combat
  ATTACK_RANGE: 150,
  ATTACK_COOLDOWN: 800,
  ATTACK_SCAN_INTERVAL: 250,
  KNOCKBACK_FORCE: 100,
  KNOCKBACK_DURATION: 200,

  // Enemy (Floor 1 baseline)
  SPIDER_HP: 50,
  SPIDER_SPEED: 80,
  SPIDER_ATTACK: 10,
  SPIDER_ATTACK_COOLDOWN: 1500,
  SPIDER_ATTACK_RANGE: 30,
  ENEMIES_PER_ROOM: { min: 3, max: 6 },

  // Loot
  LOOT_MAGNET_RANGE: 80,
  HEALTH_ORB_HEAL: 30,

  // Room
  SPAWN_SAFETY_FROM_PLAYER: 100,
  SPAWN_SAFETY_FROM_WALL: 32,
  ROOM_ENTER_PADDING: 32,

  // Joystick
  JOYSTICK_DEAD_ZONE: 5,
  JOYSTICK_MAX_RADIUS: 60,

  // Altar
  ALTAR_ACTIVATE_RANGE: 60,
  ALTAR_ARM_DELAY: 500,
  ALTAR_SIZE: 48,

  // Recovery (HP regen)
  PLAYER_RECOVERY: 0, // base recovery (0 = none until upgraded)

  // Armor
  PLAYER_ARMOR: 0, // base armor (0 = none until upgraded)
} as const;

export interface UpgradeDefinition {
  name: string;
  description: string;
  statKeys: string[];
  effectPerLevel: number[];
  baseCost: number;
  costScale: number;
  maxLevel: number;
}

export const UPGRADE_DEFS: Record<string, UpgradeDefinition> = {
  attack: {
    name: 'Attack+',
    description: '+4 Attack Power',
    statKeys: ['attackMin', 'attackMax'],
    effectPerLevel: [4, 4],
    baseCost: 20,
    costScale: 15,
    maxLevel: 10,
  },
  armor: {
    name: 'Armor+',
    description: '+3 Armor',
    statKeys: ['armor'],
    effectPerLevel: [3],
    baseCost: 15,
    costScale: 10,
    maxLevel: 10,
  },
  critDamage: {
    name: 'Crit Damage+',
    description: '+10% Crit Damage',
    statKeys: ['critDamage'],
    effectPerLevel: [0.10],
    baseCost: 25,
    costScale: 20,
    maxLevel: 5,
  },
  recovery: {
    name: 'Recovery+',
    description: '+1 HP/s Regen',
    statKeys: ['recovery'],
    effectPerLevel: [1],
    baseCost: 20,
    costScale: 15,
    maxLevel: 5,
  },
  moveSpeed: {
    name: 'Move Speed+',
    description: '+15 Speed',
    statKeys: ['moveSpeed'],
    effectPerLevel: [15],
    baseCost: 30,
    costScale: 20,
    maxLevel: 3,
  },
  maxHp: {
    name: 'Max HP+',
    description: '+30 Max HP',
    statKeys: ['maxHp'],
    effectPerLevel: [30],
    baseCost: 15,
    costScale: 10,
    maxLevel: 10,
  },
};
