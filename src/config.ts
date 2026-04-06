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

export interface EnemyConfig {
  type: string;
  textureKey: string;
  size: number;
  hp: number;
  speed: number;
  attack: number;
  attackCooldown: number;
  attackRange: number;
  aiType: 'chase' | 'charge' | 'shield' | 'summon';
  chargeConfig?: {
    chargeSpeed: number;
    windupMs: number;
    stunMs: number;
    maxDistance: number;
    triggerRange: number;
  };
  summonConfig?: {
    summonType: string;
    summonInterval: number;
    maxMinions: number;
    windupMs: number;
    cooldownMs: number;
    retreatDistance: number;
    minionHpScale: number;
    minionAtkScale: number;
  };
  shieldConfig?: {
    shieldArc: number;
    damageReduction: number;
    turnRate: number;
  };
  maxPerRoom?: number;
  unlockFloor: number;
  spawnWeight: number;
}

export const ENEMY_DEFS: Record<string, EnemyConfig> = {
  spider: {
    type: 'spider',
    textureKey: 'enemy-spider',
    size: 30,
    hp: 50,
    speed: 80,
    attack: 10,
    attackCooldown: 1500,
    attackRange: 30,
    aiType: 'chase',
    unlockFloor: 1,
    spawnWeight: 10,
  },
  goblin: {
    type: 'goblin',
    textureKey: 'enemy-goblin',
    size: 28,
    hp: 40,
    speed: 72,
    attack: 15,
    attackCooldown: 1200,
    attackRange: 35,
    aiType: 'chase',
    unlockFloor: 2,
    spawnWeight: 8,
  },
  bat: {
    type: 'bat',
    textureKey: 'enemy-bat',
    size: 24,
    hp: 30,
    speed: 60,
    attack: 12,
    attackCooldown: 0,
    attackRange: 30,
    aiType: 'charge',
    chargeConfig: {
      chargeSpeed: 280,
      windupMs: 500,
      stunMs: 800,
      maxDistance: 400,
      triggerRange: 200,
    },
    unlockFloor: 3,
    spawnWeight: 5,
  },
  'skeleton-swordsman': {
    type: 'skeleton-swordsman',
    textureKey: 'enemy-skel-sword',
    size: 32,
    hp: 70,
    speed: 65,
    attack: 18,
    attackCooldown: 1400,
    attackRange: 35,
    aiType: 'chase',
    unlockFloor: 3,
    spawnWeight: 6,
  },
  'skeleton-shieldbearer': {
    type: 'skeleton-shieldbearer',
    textureKey: 'enemy-skel-shield',
    size: 34,
    hp: 100,
    speed: 50,
    attack: 12,
    attackCooldown: 1800,
    attackRange: 30,
    aiType: 'shield',
    shieldConfig: {
      shieldArc: 120,
      damageReduction: 0.5,
      turnRate: 180,
    },
    maxPerRoom: 2,
    unlockFloor: 4,
    spawnWeight: 4,
  },
  'skeleton-summoner': {
    type: 'skeleton-summoner',
    textureKey: 'enemy-skel-summoner',
    size: 30,
    hp: 60,
    speed: 40,
    attack: 8,
    attackCooldown: 0,
    attackRange: 0,
    aiType: 'summon',
    summonConfig: {
      summonType: 'skeleton-swordsman',
      summonInterval: 4000,
      maxMinions: 3,
      windupMs: 1000,
      cooldownMs: 3000,
      retreatDistance: 180,
      minionHpScale: 0.5,
      minionAtkScale: 0.5,
    },
    maxPerRoom: 1,
    unlockFloor: 5,
    spawnWeight: 3,
  },
};

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
