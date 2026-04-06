import Phaser from 'phaser';
import { DebugManager } from '../debug/DebugManager';
import { generate } from '../systems/DungeonGenerator';
import { RoomState } from '../systems/DungeonGenerator';
import type { Room } from '../systems/DungeonGenerator';
import { GAME_CONFIG } from '../config';
import type { EnemyConfig } from '../config';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import EventBus from '../systems/EventBus';
import { CombatSystem } from '../systems/CombatSystem';
import { LootSystem } from '../systems/LootSystem';
import { StatsManager } from '../systems/StatsManager';
import type { StatBlock } from '../systems/StatsManager';
import { Altar } from '../entities/Altar';
import { FloorManager } from '../systems/FloorManager';
import type { FloorState } from '../systems/FloorManager';
import { Staircase } from '../entities/Staircase';
import { SkillManager } from '../systems/SkillManager';
import { EquipmentManager } from '../systems/EquipmentManager';
import type { EquipmentItem, EquipmentSlot } from '../config';

export interface RunState {
  statsManagerState: { bonuses: StatBlock; levels: Record<string, number>; equipmentBonuses?: Partial<StatBlock> };
  playerHp: number;
  playerMp: number;
  playerGold: number;
  playerMaterials: { wood: number; ore: number; cloth: number };
  floorManagerState: FloorState;
  playerSkills?: string[];
  playerEquipment?: Record<EquipmentSlot, EquipmentItem | null>;
  equipmentNextId?: number;
}

export class GameScene extends Phaser.Scene {
  private debugManager?: DebugManager;
  public combatSystem!: CombatSystem;
  public lootSystem!: LootSystem;
  public statsManager!: StatsManager;
  public skillManager!: SkillManager;
  public equipmentManager!: EquipmentManager;
  public gameplayLocked: boolean = false;
  private recoveryAccum: number = 0;

  public rooms: Room[] = [];
  public grid: number[][] = [];
  public wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  public player!: Player;
  public enemyGroup!: Phaser.Physics.Arcade.Group;
  public projectileGroup!: Phaser.Physics.Arcade.Group;
  public lootGroup!: Phaser.GameObjects.Group;
  public currentPlayerRoom: number | null = null;
  private altar?: Altar;
  public floorManager!: FloorManager;
  private staircase?: Staircase;
  private runState?: RunState;

