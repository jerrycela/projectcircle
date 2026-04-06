import Phaser from 'phaser';
import type { GameScene } from '../scenes/GameScene';
import { RoomState } from '../systems/DungeonGenerator';
import { GAME_CONFIG } from '../config';
import type { Enemy } from '../entities/Enemy';
import { LootType } from '../entities/Loot';
import type { LootType as LootTypeT } from '../entities/Loot';
import EventBus from '../systems/EventBus';

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
  };
  dungeon: {
    floor: number;
    highestFloor: number;
    roomCount: number;
    roomsCleared: number;
    totalEnemies: number;
    aliveEnemies: number;
  };
  loot: {
    itemsOnGround: number;
  };
  performance: {
    fps: number;
    bodies: number;
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
        for (let i = 0; i < count; i++) {
          this.scene.spawnEnemiesInRoom(roomIndex);
        }
        console.log(`[Debug] Requested ${count} enemy spawn batch(es) in room ${roomIndex}`);
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
        lootSystem.spawnLoot(spawnX, spawnY, lootType, value, rarity);
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
        const runState = {
          statsManagerState: this.scene.statsManager.exportState(),
          playerHp: player.hp,
          playerMp: player.mp,
          playerGold: player.gold,
          playerMaterials: { ...player.materials },
          floorManagerState: {
            currentFloor: floor,
            highestFloor: Math.max(this.scene.floorManager.highestFloor, floor),
          },
        };
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
    };
  }

  private buildStateSnapshot(): GameState {
    const player = this.scene.player;
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
      },
      loot: {
        itemsOnGround: this.scene.lootGroup
          ? this.scene.lootGroup.countActive(true)
          : 0,
      },
      performance: {
        fps: this.scene.game.loop.actualFps,
        bodies: this.scene.physics.world.bodies.size + this.scene.physics.world.staticBodies.size,
      },
    };
  }

  update(): void {
    if (!this.enabled) return;
    window.__gameState = this.buildStateSnapshot();
  }
}
