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

  // Altar
  ALTAR_ACTIVATE_RANGE: 60,
  ALTAR_ARM_DELAY: 500,
  ALTAR_SIZE: 48,
  ALTAR_REROLL_COST: 20,
  SKILL_MAX_LEVEL: 3,
  SKILL_SLOT_COUNT: 3,

  // Recovery (HP regen)
  PLAYER_RECOVERY: 0, // base recovery (0 = none until upgraded)

  // Armor
  PLAYER_ARMOR: 0, // base armor (0 = none until upgraded)
} as const;

// ---- Elemental System ----

export const Element = {
  WATER: 'WATER',
  FIRE: 'FIRE',
  THUNDER: 'THUNDER',
  WIND: 'WIND',
} as const;

export type Element = (typeof Element)[keyof typeof Element];

export const ELEMENTAL_CONFIG = {
  ELEMENT_ATTACH_DURATION_MS: 10000,
  ELEMENT_FLICKER_START_MS: 3000,
  ELECTRO_STORM_BONUS_RATIO: 0.5,
  CHAIN_LIGHTNING_RANGE: 120,
  CHAIN_LIGHTNING_MAX_JUMPS: 4,
  CHAIN_LIGHTNING_DECAY: [0.8, 0.6, 0.4, 0.2],
  ELECTRO_STUN_DURATION_MS: 1500,
  FLAME_BURST_BONUS_RATIO: 1.5,
  FLAME_AURA_DURATION_MS: 1000,
  HAZARD_TORCH_PROXIMITY: 48,
  HAZARD_ROOM_TORCH_CHANCE: 0.3,
  HAZARD_ROOM_TORCH_COUNT: { min: 1, max: 2 },
  HAZARD_ROOM_WATER_CHANCE: 0.2,
  HAZARD_CORRIDOR_WATER_CHANCE: 0.1,
} as const;

export type HazardType = 'water-pool' | 'torch';

export interface HazardData {
  type: HazardType;
  tileX: number;
  tileY: number;
}

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
  element?: Element;
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
  isElite?: boolean;
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
    element: Element.WIND,
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
    element: Element.FIRE,
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
    element: Element.WIND,
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
    element: Element.THUNDER,
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
    element: Element.WATER,
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
  warden: {
    type: 'warden',
    textureKey: 'enemy-warden',
    size: 48,
    hp: 100,
    speed: 80,
    attack: 15,
    attackCooldown: 1200,
    attackRange: 40,
    aiType: 'chase',
    unlockFloor: 1,
    spawnWeight: 0,
    isElite: true,
  },
};

export interface SkillLevelData {
  damageMultiplier: number;
  radius?: number;
  dashDistance?: number;
  pierceCount?: number;
}

export interface SkillDefinition {
  type: string;
  name: string;
  description: string;
  mpCost: number;
  cooldownMs: number;
  castDurationMs: number;
  damageMultiplier: number;
  category: 'physical' | 'magic';
  fixedElement?: Element;
  radius?: number;
  dashDistance?: number;
  dashDurationMs?: number;
  dashPathWidth?: number;
  projectileSpeed?: number;
  projectileRange?: number;
  pierceCount?: number;
  tickIntervalMs?: number;
  tickDamageMultiplier?: number;
  maxTravelDistance?: number;
  levelScaling: SkillLevelData[];
}