  // Input state
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    up: Phaser.Input.Keyboard.Key;
    down: Phaser.Input.Keyboard.Key;
    left: Phaser.Input.Keyboard.Key;
    right: Phaser.Input.Keyboard.Key;
  };

  // Joystick state
  private joystickDirX: number = 0;
  private joystickDirY: number = 0;
  private lastInputSource: 'keyboard' | 'joystick' = 'keyboard';

  constructor() {
    super('GameScene');
  }

  init(data?: RunState): void {
    // Phaser passes {} on fresh start, so check for actual RunState content
    this.runState = data?.floorManagerState ? data : undefined;
  }

  create(): void {
    console.log('GameScene started');

    // Restore or create FloorManager
    this.floorManager = new FloorManager(this.runState?.floorManagerState);

    // Restore or create StatsManager
    this.statsManager = new StatsManager();
    if (this.runState?.statsManagerState) {
      this.statsManager.importState(this.runState.statsManagerState);
    }

    // Generate dungeon with floor-scaled config
    const floorConfig = this.floorManager.getFloorConfig();
    const { grid, rooms } = generate({
      roomCount: floorConfig.roomCount,
      roomSize: floorConfig.roomSize,
    });
    this.grid = grid;
    this.rooms = rooms;

    const tileSize = GAME_CONFIG.TILE_SIZE;
    const mapPixelWidth = GAME_CONFIG.MAP_WIDTH * tileSize;
    const mapPixelHeight = GAME_CONFIG.MAP_HEIGHT * tileSize;

    // Create groups — floors first so they render under walls
    const floorGroup = this.add.group();
    this.wallGroup = this.physics.add.staticGroup();

    for (let gy = 0; gy < GAME_CONFIG.MAP_HEIGHT; gy++) {
      for (let gx = 0; gx < GAME_CONFIG.MAP_WIDTH; gx++) {
        const worldX = gx * tileSize;
        const worldY = gy * tileSize;

        if (grid[gy][gx] === 0) {
          const tile = this.add.image(worldX, worldY, 'floor-tile');
          tile.setOrigin(0, 0);
          floorGroup.add(tile);
        } else {
          const tile = this.wallGroup.create(worldX, worldY, 'wall-tile') as Phaser.Physics.Arcade.Image;
          tile.setOrigin(0, 0);
          tile.refreshBody();
        }
      }
    }

    this.physics.world.setBounds(0, 0, mapPixelWidth, mapPixelHeight);
    this.cameras.main.setBounds(0, 0, mapPixelWidth, mapPixelHeight);
    this.cameras.main.setBackgroundColor('#000000');

    // Spawn player at center of first room
    const firstRoom = rooms[0];
    const spawnX = firstRoom.centerX * tileSize + tileSize / 2;
    const spawnY = firstRoom.centerY * tileSize + tileSize / 2;
    this.player = new Player(this, spawnX, spawnY, this.statsManager);

    // Restore player state from RunState
    if (this.runState) {
      this.player.hp = this.runState.playerHp;
      this.player.mp = this.runState.playerMp;
      this.player.gold = this.runState.playerGold;
      this.player.materials = { ...this.runState.playerMaterials };
      this.player.maxHp = this.statsManager.getStat('maxHp');
    }

    // Equipment manager
    this.equipmentManager = new EquipmentManager(this.statsManager, this.player);
    if (this.runState?.playerEquipment) {
      this.equipmentManager.importState({
        equipped: this.runState.playerEquipment,
        nextId: this.runState.equipmentNextId ?? 0,
      });
    }

    // Player vs walls collider
    this.physics.add.collider(this.player, this.wallGroup);

    // Enemy group
    this.enemyGroup = this.physics.add.group();

    // Enemy vs walls collider
    this.physics.add.collider(this.enemyGroup, this.wallGroup);

    // Camera follow with lerp
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Keyboard input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      up: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // EventBus listeners for joystick
    EventBus.on('joystick-move', (data: { dirX: number; dirY: number }) => {
      this.joystickDirX = data.dirX;
      this.joystickDirY = data.dirY;
      this.lastInputSource = 'joystick';
    });

    EventBus.on('joystick-stop', () => {
      this.joystickDirX = 0;
      this.joystickDirY = 0;
      this.lastInputSource = 'keyboard';
    });

    // Mark first room as active and spawn enemies (player spawns here)
    firstRoom.state = RoomState.ACTIVE;
    this.currentPlayerRoom = 0;
    this.spawnEnemiesInRoom(0, floorConfig.enemyHpScale, floorConfig.enemyAtkScale, floorConfig.enemiesPerRoom);

    // Spawn altar in ALTAR room (if any)
    const altarRoom = this.rooms.find(r => r.state === RoomState.ALTAR);
    if (altarRoom) {
      const altarX = altarRoom.centerX * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2;
      const altarY = altarRoom.centerY * GAME_CONFIG.TILE_SIZE + GAME_CONFIG.TILE_SIZE / 2;
      this.altar = new Altar(this, altarX, altarY, this.player);
    }

    // Spawn staircase (hidden until all rooms cleared)
    const staircaseRoom = this.pickStaircaseRoom();
    if (staircaseRoom !== null) {
      const sRoom = this.rooms[staircaseRoom];
      const sx = sRoom.centerX * tileSize + tileSize / 2;
      const sy = sRoom.centerY * tileSize + tileSize / 2;
      this.staircase = new Staircase(this, sx, sy, this.player);
    }

    // Loot group and system
    this.lootGroup = this.add.group();
    this.lootSystem = new LootSystem(this, this.player, this.lootGroup, this.equipmentManager);

    // Projectile group (for arcane bolt, etc.)
    this.projectileGroup = this.physics.add.group();

    // Skill manager
    this.skillManager = new SkillManager(this);
    if (this.runState?.playerSkills) {
      this.skillManager.importState({ skills: this.runState.playerSkills });
    }

    // Combat system — receives skill manager reference
    this.combatSystem = new CombatSystem(this, this.statsManager, this.skillManager, this.equipmentManager);

    EventBus.on('altar-consumed', () => {
      this.altar?.consume();
    });

    // Skill cast requests from UIScene (skill button taps)
    EventBus.on('skill-cast-request', (slotIndex: number) => {
      this.skillManager.cast(slotIndex);
    });

    // Skill acquisition from altar
    EventBus.on('skill-acquired', (type: string) => {
      this.skillManager.addSkill(type);
    });

    // Equipment pickup — forward to UIScene
    EventBus.on('equipment-pickup', (item: EquipmentItem, loot: import('../entities/Loot').Loot) => {
      this.gameplayLocked = true;
      this.physics.pause();
      EventBus.emit('gameplay-lock', true);
      EventBus.emit('show-equipment-compare', item, loot);
    });

    EventBus.on('equipment-compare-done', () => {
      this.gameplayLocked = false;
      this.physics.resume();
      EventBus.emit('gameplay-lock', false);
    });

    // Player death handler
    EventBus.on('player-died', () => {
      this.combatSystem.onPlayerDied();
      this.triggerDeath();
    });

    EventBus.on('gameplay-lock', (locked: boolean) => {
      this.gameplayLocked = locked;
      if (locked) {
        this.physics.pause();
      } else {
        this.physics.resume();
      }
    });

    // Register shutdown handler so Phaser calls it on scene stop
    this.events.on('shutdown', this.onShutdown, this);

    // Fade in on floor entry
    if (this.runState) {
      this.cameras.main.fadeIn(300, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        this.gameplayLocked = false;
        this.physics.resume();
        EventBus.emit('gameplay-lock', false);
      });
      // Keep locked during fade
      this.gameplayLocked = true;
      this.physics.pause();
    }

    EventBus.emit('scene-ready');

    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      this.debugManager = new DebugManager(this);
    }
  }

  private onShutdown(): void {
    this.combatSystem?.destroy();
    this.lootSystem?.destroy();
    // Destroy all projectiles to prevent orphaned physics bodies
    if (this.projectileGroup) {
      this.projectileGroup.clear(true, true);
    }
    EventBus.off('joystick-move');
    EventBus.off('joystick-stop');
    EventBus.off('player-died');
    EventBus.off('gameplay-lock');
    EventBus.off('altar-consumed');
    EventBus.off('floor-cleared');
    EventBus.off('skill-cast-request');
    EventBus.off('skill-acquired');
    EventBus.off('equipment-pickup');
    EventBus.off('equipment-compare-done');
  }

  update(time: number, delta: number): void {
    // Gameplay lock — skip ALL game logic including regen
    if (this.gameplayLocked) return;

    // MP regeneration
    if (this.player && this.player.active) {
      this.player.mp = Math.min(
        this.player.mp + GAME_CONFIG.PLAYER_MP_REGEN * (delta / 1000),
        this.player.maxMp,
      );
    }

    // HP recovery (accumulator pattern to keep HP as integer)
    const recovery = this.statsManager.getStat('recovery');
    if (recovery > 0 && this.player.hp < this.player.maxHp) {
      this.recoveryAccum += recovery * (delta / 1000);
      if (this.recoveryAccum >= 1) {
        const heal = Math.floor(this.recoveryAccum);
        this.recoveryAccum -= heal;
        this.player.hp = Math.min(this.player.hp + heal, this.player.maxHp);
        EventBus.emit('player-hp-changed', this.player.hp, this.player.maxHp);
      }
    }

    this.handleInput();
    this.detectPlayerRoom();
    this.updateEnemyAI();
    this.checkRoomClearing();
    this.skillManager.update(delta);
    this.combatSystem.update(time, delta);
    this.lootSystem.update();
    this.altar?.update(time, delta);
    this.staircase?.update();
    this.debugManager?.update();
  }

  private detectPlayerRoom(): void {
    const tileSize = GAME_CONFIG.TILE_SIZE;
    const pad = GAME_CONFIG.ROOM_ENTER_PADDING;
    const px = this.player.x;
    const py = this.player.y;

    for (let i = 0; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      const worldLeft = room.x * tileSize - pad;
      const worldTop = room.y * tileSize - pad;
      const worldRight = (room.x + room.width) * tileSize + pad;
      const worldBottom = (room.y + room.height) * tileSize + pad;

      if (px >= worldLeft && px <= worldRight && py >= worldTop && py <= worldBottom) {
        if (this.currentPlayerRoom !== i) {
          this.currentPlayerRoom = i;
          if (room.state === RoomState.UNVISITED) {
            room.state = RoomState.ACTIVE;
            const fc = this.floorManager.getFloorConfig();
            this.spawnEnemiesInRoom(i, fc.enemyHpScale, fc.enemyAtkScale, fc.enemiesPerRoom);
          }
        }
        return;
      }
    }

    // Player is in a corridor — not in any room
    this.currentPlayerRoom = null;
  }

  private updateEnemyAI(): void {
    const enemies = this.enemyGroup.getChildren() as Enemy[];
    for (const enemy of enemies) {
      if (enemy.active) {
        enemy.updateAI(this.player, this.rooms);
      }
    }
  }

  private checkRoomClearing(): void {
    for (let i = 0; i < this.rooms.length; i++) {
      const room = this.rooms[i];
      if (room.state !== RoomState.ACTIVE) continue;

      const enemies = this.enemyGroup.getChildren() as Enemy[];
      const roomEnemies = enemies.filter(e => e.roomIndex === i);
      if (roomEnemies.length === 0) continue;

      const anyAlive = roomEnemies.some(e => e.active && !e.isSummon);
      if (!anyAlive) {
        room.state = RoomState.CLEARED;
        console.log(`[GameScene] Room ${i} cleared`);
      }
    }

    // Check if all combat rooms are cleared (excluding ALTAR rooms)
    const combatRooms = this.rooms.filter(r => r.state !== RoomState.ALTAR);
    const allCombatCleared = combatRooms.length > 0 && combatRooms.every(r => r.state === RoomState.CLEARED);
    if (allCombatCleared && this.staircase?.getState() === 'HIDDEN') {
      EventBus.emit('floor-cleared');
      this.staircase.reveal();
    }
  }

  spawnEnemiesInRoom(roomIndex: number, hpScale = 1, atkScale = 1, countOverride?: { min: number; max: number }): void {
    const room = this.rooms[roomIndex];
    if (!room) return;
    if (room.state === RoomState.ALTAR) return;

    const tileSize = GAME_CONFIG.TILE_SIZE;
    const countRange = countOverride ?? GAME_CONFIG.ENEMIES_PER_ROOM;
    const count = Phaser.Math.Between(countRange.min, countRange.max);

    const roomLeft = room.x * tileSize;
    const roomTop = room.y * tileSize;
    const roomRight = (room.x + room.width) * tileSize;
    const roomBottom = (room.y + room.height) * tileSize;

    const safeFromPlayer = GAME_CONFIG.SPAWN_SAFETY_FROM_PLAYER;
    const safeFromWall = GAME_CONFIG.SPAWN_SAFETY_FROM_WALL;
    const maxRetries = 20;

    const spawnTable = this.floorManager.getSpawnTable();
    const roomTypeCounts: Record<string, number> = {};

    for (let i = 0; i < count; i++) {
      const config = this.pickEnemyConfig(spawnTable, roomTypeCounts);
      if (!config) continue;

      roomTypeCounts[config.type] = (roomTypeCounts[config.type] ?? 0) + 1;

      let placed = false;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const wx = Phaser.Math.Between(roomLeft + safeFromWall, roomRight - safeFromWall);
        const wy = Phaser.Math.Between(roomTop + safeFromWall, roomBottom - safeFromWall);

        const pdx = wx - this.player.x;
        const pdy = wy - this.player.y;
        if (Math.sqrt(pdx * pdx + pdy * pdy) < safeFromPlayer) continue;

        const gx = Math.floor(wx / tileSize);
        const gy = Math.floor(wy / tileSize);
        if (
          gy < 0 || gy >= this.grid.length ||
          gx < 0 || gx >= this.grid[0].length ||
          this.grid[gy][gx] !== 0
        ) continue;

        const enemy = new Enemy(this, wx, wy, roomIndex, config, hpScale, atkScale);
        this.enemyGroup.add(enemy);
        placed = true;
        break;
      }

      if (!placed) {
        console.warn(`[GameScene] Could not place enemy ${i} in room ${roomIndex} after ${maxRetries} attempts`);
      }
    }
  }

  private pickEnemyConfig(
    spawnTable: { config: EnemyConfig; weight: number }[],
    roomTypeCounts: Record<string, number>,
  ): EnemyConfig | null {
    const available = spawnTable.filter(e => {
      if (e.config.maxPerRoom === undefined) return true;
      return (roomTypeCounts[e.config.type] ?? 0) < e.config.maxPerRoom;
    });
    if (available.length === 0) return null;

    const availWeight = available.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * availWeight;
    for (const entry of available) {
      roll -= entry.weight;
      if (roll <= 0) return entry.config;
    }
    return available[available.length - 1].config;
  }

  private pickStaircaseRoom(): number | null {
    const candidates = this.rooms
      .map((r, i) => ({ room: r, index: i }))
      .filter(({ room, index }) => index > 0 && room.state !== RoomState.ALTAR);

    if (candidates.length > 0) {
      return candidates[Math.floor(Math.random() * candidates.length)].index;
    }

    if (this.rooms.length > 0) {
      return 0;
    }

    return null;
  }

  triggerFloorTransition(): void {
    this.gameplayLocked = true;
    this.physics.pause();
    EventBus.emit('gameplay-lock', true);

    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.floorManager.advanceFloor();
      const runState = this.buildRunState({
        floorManagerState: this.floorManager.exportState(),
      });
      this.scene.restart(runState);
    });
  }

  triggerDeath(): void {
    this.gameplayLocked = true;
    this.physics.pause();
    EventBus.emit('gameplay-lock', true);
    EventBus.emit('show-death-text', this.floorManager.currentFloor);

    this.time.delayedCall(1500, () => {
      const runState = this.buildRunState({
        playerHp: this.statsManager.getStat('maxHp'),
        playerMp: GAME_CONFIG.PLAYER_MP,
        playerGold: 0,
        playerMaterials: { wood: 0, ore: 0, cloth: 0 },
        floorManagerState: {
          currentFloor: 1,
          highestFloor: this.floorManager.highestFloor,
        },
      });
      this.scene.restart(runState);
    });
  }

  buildRunState(overrides?: Partial<RunState>): RunState {
    const equipState = this.equipmentManager.exportState();
    const base: RunState = {
      statsManagerState: this.statsManager.exportState(),
      playerHp: this.player.hp,
      playerMp: this.player.mp,
      playerGold: this.player.gold,
      playerMaterials: { ...this.player.materials },
      floorManagerState: this.floorManager.exportState(),
      playerSkills: this.skillManager.exportState().skills,
      playerEquipment: equipState.equipped,
      equipmentNextId: equipState.nextId,
    };
    return { ...base, ...overrides };
  }

  private handleInput(): void {
    const up = this.cursors.up.isDown || this.wasd.up.isDown;
    const down = this.cursors.down.isDown || this.wasd.down.isDown;
    const left = this.cursors.left.isDown || this.wasd.left.isDown;
    const right = this.cursors.right.isDown || this.wasd.right.isDown;

    const kbDirX = (right ? 1 : 0) - (left ? 1 : 0);
    const kbDirY = (down ? 1 : 0) - (up ? 1 : 0);
    const kbActive = kbDirX !== 0 || kbDirY !== 0;

    if (kbActive) {
      this.lastInputSource = 'keyboard';
    }

    let dirX: number;
    let dirY: number;

    if (this.lastInputSource === 'joystick') {
      dirX = this.joystickDirX;
      dirY = this.joystickDirY;
    } else {
      dirX = kbDirX;
      dirY = kbDirY;
    }

    if (dirX === 0 && dirY === 0) {
      this.player.stop();
    } else {
      this.player.move(dirX, dirY);
    }
  }
}
