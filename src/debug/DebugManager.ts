import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { RoomState } from '../systems/DungeonGenerator';
import { GAME_CONFIG, ENEMY_DEFS, Element } from '../config';
import { Enemy } from '../entities/Enemy';
import { LootType } from '../entities/Loot';
import type { LootType as LootTypeT } from '../entities/Loot';
import EventBus from '../systems/EventBus';
import type { EquipmentItem, EquipmentSlot, EquipmentRarity } from '../config';
import { EQUIPMENT_SLOTS, EQUIPMENT_RARITY_DEFS } from '../config';

interface GameState {
  player: {
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    gold: number;
    materials: { wood: number; ore: number; cloth: number };
    attack: { min: number; max: number };
    armor: number;
    recovery: number;
    critDamage: number;
    moveSpeed: number;
    speed: number;
    currentRoom: number | null;
    playerSkills: string[];
    skillStates: Record<string, string>;
    skillCooldowns: Record<string, number>;
  };
  dungeon: {
    floor: number;
    highestFloor: number;
    roomCount: number;
    roomsCleared: number;
    totalEnemies: number;
    aliveEnemies: number;
    enemyTypes: Record<string, number>;
  };
  loot: {
    itemsOnGround: number;
  };
  equipment: {
    weapon: { name: string; rarity: string; subtype: string; stats: Record<string, number> } | null;
    armor: { name: string; rarity: string; stats: Record<string, number> } | null;
    helmet: { name: string; rarity: string; stats: Record<string, number> } | null;
    accessory: { name: string; rarity: string; stats: Record<string, number> } | null;
  };
  performance: {
    fps: number;
    bodies: number;
  };
  elemental: {
    playerElement: string | null;
    playerElementRemainingMs: number | null;
    enemyElements: Record<string, number>;
    hazards: { waterPools: number; torches: number };
  };
  companions: {
    [id: string]: {
      unlocked: boolean;
      affection: number;
      tokens: number;
      stage: number;
    };
  };
}

interface DebugAPI {
  enable(): void;
  disable(): void;
  giveGold(amount: number): void;
  giveMaterial(type: string, amount: number): void;
  healFull(): void;
  setHp(value: number): void;
  setMp(value: number): void;
  spawnEnemies(count: number, type?: string): void;
  spawnEnemy(type: string): void;
  listEnemyTypes(): void;
  killAllEnemies(): void;
  setInvincible(on: boolean): void;
  spawnLoot(type: string, rarity?: string): void;
  teleport(x: number, y: number): void;
  teleportToRoom(roomIndex: number): void;
  showColliders(on: boolean): void;
  showRoomBounds(on: boolean): void;
  showAttackRange(on: boolean): void;
  setGameSpeed(multiplier: number): void;
  setFloor(n: number): void;
  revealStaircase(): void;
  getStateSnapshot(): GameState;
  log(msg: string): void;
  // Skill debug commands
  giveSkill(type: string): void;
  removeSkills(): void;
  listSkills(): void;
  castSkill(slot: number): void;
  setSkillCooldown(type: string, ms: number): void;
  getSkillCooldown(slot: number): number;
  // Equipment debug commands
  giveEquipment(slot?: string, rarity?: string, subtype?: string): void;
  removeEquipment(slot: string): void;
  removeAllEquipment(): void;
  listEquipment(): void;
  resetSkillOffered(): void;
  openShop(): void;
  setSkillLevel(type: string, level: number): void;
  // Elemental debug commands
  setPlayerElement(element: string): void;
  setEnemyElement(element: string): void;
  clearElements(): void;
  triggerReaction(type: string): void;
  listHazards(): void;
  // Initial skill pick
  showInitialSkillPick(): void;
  // Companion debug commands
  unlockCompanion(id: string): void;
  setAffection(id: string, value: number): void;
  giveToken(id: string, count: number): void;
  unlockAllCompanions(): void;
}

declare global {
  interface Window {
    __gameState: GameState;
    __debug: DebugAPI;
  }
}

export class DebugManager {
  private scene: GameScene;
  private enabled = true;

  constructor(scene: GameScene) {
    this.scene = scene;
    this.setupDebugAPI();
    this.setupGameState();
    console.log('[Debug] Debug mode enabled');
  }