export const SKILL_DEFS: Record<string, SkillDefinition> = {
  whirlwind: {
    type: 'whirlwind',
    name: 'Whirlwind',
    description: 'AOE slash hitting all nearby enemies',
    mpCost: 25,
    cooldownMs: 4000,
    castDurationMs: 300,
    damageMultiplier: 1.5,
    category: 'physical',
    radius: 100,
    levelScaling: [
      { damageMultiplier: 1.5, radius: 100 },
      { damageMultiplier: 1.8, radius: 110 },
      { damageMultiplier: 2.1, radius: 120 },
    ],
  },
  'shadow-dash': {
    type: 'shadow-dash',
    name: 'Shadow Dash',
    description: 'Dash forward, damaging enemies in path',
    mpCost: 20,
    cooldownMs: 3000,
    castDurationMs: 200,
    damageMultiplier: 0.8,
    category: 'physical',
    dashDistance: 150,
    dashDurationMs: 200,
    dashPathWidth: 32,
    levelScaling: [
      { damageMultiplier: 0.8, dashDistance: 150 },
      { damageMultiplier: 1.0, dashDistance: 170 },
      { damageMultiplier: 1.2, dashDistance: 190 },
    ],
  },
  tornado: {
    type: 'tornado',
    name: 'Tornado',
    description: 'Launches a wind column that damages enemies in its path',
    mpCost: 30,
    cooldownMs: 6000,
    castDurationMs: 200,
    damageMultiplier: 0.4,
    category: 'magic',
    fixedElement: Element.WIND,
    radius: 48,
    projectileSpeed: 200,
    maxTravelDistance: 300,
    tickIntervalMs: 100,
    tickDamageMultiplier: 0.4,
    levelScaling: [
      { damageMultiplier: 0.4, radius: 48 },
      { damageMultiplier: 0.5, radius: 52 },
      { damageMultiplier: 0.6, radius: 56 },
    ],
  },
  thunderstorm: {
    type: 'thunderstorm',
    name: 'Thunderstorm',
    description: 'Strikes a target area with lightning',
    mpCost: 35,
    cooldownMs: 8000,
    castDurationMs: 300,
    damageMultiplier: 1.8,
    category: 'magic',
    fixedElement: Element.THUNDER,
    radius: 80,
    levelScaling: [
      { damageMultiplier: 1.8, radius: 80 },
      { damageMultiplier: 2.1, radius: 88 },
      { damageMultiplier: 2.4, radius: 96 },
    ],
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

// ---- Equipment System ----

export type EquipmentSlot = 'weapon' | 'armor' | 'helmet' | 'accessory';
export type EquipmentRarity = 'white' | 'green' | 'blue' | 'purple';

export interface EquipmentItem {
  id: number;
  slot: EquipmentSlot;
  subtype: string;
  rarity: EquipmentRarity;
  stats: Partial<Record<'attackMin' | 'attackMax' | 'armor' | 'critChance' | 'critDamage' | 'recovery' | 'moveSpeed' | 'maxHp', number>>;
  name: string;
}

export const EQUIPMENT_SLOTS: EquipmentSlot[] = ['weapon', 'armor', 'helmet', 'accessory'];

export const EQUIPMENT_RARITY_DEFS: Record<EquipmentRarity, {
  affixCount: number | { min: number; max: number };
  valueMult: number;
  dropWeight: number;
  color: number;
  label: string;
}> = {
  white:  { affixCount: 1,              valueMult: 1.0, dropWeight: 0.60, color: 0xffffff, label: 'Common' },
  green:  { affixCount: { min: 1, max: 2 }, valueMult: 1.3, dropWeight: 0.25, color: 0x7a9a5a, label: 'Uncommon' },
  blue:   { affixCount: 2,              valueMult: 1.6, dropWeight: 0.12, color: 0x3399ff, label: 'Rare' },
  purple: { affixCount: 3,              valueMult: 1.9, dropWeight: 0.03, color: 0x9933ff, label: 'Epic' },
};

export const EQUIPMENT_STAT_POOLS: Record<EquipmentSlot, string[]> = {
  weapon:    ['damageFlat', 'critChance', 'critDamage'],
  armor:     ['armor', 'maxHp'],
  helmet:    ['armor', 'maxHp', 'recovery'],
  accessory: ['critChance', 'critDamage', 'moveSpeed', 'recovery'],
};

// Base range per affix at floor 1. Floor scaling: value * (1 + (floor-1) * 0.1)
export const EQUIPMENT_BASE_RANGES: Record<string, { min: number; max: number }> = {
  damageFlat: { min: 3, max: 8 },
  armor:      { min: 2, max: 5 },
  maxHp:      { min: 15, max: 40 },
  critChance: { min: 0.01, max: 0.03 },
  critDamage: { min: 0.05, max: 0.15 },
  recovery:   { min: 0.5, max: 1.5 },
  moveSpeed:  { min: 8, max: 20 },
};

export const WEAPON_TYPE_DEFS: Record<string, {
  label: string;
  attackSpeedMult: number;
  rangeMult: number;
  damageMult: number;
}> = {
  axe:    { label: 'Axe',    attackSpeedMult: 1.0,  rangeMult: 1.0, damageMult: 1.0 },
  sword:  { label: 'Sword',  attackSpeedMult: 1.25, rangeMult: 1.0, damageMult: 0.85 },
  hammer: { label: 'Hammer', attackSpeedMult: 0.7,  rangeMult: 1.2, damageMult: 1.4 },
};

export const WEAPON_SUBTYPES = ['axe', 'sword', 'hammer'] as const;

export const EQUIPMENT_NAME_PREFIXES: Record<EquipmentRarity, string[]> = {
  white:  ['Worn', 'Old', 'Plain'],
  green:  ['Sturdy', 'Refined', 'Solid'],
  blue:   ['Superior', 'Fine', 'Enchanted'],
  purple: ['Legendary', 'Cursed', 'Ancient'],
};

export const EQUIPMENT_SLOT_LABELS: Record<EquipmentSlot, string> = {
  weapon: 'Weapon',
  armor: 'Armor',
  helmet: 'Helmet',
  accessory: 'Accessory',
};

// ---- Companion System ----

export interface CompanionDef {
  id: string;
  name: string;
  element: Element | null;
  themeColor: number;
  tokenName: string;
}

export const COMPANION_DEFS: CompanionDef[] = [
  { id: 'ember', name: 'Ember', element: Element.FIRE,    themeColor: 0xFF6B35, tokenName: 'Flameheart Stone' },
  { id: 'coral', name: 'Coral', element: Element.WATER,   themeColor: 0x4ECDC4, tokenName: 'Tidal Pearl' },
  { id: 'volt',  name: 'Volt',  element: Element.THUNDER, themeColor: 0xFFE66D, tokenName: 'Thundershard' },
  { id: 'flora', name: 'Flora', element: Element.WIND,    themeColor: 0x95E06C, tokenName: 'Verdant Seed' },
  { id: 'luna',  name: 'Luna',  element: null,            themeColor: 0xB388FF, tokenName: 'Moonshade Crystal' },
];

export const COMPANION_CONFIG = {
  RESCUE_AFFECTION_FIRST: 30,
  RESCUE_AFFECTION_REPEAT: 15,
  TOKEN_AFFECTION: 25,
  GOLD_AFFECTION_PER_100: 5,
  MATERIAL_AFFECTION: 5,
  AFFECTION_CAP: 600,
  STAGE_THRESHOLDS: [100, 300, 600] as const,
  STAGE_FLOOR_GATES: [0, 3, 5] as const,
  INTERACTION_RANGE: 64,
  RESCUE_DURATION_MS: 1200,
  WARDEN_HP_MULT: 2,
  WARDEN_ATK_MULT: 1.5,
} as const;

export interface TokenDropCondition {
  companionId: string;
  check: 'element' | 'any' | 'elite' | 'floor-any' | 'floor-elite';
  element?: Element;
  minFloor?: number;
  dropRate: number;
}

export const TOKEN_DROP_TABLE: TokenDropCondition[] = [
  { companionId: 'ember', check: 'element', element: Element.FIRE, dropRate: 0.15 },
  { companionId: 'coral', check: 'element', element: Element.WATER, dropRate: 0.15 },
  { companionId: 'volt', check: 'element', element: Element.THUNDER, dropRate: 0.15 },
  { companionId: 'volt', check: 'elite', dropRate: 0.10 },
  { companionId: 'flora', check: 'element', element: Element.WIND, dropRate: 0.15 },
  { companionId: 'flora', check: 'any', dropRate: 0.03 },
  { companionId: 'luna', check: 'floor-any', minFloor: 8, dropRate: 0.05 },
  { companionId: 'luna', check: 'floor-elite', minFloor: 8, dropRate: 0.15 },
];