  private setupGameState(): void {
    window.__gameState = this.buildStateSnapshot();
  }

  private setupDebugAPI(): void {
    window.__debug = {
      enable: () => { this.enabled = true; },
      disable: () => { this.enabled = false; },
      giveGold: (amount: number) => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] giveGold: player not ready'); return; }
        player.gold += amount;
        EventBus.emit('player-gold-changed', player.gold);
        console.log(`[Debug] giveGold: +${amount} → total ${player.gold}`);
      },
      giveMaterial: (type: string, amount: number) => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] giveMaterial: player not ready'); return; }
        const validTypes = ['wood', 'ore', 'cloth'] as const;
        type ValidMaterial = typeof validTypes[number];
        if (!validTypes.includes(type as ValidMaterial)) {
          console.log(`[Debug] giveMaterial: unknown type "${type}". Valid: wood, ore, cloth`);
          return;
        }
        const mat = type as ValidMaterial;
        player.materials[mat] += amount;
        EventBus.emit('player-material-changed', { type: mat, amount: player.materials[mat] });
        console.log(`[Debug] giveMaterial: +${amount} ${mat} → total ${player.materials[mat]}`);
      },
      healFull: () => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] healFull: player not ready'); return; }
        player.hp = player.maxHp;
        player.mp = player.maxMp;
        console.log('[Debug] healFull: HP and MP fully restored');
      },
      setHp: (value: number) => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] setHp: player not ready'); return; }
        player.hp = Phaser.Math.Clamp(value, 0, player.maxHp);
        console.log(`[Debug] setHp: ${player.hp}`);
      },
      setMp: (value: number) => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] setMp: player not ready'); return; }
        player.mp = Phaser.Math.Clamp(value, 0, player.maxMp);
        console.log(`[Debug] setMp: ${player.mp}`);
      },
      spawnEnemies: (count: number, _type?: string) => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] spawnEnemies: player not ready'); return; }
        // Find which room player is in, default to 0
        const roomIndex = this.scene.currentPlayerRoom ?? 0;
        const fc = this.scene.floorManager.getFloorConfig();
        for (let i = 0; i < count; i++) {
          this.scene.spawnEnemiesInRoom(roomIndex, fc.enemyHpScale, fc.enemyAtkScale, fc.enemiesPerRoom);
        }
        console.log(`[Debug] Requested ${count} enemy spawn batch(es) in room ${roomIndex}`);
      },
      spawnEnemy: (type: string) => {
        const config = ENEMY_DEFS[type];
        if (!config) {
          console.log(`[Debug] Unknown enemy type: ${type}. Use listEnemyTypes() to see available types.`);
          return;
        }
        const player = this.scene.player;
        const offsetX = (Math.random() - 0.5) * 100 + 80;
        const offsetY = (Math.random() - 0.5) * 100 + 80;
        const fc = this.scene.floorManager.getFloorConfig();
        const enemy = new Enemy(
          this.scene,
          player.x + offsetX,
          player.y + offsetY,
          this.scene.currentPlayerRoom ?? 0,
          config,
          fc.enemyHpScale,
          fc.enemyAtkScale,
        );
        this.scene.enemyGroup.add(enemy);
        console.log(`[Debug] Spawned ${type} at (${Math.round(enemy.x)}, ${Math.round(enemy.y)})`);
      },
      listEnemyTypes: () => {
        console.log('[Debug] Enemy types:');
        for (const [key, config] of Object.entries(ENEMY_DEFS)) {
          const unlocked = config.unlockFloor <= this.scene.floorManager.currentFloor;
          console.log(`  ${key}: F${config.unlockFloor}+ | ${config.aiType} | ${unlocked ? 'UNLOCKED' : 'LOCKED'}`);
        }
      },
      killAllEnemies: () => {
        const enemies = this.scene.enemyGroup?.getChildren() as Enemy[] | undefined;
        if (!enemies) { console.log('[Debug] killAllEnemies: enemyGroup not ready'); return; }
        let killed = 0;
        for (const enemy of enemies) {
          if (enemy.active) {
            enemy.die();
            killed++;
          }
        }
        console.log(`[Debug] killAllEnemies: killed ${killed} enemies`);
      },
      setInvincible: (on: boolean) => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] setInvincible: player not ready'); return; }
        player.setInvincible(on);
        // When turning on permanently via debug, cancel the auto-expire by keeping invincible flag
        if (on) player.invincible = true;
        console.log(`[Debug] setInvincible: ${on}`);
      },
      spawnLoot: (type: string, rarity?: string) => {
        const lootSystem = this.scene.lootSystem;
        const player = this.scene.player;
        if (!lootSystem || !player) { console.log('[Debug] spawnLoot: system not ready'); return; }
        const validTypes = Object.values(LootType);
        if (!validTypes.includes(type as LootTypeT)) {
          console.log(`[Debug] spawnLoot: unknown type "${type}". Valid: ${validTypes.join(', ')}`);
          return;
        }
        const lootType = type as LootTypeT;
        const value = lootType === LootType.gold ? Phaser.Math.Between(5, 15)
                    : lootType === LootType.healthOrb ? GAME_CONFIG.HEALTH_ORB_HEAL
                    : 1;
        const spawnX = player.x + Phaser.Math.Between(-30, 30);
        const spawnY = player.y + Phaser.Math.Between(-30, 30);
        const loot = lootSystem.spawnLoot(spawnX, spawnY, lootType, value, rarity);
        // Generate equipmentData for equipment loot so it's collectible
        if (lootType === LootType.equipment && this.scene.equipmentManager) {
          const eqRarity = (rarity && rarity in EQUIPMENT_RARITY_DEFS ? rarity : 'blue') as import('../config').EquipmentRarity;
          const eqSlot = EQUIPMENT_SLOTS[Math.floor(Math.random() * EQUIPMENT_SLOTS.length)] as import('../config').EquipmentSlot;
          const floor = this.scene.floorManager?.currentFloor ?? 1;
          loot.equipmentData = this.scene.equipmentManager.generateEquipment(eqSlot, eqRarity, floor);
        }
        console.log(`[Debug] spawnLoot: ${lootType}${rarity ? ` (${rarity})` : ''} at (${spawnX.toFixed(0)}, ${spawnY.toFixed(0)})`);
      },
      teleport: (x: number, y: number) => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] teleport: player not ready'); return; }
        player.setPosition(x, y);
        console.log(`[Debug] teleport to (${x}, ${y})`);
      },
      teleportToRoom: (roomIndex: number) => {
        const rooms = this.scene.rooms;
        if (roomIndex < 0 || roomIndex >= rooms.length) {
          console.log(`[Debug] teleportToRoom: invalid index ${roomIndex} (room count: ${rooms.length})`);
          return;
        }
        const room = rooms[roomIndex];
        const tileSize = GAME_CONFIG.TILE_SIZE;
        const worldX = room.centerX * tileSize + tileSize / 2;
        const worldY = room.centerY * tileSize + tileSize / 2;
        const player = this.scene.player;
        if (!player) { console.log('[Debug] teleportToRoom: player not ready'); return; }
        player.setPosition(worldX, worldY);
        console.log(`[Debug] teleportToRoom(${roomIndex}): center grid=(${room.centerX},${room.centerY}) world=(${worldX},${worldY})`);
      },
      showColliders: (_on: boolean) => { console.log('[Debug] showColliders - not yet implemented'); },
      showRoomBounds: (_on: boolean) => { console.log('[Debug] showRoomBounds - not yet implemented'); },
      showAttackRange: (_on: boolean) => { console.log('[Debug] showAttackRange - not yet implemented'); },
      setGameSpeed: (multiplier: number) => {
        this.scene.time.timeScale = multiplier;
        this.scene.physics.world.timeScale = 1 / multiplier;
        console.log(`[Debug] Game speed set to ${multiplier}x`);
      },
      setFloor: (n: number) => {
        const floor = Math.max(1, n);
        const player = this.scene.player;
        if (!player) { console.log('[Debug] setFloor: player not ready'); return; }
        const runState = this.scene.buildRunState({
          floorManagerState: {
            currentFloor: floor,
            highestFloor: Math.max(this.scene.floorManager.highestFloor, floor),
          },
        });
        console.log(`[Debug] setFloor: jumping to floor ${floor}`);
        this.scene.scene.restart(runState);
      },
      revealStaircase: () => {
        const staircase = (this.scene as unknown as Record<string, unknown>).staircase as { reveal(): void } | undefined;
        if (!staircase) { console.log('[Debug] revealStaircase: no staircase found'); return; }
        staircase.reveal();
        console.log('[Debug] revealStaircase: forced reveal');
      },
      getStateSnapshot: () => this.buildStateSnapshot(),
      log: (msg: string) => { console.log(`[Debug] ${msg}`); },

      // ---- Skill commands
      giveSkill: (type: string) => {
        const sm = this.scene.skillManager;
        if (!sm) { console.log('[Debug] giveSkill: skillManager not ready'); return; }
        const result = sm.addSkill(type);
        if (result) {
          console.log(`[Debug] giveSkill: added "${type}"`);
        } else {
          console.log(`[Debug] giveSkill: failed to add "${type}" (unknown type, already owned, or slots full)`);
        }
      },

      removeSkills: () => {
        const sm = this.scene.skillManager;
        if (!sm) { console.log('[Debug] removeSkills: skillManager not ready'); return; }
        sm.removeAllSkills();
        console.log('[Debug] removeSkills: all skills cleared');
      },

      listSkills: () => {
        const sm = this.scene.skillManager;
        if (!sm) { console.log('[Debug] listSkills: skillManager not ready'); return; }
        console.log('[Debug] listSkills:');
        for (let i = 0; i < GAME_CONFIG.SKILL_SLOT_COUNT; i++) {
          const type = sm.getSlotType(i);
          const state = sm.getSlotState(i);
          const cd = sm.getSlotCooldownRemaining(i);
          console.log(`  Slot ${i}: ${type ?? '(empty)'} | ${state}${state === 'COOLDOWN' ? ` | ${cd.toFixed(0)}ms remaining` : ''}`);
        }
      },

      castSkill: (slot: number) => {
        const sm = this.scene.skillManager;
        if (!sm) { console.log('[Debug] castSkill: skillManager not ready'); return; }
        sm.forceCast(slot);
        console.log(`[Debug] castSkill: force-cast slot ${slot}`);
      },

      setSkillCooldown: (type: string, ms: number) => {
        const sm = this.scene.skillManager;
        if (!sm) { console.log('[Debug] setSkillCooldown: skillManager not ready'); return; }
        sm.setSlotCooldown(type, ms);
        console.log(`[Debug] setSkillCooldown: "${type}" -> ${ms}ms`);
      },

      getSkillCooldown: (slot: number): number => {
        const sm = this.scene.skillManager;
        if (!sm) { console.log('[Debug] getSkillCooldown: skillManager not ready'); return 0; }
        const cd = sm.getSlotCooldownRemaining(slot);
        console.log(`[Debug] getSkillCooldown(slot ${slot}): ${cd.toFixed(0)}ms remaining`);
        return cd;
      },

      // ---- Equipment commands
      giveEquipment: (slot?: string, rarity?: string, subtype?: string) => {
        const em = this.scene.equipmentManager;
        if (!em) { console.log('[Debug] giveEquipment: equipmentManager not ready'); return; }

        const targetSlot = (slot && EQUIPMENT_SLOTS.includes(slot as EquipmentSlot) ? slot : EQUIPMENT_SLOTS[Math.floor(Math.random() * EQUIPMENT_SLOTS.length)]) as EquipmentSlot;
        const targetRarity = (rarity && rarity in EQUIPMENT_RARITY_DEFS ? rarity : 'blue') as EquipmentRarity;
        const floor = this.scene.floorManager?.currentFloor ?? 1;

        const item = em.generateEquipment(targetSlot, targetRarity, floor);
        if (subtype && targetSlot === 'weapon') {
          (item as EquipmentItem & { subtype: string }).subtype = subtype;
        }
        const old = em.equip(item);
        console.log(`[Debug] giveEquipment: equipped ${item.rarity} ${item.name} (id:${item.id}). Replaced: ${old?.name ?? 'none'}`);
        console.table(item.stats);
      },

      removeEquipment: (slot: string) => {
        const em = this.scene.equipmentManager;
        if (!em) { console.log('[Debug] removeEquipment: equipmentManager not ready'); return; }
        if (!EQUIPMENT_SLOTS.includes(slot as EquipmentSlot)) {
          console.log(`[Debug] removeEquipment: invalid slot "${slot}". Use: ${EQUIPMENT_SLOTS.join(', ')}`);
          return;
        }
        const old = em.unequip(slot as EquipmentSlot);
        console.log(`[Debug] removeEquipment(${slot}): removed ${old?.name ?? 'nothing'}`);
      },

      removeAllEquipment: () => {
        const em = this.scene.equipmentManager;
        if (!em) { console.log('[Debug] removeAllEquipment: equipmentManager not ready'); return; }
        for (const slot of EQUIPMENT_SLOTS) {
          em.unequip(slot);
        }
        console.log('[Debug] removeAllEquipment: all slots cleared');
      },

      listEquipment: () => {
        const em = this.scene.equipmentManager;
        if (!em) { console.log('[Debug] listEquipment: equipmentManager not ready'); return; }
        for (const slot of EQUIPMENT_SLOTS) {
          const item = em.getEquipped(slot);
          if (item) {
            console.log(`[${slot}] ${item.rarity} ${item.name} (${item.subtype})`);
            console.table(item.stats);
          } else {
            console.log(`[${slot}] empty`);
          }
        }
      },

      // ---- Altar commands
      resetSkillOffered: () => {
        const gameScene = this.scene;
        if (gameScene.altar) {
          gameScene.altar.skillOffered = false;
          console.log('[Debug] resetSkillOffered: skill phase will trigger on next altar visit');
        } else {
          console.log('[Debug] resetSkillOffered: no altar in current floor');
        }
      },
      openShop: () => {
        const gameScene = this.scene;
        if (gameScene.altar) {
          EventBus.emit('altar-activated', gameScene.altar);
          console.log('[Debug] openShop: forcing altar activation');
        } else {
          console.log('[Debug] openShop: no altar in current floor');
        }
      },
      setSkillLevel: (type: string, level: number) => {
        const gameScene = this.scene;
        if (!gameScene.skillManager) {
          console.log('[Debug] setSkillLevel: skillManager not ready');
          return;
        }
        if (!gameScene.skillManager.hasSkill(type)) {
          console.log(`[Debug] setSkillLevel: player doesn't have skill "${type}"`);
          return;
        }
        if (level < 1 || level > GAME_CONFIG.SKILL_MAX_LEVEL) {
          console.log(`[Debug] setSkillLevel: level must be 1-${GAME_CONFIG.SKILL_MAX_LEVEL}`);
          return;
        }
        const slots = (gameScene.skillManager as unknown as { slots: Array<{ type: string | null; level: number }> }).slots;
        for (const slot of slots) {
          if (slot.type === type) {
            slot.level = level;
            break;
          }
        }
        EventBus.emit('skill-state-changed');
        console.log(`[Debug] setSkillLevel: ${type} -> Lv.${level}`);
      },

      // ---- Elemental commands
      setPlayerElement: (element: string) => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] setPlayerElement: player not ready'); return; }
        const upper = element.toUpperCase();
        const validElements = ['WATER', 'FIRE', 'THUNDER', 'WIND'];
        if (!validElements.includes(upper)) {
          console.log(`[Debug] setPlayerElement: unknown "${element}". Valid: ${validElements.join(', ')}`);
          return;
        }
        player.elementalState.apply(upper as import('../config').Element);
        console.log(`[Debug] setPlayerElement: ${upper}`);
      },

      setEnemyElement: (element: string) => {
        const enemies = this.scene.enemyGroup?.getChildren() as Enemy[] | undefined;
        if (!enemies) { console.log('[Debug] setEnemyElement: no enemies'); return; }
        const upper = element.toUpperCase();
        const validElements = ['WATER', 'FIRE', 'THUNDER', 'WIND'];
        if (!validElements.includes(upper)) {
          console.log(`[Debug] setEnemyElement: unknown "${element}". Valid: ${validElements.join(', ')}`);
          return;
        }
        let count = 0;
        for (const enemy of enemies) {
          if (enemy.active) {
            enemy.elementalState.apply(upper as import('../config').Element);
            count++;
          }
        }
        console.log(`[Debug] setEnemyElement: applied ${upper} to ${count} enemies`);
      },

      clearElements: () => {
        const player = this.scene.player;
        if (player) player.elementalState.clear();
        const enemies = this.scene.enemyGroup?.getChildren() as Enemy[] | undefined;
        if (enemies) {
          for (const enemy of enemies) {
            if (enemy.active) enemy.elementalState.clear();
          }
        }
        console.log('[Debug] clearElements: all elements cleared');
      },

      triggerReaction: (type: string) => {
        const player = this.scene.player;
        if (!player) { console.log('[Debug] triggerReaction: player not ready'); return; }
        const enemies = this.scene.enemyGroup?.getChildren() as Enemy[] | undefined;
        if (!enemies) { console.log('[Debug] triggerReaction: no enemies'); return; }
        const nearest = enemies.find(e => e.active);
        if (!nearest) { console.log('[Debug] triggerReaction: no active enemies'); return; }

        switch (type.toLowerCase()) {
          case 'electro':
          case 'electro_storm':
            nearest.elementalState.apply(Element.WATER);
            console.log('[Debug] triggerReaction: enemy=WATER. Use thunderstorm to trigger Electro Storm.');
            break;
          case 'flame':
          case 'flame_burst':
            nearest.elementalState.apply(Element.FIRE);
            console.log('[Debug] triggerReaction: enemy=FIRE. Use tornado to trigger Flame Burst.');
            break;
          default:
            console.log(`[Debug] triggerReaction: unknown "${type}". Use: electro_storm, flame_burst`);
        }
      },

      listHazards: () => {
        const pools = this.scene.waterPools ?? [];
        const torches = this.scene.torches ?? [];
        console.log(`[Debug] listHazards: ${pools.length} water pools, ${torches.length} torches`);
        for (const p of pools) {
          console.log(`  Water Pool at (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
        }
        for (const t of torches) {
          console.log(`  Torch at (${t.x.toFixed(0)}, ${t.y.toFixed(0)})`);
        }
      },

      // ---- Initial skill pick
      showInitialSkillPick: () => {
        EventBus.emit('show-initial-skill-pick');
        console.log('[Debug] showInitialSkillPick: triggered initial skill selection panel');
      },

      // ---- Companion commands
      unlockCompanion: (id: string) => {
        (this.scene as any).companionManager?.debugUnlock(id);
        console.log(`[Debug] Unlocked companion: ${id}`);
      },
      setAffection: (id: string, value: number) => {
        (this.scene as any).companionManager?.debugSetAffection(id, value);
        console.log(`[Debug] Set ${id} affection to ${value}`);
      },
      giveToken: (id: string, count: number) => {
        (this.scene as any).companionManager?.debugGiveTokens(id, count);
        console.log(`[Debug] Gave ${count} tokens to ${id}`);
      },
      unlockAllCompanions: () => {
        (this.scene as any).companionManager?.debugUnlockAll();
        console.log('[Debug] All companions unlocked at max affection');
      },
    };
  }

  private buildStateSnapshot(): GameState {
    const player = this.scene.player;
    const sm = this.scene.skillManager;

    // Build skill state maps
    const skillStates: Record<string, string> = {};
    const skillCooldowns: Record<string, number> = {};
    if (sm) {
      for (let i = 0; i < GAME_CONFIG.SKILL_SLOT_COUNT; i++) {
        const type = sm.getSlotType(i);
        const key = type ?? `slot${i}`;
        skillStates[key] = sm.getSlotState(i);
        skillCooldowns[key] = sm.getSlotCooldownRemaining(i);
      }
    }

    return {
      player: {
        x: player ? player.x : 0,
        y: player ? player.y : 0,
        hp: player ? player.hp : 0,
        maxHp: player ? player.maxHp : 0,
        mp: player ? player.mp : 0,
        maxMp: player ? player.maxMp : 0,
        gold: player ? player.gold : 0,
        materials: player ? { ...player.materials } : { wood: 0, ore: 0, cloth: 0 },
        attack: {
          min: this.scene.statsManager.getStat('attackMin'),
          max: this.scene.statsManager.getStat('attackMax'),
        },
        armor: this.scene.statsManager.getStat('armor'),
        recovery: this.scene.statsManager.getStat('recovery'),
        critDamage: this.scene.statsManager.getStat('critDamage'),
        moveSpeed: this.scene.statsManager.getStat('moveSpeed'),
        speed: player ? player.speed : 0,
        currentRoom: this.scene.currentPlayerRoom ?? null,
        playerSkills: sm ? sm.getOwnedSkillTypes() : [],
        skillStates,
        skillCooldowns,
      },
      dungeon: {
        floor: this.scene.floorManager?.currentFloor ?? 1,
        highestFloor: this.scene.floorManager?.highestFloor ?? 1,
        roomCount: this.scene.rooms.length,
        roomsCleared: this.scene.rooms.filter(r => r.state === RoomState.CLEARED).length,
        totalEnemies: this.scene.enemyGroup ? this.scene.enemyGroup.getLength() : 0,
        aliveEnemies: this.scene.enemyGroup
          ? (this.scene.enemyGroup.getChildren() as Enemy[]).filter(e => e.active).length
          : 0,
        enemyTypes: this.scene.enemyGroup
          ? (this.scene.enemyGroup.getChildren() as Enemy[])
              .filter(e => e.active)
              .reduce((acc: Record<string, number>, e) => {
                acc[e.config.type] = (acc[e.config.type] ?? 0) + 1;
                return acc;
              }, {})
          : {},
      },
      loot: {
        itemsOnGround: this.scene.lootGroup
          ? this.scene.lootGroup.countActive(true)
          : 0,
      },
      equipment: (() => {
        const em = this.scene.equipmentManager;
        if (!em) return { weapon: null, armor: null, helmet: null, accessory: null };
        const all = em.getAllEquipped();
        return {
          weapon: all.weapon ? { name: all.weapon.name, rarity: all.weapon.rarity, subtype: all.weapon.subtype, stats: all.weapon.stats as Record<string, number> } : null,
          armor: all.armor ? { name: all.armor.name, rarity: all.armor.rarity, stats: all.armor.stats as Record<string, number> } : null,
          helmet: all.helmet ? { name: all.helmet.name, rarity: all.helmet.rarity, stats: all.helmet.stats as Record<string, number> } : null,
          accessory: all.accessory ? { name: all.accessory.name, rarity: all.accessory.rarity, stats: all.accessory.stats as Record<string, number> } : null,
        };
      })(),
      performance: {
        fps: this.scene.game.loop.actualFps,
        bodies: this.scene.physics.world.bodies.size + this.scene.physics.world.staticBodies.size,
      },
      elemental: (() => {
        const playerEl = this.scene.player?.elementalState;
        const enemies = this.scene.enemyGroup?.getChildren() as Enemy[] | undefined;
        const enemyElements: Record<string, number> = {};
        if (enemies) {
          for (const e of enemies) {
            if (e.active && e.elementalState.element) {
              const el = e.elementalState.element;
              enemyElements[el] = (enemyElements[el] ?? 0) + 1;
            }
          }
        }
        return {
          playerElement: playerEl?.element ?? null,
          playerElementRemainingMs: playerEl?.remainingMs ?? null,
          enemyElements,
          hazards: {
            waterPools: this.scene.waterPools?.length ?? 0,
            torches: this.scene.torches?.length ?? 0,
          },
        };
      })(),
      companions: (() => {
        const result: GameState['companions'] = {};
        const cm = (this.scene as any).companionManager;
        if (cm) {
          for (const comp of cm.getAllCompanions()) {
            result[comp.def.id] = {
              unlocked: comp.unlocked,
              affection: comp.affection,
              tokens: comp.tokens,
              stage: cm.getCurrentStage(comp.def.id),
            };
          }
        }
        return result;
      })(),
    };
  }

  update(): void {
    if (!this.enabled) return;
    window.__gameState = this.buildStateSnapshot();
  }
}
