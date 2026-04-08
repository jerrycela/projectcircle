import Phaser from 'phaser';
import { DebugManager } from '../debug/DebugManager';
import { generate } from '../systems/DungeonGenerator';
import { RoomState } from '../systems/DungeonGenerator';
import type { Room } from '../systems/DungeonGenerator';
import { GAME_CONFIG, Element, ELEMENTAL_CONFIG, COMPANION_CONFIG, ENEMY_DEFS } from '../config';
import type { EnemyConfig } from '../config';
import { WaterPool } from '../entities/WaterPool';
import { Torch } from '../entities/Torch';
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
import { CompanionManager } from '../systems/CompanionManager';
import { Hostage, HostageState } from '../entities/Hostage';
import type { HostageRoomData } from '../systems/DungeonGenerator';
import type { EquipmentItem, EquipmentSlot } from '../config';
import { FogOfWar } from '../effects/FogOfWar';

export interface RunState {
  statsManagerState: { bonuses: StatBlock; levels: Record<string, number>; equipmentBonuses?: Partial<StatBlock> };
  playerHp: number;
  playerMp: number;
  playerGold: number;
  playerMaterials: { wood: number; ore: number; cloth: number };
  floorManagerState: FloorState;
  playerSkills?: Array<string | { type: string; level: number }>;
  playerEquipment?: Record<EquipmentSlot, EquipmentItem | null>;
  equipmentNextId?: number;
  companionFloorAssignment?: Record<number, string>;
}

export class GameScene extends Phaser.Scene {
  private debugManager?: DebugManager;
  public combatSystem!: CombatSystem;
  public lootSystem!: LootSystem;
  public statsManager!: StatsManager;
  public skillManager!: SkillManager;
  public equipmentManager!: EquipmentManager;
  public companionManager!: CompanionManager;
  private hostage?: Hostage;
  private hostageRoomData: HostageRoomData | null = null;
  private rescueButtonVisible: boolean = false;
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
  public altar?: Altar;
  public floorManager!: FloorManager;
  private staircase?: Staircase;
  public waterPools: WaterPool[] = [];
  public torches: Torch[] = [];
  private runState?: RunState;
  private fogOfWar?: FogOfWar;

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

    // Companion manager
    this.companionManager = new CompanionManager(() => this.floorManager.highestFloor);
    if (this.runState?.companionFloorAssignment) {
      this.companionManager.importFloorAssignment(this.runState.companionFloorAssignment);
    } else {
      this.companionManager.assignFloors();
    }

    // Generate dungeon with floor-scaled config
    const floorConfig = this.floorManager.getFloorConfig();
    const companionId = this.companionManager.getCompanionForFloor(this.floorManager.currentFloor);
    const { grid, rooms, hazards, hostageRoom } = generate({
      roomCount: floorConfig.roomCount,
      roomSize: floorConfig.roomSize,
      companionId,
    });
    this.grid = grid;
    this.rooms = rooms;
    this.hostageRoomData = hostageRoom;

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
          // Floor tile (upgraded texture)
          const tile = this.add.image(worldX, worldY, 'floor-tile-v2');
          tile.setOrigin(0, 0);
          tile.setDisplaySize(tileSize, tileSize);
          tile.setTint(0x3a3228);
          tile.setDepth(0);
          floorGroup.add(tile);
        } else {
          // Wall top surface
          const tile = this.wallGroup.create(worldX, worldY, 'wall-top') as Phaser.Physics.Arcade.Image;
          tile.setOrigin(0, 0);
          tile.setDisplaySize(tileSize, tileSize);
          tile.setTint(0x2a2520);
          tile.setDepth(2);
          tile.refreshBody();

          // South-facing facade: only if cell below is floor
          if (gy + 1 < GAME_CONFIG.MAP_HEIGHT && grid[gy + 1][gx] === 0) {
            const facade = this.add.image(worldX, (gy + 1) * tileSize - 16, 'wall-face');
            facade.setOrigin(0, 0);
            facade.setDisplaySize(tileSize, 24);
            facade.setDepth(4);

            // Shadow strip on floor below facade
            const shadow = this.add.rectangle(
              worldX + tileSize / 2, (gy + 1) * tileSize + 8 + 6,
              tileSize, 12, 0x000000, 0.35,
            );
            shadow.setDepth(1);
          }
        }
      }
    }

    // Scatter debris on floor tiles (5-10% density)
    const debrisKeys = ['floor-debris-01', 'floor-debris-02'];
    const rotations = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
    for (let gy = 0; gy < GAME_CONFIG.MAP_HEIGHT; gy++) {
      for (let gx = 0; gx < GAME_CONFIG.MAP_WIDTH; gx++) {
        if (grid[gy][gx] !== 0) continue;
        // Skip tiles with wall in 4-neighborhood
        const hasWallNeighbor =
          (gy > 0 && grid[gy - 1][gx] === 1) ||
          (gy + 1 < GAME_CONFIG.MAP_HEIGHT && grid[gy + 1][gx] === 1) ||
          (gx > 0 && grid[gy][gx - 1] === 1) ||
          (gx + 1 < GAME_CONFIG.MAP_WIDTH && grid[gy][gx + 1] === 1);
        if (hasWallNeighbor) continue;
        if (Math.random() > 0.08) continue;

        const key = debrisKeys[Math.floor(Math.random() * debrisKeys.length)];
        const debris = this.add.image(
          gx * tileSize + tileSize / 2,
          gy * tileSize + tileSize / 2,
          key,
        );
        debris.setDepth(0.5);
        debris.setAlpha(0.6);
        debris.setRotation(rotations[Math.floor(Math.random() * rotations.length)]);
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

    // Camera follow with lerp + zoom for mobile readability
    this.cameras.main.setZoom(1.6);
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

    // Spawn hazards
    this.waterPools = [];
    this.torches = [];
    for (const h of hazards) {
      if (h.type === 'water-pool') {
        this.waterPools.push(new WaterPool(this, h.tileX, h.tileY));
      } else if (h.type === 'torch') {
        this.torches.push(new Torch(this, h.tileX, h.tileY));
      }
    }

    // Loot group and system
    this.lootGroup = this.add.group();
    this.lootSystem = new LootSystem(this, this.player, this.lootGroup, this.equipmentManager, this.companionManager);

    // Projectile group (for arcane bolt, etc.)
    this.projectileGroup = this.physics.add.group();

    // Skill manager
    this.skillManager = new SkillManager(this);
    if (this.runState?.playerSkills) {
      this.skillManager.importState({ skills: this.runState.playerSkills });
    }

    // Combat system — receives skill manager reference
    this.combatSystem = new CombatSystem(this, this.statsManager, this.skillManager, this.equipmentManager);

    EventBus.on('altar-session-closed', (data: { altar: unknown; reason: string }) => {
      if (this.altar && data.altar === this.altar) {
        this.altar.endSession();
      }
    });

    // Skill cast requests from UIScene (skill button taps)
    EventBus.on('skill-cast-request', (slotIndex: number) => {
      this.skillManager.cast(slotIndex);
    });

    // Equipment pickup — forward to UIScene
    EventBus.on('equipment-pickup', (item: EquipmentItem, loot: import('../entities/Loot').Loot) => {
      this.gameplayLocked = true;
      this.physics.pause();
      EventBus.emit('gameplay-lock', true);
      EventBus.emit('show-equipment-compare', item, loot);
    });

    // Rescue trigger from UIScene rescue button
    EventBus.on('rescue-triggered', () => {
      if (!this.hostage || this.hostage.hostageState !== HostageState.CAGED) return;

      this.player.setInvincible(true);
      EventBus.emit('hide-rescue-button');
      this.rescueButtonVisible = false;

      this.hostage.startRescue(() => {
        this.player.setInvincible(false);
        this.companionManager.rescue(this.hostage!.companionId);
        this.hostage = undefined;
      });
    });

    EventBus.on('equipment-compare-done', () => {
      this.gameplayLocked = false;
      this.physics.resume();
      EventBus.emit('gameplay-lock', false);
    });

    // Animator event wiring (PlayerAnimator is a pure puppet — driven from here)
    EventBus.on('player-hit', () => {
      this.player.animator.playHit();
    });

    EventBus.on('player-attack-swing', (data: { dirX: number; cooldownMs: number }) => {
      this.player.animator.playAttack(data.dirX, data.cooldownMs);
    });

    EventBus.on('player-heal-flash', () => {
      this.player.animator.playHealFlash();
    });

    EventBus.on('player-skill-cast', () => {
      this.player.animator.playCast();
    });

    // Player death handler
    EventBus.on('player-died', () => {
      this.player.animator.playDead();
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

    // --- Atmosphere: Fog of War ---
    this.fogOfWar = new FogOfWar(this, mapPixelWidth, mapPixelHeight);

    // --- Atmosphere: Vignette (camera-fixed dark corners) ---
    const vigW = GAME_CONFIG.GAME_WIDTH;
    const vigH = GAME_CONFIG.GAME_HEIGHT;
    const vigCanvas = this.textures.createCanvas('vignette-tex', vigW, vigH)!;
    const vigCtx = vigCanvas.getContext();
    const grad = vigCtx.createRadialGradient(vigW / 2, vigH / 2, vigH * 0.20, vigW / 2, vigH / 2, vigH * 0.55);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.65)');
    vigCtx.fillStyle = grad;
    vigCtx.fillRect(0, 0, vigW, vigH);
    vigCanvas.refresh();
    const vigImg = this.add.image(vigW / 2, vigH / 2, 'vignette-tex');
    vigImg.setScrollFactor(0);
    vigImg.setDepth(91);

    // --- Atmosphere: Warm color filter (sepia/tarnished gold) ---
    const warmFilter = this.add.rectangle(vigW / 2, vigH / 2, vigW, vigH, 0xaa7744, 0.06);
    warmFilter.setScrollFactor(0);
    warmFilter.setDepth(91.5);
    if (this.game.renderer.type === Phaser.CANVAS) {
      warmFilter.setBlendMode(Phaser.BlendModes.NORMAL);
      warmFilter.setAlpha(0.04);
    } else {
      warmFilter.setBlendMode(Phaser.BlendModes.MULTIPLY);
    }

    // --- Atmosphere: Static noise overlay (CRT grain) ---
    const noiseSize = 128;
    const noiseCanvas = this.textures.createCanvas('noise-tex', noiseSize, noiseSize)!;
    const noiseCtx = noiseCanvas.getContext();
    const noiseData = noiseCtx.createImageData(noiseSize, noiseSize);
    for (let i = 0; i < noiseData.data.length; i += 4) {
      const v = Math.random() > 0.5 ? 255 : 0;
      noiseData.data[i] = v;
      noiseData.data[i + 1] = v;
      noiseData.data[i + 2] = v;
      noiseData.data[i + 3] = 8; // ~0.03 alpha
    }
    noiseCtx.putImageData(noiseData, 0, 0);
    noiseCanvas.refresh();
    const noiseTile = this.add.tileSprite(vigW / 2, vigH / 2, vigW, vigH, 'noise-tex');
    noiseTile.setScrollFactor(0);
    noiseTile.setDepth(92);

    // --- Fog update in postupdate (after physics) ---
    this.events.on('postupdate', () => {
      if (this.fogOfWar && this.player?.active) {
        this.fogOfWar.update(
          this.player.x, this.player.y,
          this.torches,
          this.game.loop.delta,
        );
      }
    });

    EventBus.emit('scene-ready');

    // Show initial skill pick on fresh run (no skills yet)
    if (this.skillManager.getSkillCount() === 0) {
      this.gameplayLocked = true;
      this.physics.pause();
      // Delay slightly so UIScene has finished setting up listeners
      this.time.delayedCall(100, () => {
        EventBus.emit('show-initial-skill-pick');
      });
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      this.debugManager = new DebugManager(this);
    }
  }

  private onShutdown(): void {
    EventBus.emit('game-scene-shutdown');
    this.fogOfWar?.destroy();
    this.fogOfWar = undefined;
    this.events.off('postupdate');
    // Remove dynamic textures to prevent WebGL leak on scene restart
    if (this.textures.exists('vignette-tex')) this.textures.remove('vignette-tex');
    if (this.textures.exists('noise-tex')) this.textures.remove('noise-tex');
    this.combatSystem?.destroy();
    this.lootSystem?.destroy();
    // Destroy all projectiles to prevent orphaned physics bodies
    if (this.projectileGroup) {
      this.projectileGroup.clear(true, true);
    }
    EventBus.off('joystick-move');
    EventBus.off('joystick-stop');
    EventBus.off('player-hit');
    EventBus.off('player-attack-swing');
    EventBus.off('player-heal-flash');
    EventBus.off('player-skill-cast');
    EventBus.off('player-died');
    EventBus.off('gameplay-lock');
    EventBus.off('altar-session-closed');
    EventBus.off('floor-cleared');
    EventBus.off('skill-cast-request');
    EventBus.off('equipment-pickup');
    EventBus.off('equipment-compare-done');
    EventBus.off('rescue-triggered');
    EventBus.off('show-initial-skill-pick');
    EventBus.off('hostage-guards-defeated');
    EventBus.off('show-rescue-button');
    EventBus.off('hide-rescue-button');
    this.companionManager?.destroy();
    this.hostage = undefined;
    this.hostageRoomData = null;
    this.rescueButtonVisible = false;
    this.waterPools = [];
    this.torches = [];
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
    this.player.animator.update(delta, this.player.isMoving);
    this.skillManager.update(delta);
    this.combatSystem.update(time, delta);
    this.lootSystem.update();
    this.updateHazardElements(delta);
    this.altar?.update(time, delta);
    this.staircase?.update();
    this.checkHostageInteraction();
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
            // Check if this is the hostage room
            if (this.hostageRoomData && i === this.hostageRoomData.roomIndex) {
              this.spawnHostageRoom(i, this.hostageRoomData.companionId, fc);
            }
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
    if (this.hostageRoomData && roomIndex === this.hostageRoomData.roomIndex) return;

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
    this.player.elementalState.clear();
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
    this.player.elementalState.clear();
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
      companionFloorAssignment: this.companionManager.exportFloorAssignment(),
    };
    return { ...base, ...overrides };
  }

  private updateHazardElements(delta: number): void {
    // Player element countdown (paused when gameplayLocked — guard at top of update())
    this.player.elementalState.update(delta);
    this.player.updateElementVisual();

    // Closest-wins hazard rule
    let closestDist = Infinity;
    let closestElement: Element | null = null;

    for (const pool of this.waterPools) {
      const dx = this.player.x - pool.x;
      const dy = this.player.y - pool.y;
      const poolHalf = GAME_CONFIG.TILE_SIZE; // half of 2-tile pool
      if (Math.abs(dx) <= poolHalf && Math.abs(dy) <= poolHalf) {
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < closestDist) {
          closestDist = dist;
          closestElement = Element.WATER;
        }
      }
    }

    for (const torch of this.torches) {
      torch.updateParticles(delta);
      const dx = this.player.x - torch.x;
      const dy = this.player.y - torch.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ELEMENTAL_CONFIG.HAZARD_TORCH_PROXIMITY && dist < closestDist) {
        closestDist = dist;
        closestElement = Element.FIRE;
      }
    }

    if (closestElement !== null) {
      this.player.elementalState.apply(closestElement);
    }

    // Enemy element/stun tints
    const allEnemies = this.enemyGroup.getChildren() as Enemy[];
    for (const enemy of allEnemies) {
      if (!enemy.active) continue;
      if (enemy.isCCStunned) {
        enemy.setTint(0x88ccff);
      } else if (enemy.elementalState.element !== null) {
        const tints: Record<string, number> = {
          WATER: 0x4488ff, FIRE: 0xff6600, THUNDER: 0xffff44, WIND: 0x88ffcc,
        };
        enemy.setTint(tints[enemy.elementalState.element] ?? 0xffffff);
      } else {
        enemy.clearTint();
      }
    }
  }

  private spawnHostageRoom(roomIndex: number, companionId: string, floorConfig: ReturnType<FloorManager['getFloorConfig']>): void {
    const room = this.rooms[roomIndex];
    const tileSize = GAME_CONFIG.TILE_SIZE;
    const cx = room.centerX * tileSize + tileSize / 2;
    const cy = room.centerY * tileSize + tileSize / 2;

    // Spawn hostage at room center
    this.hostage = new Hostage(this, cx, cy, companionId);

    // Spawn wardens
    const wardenCount = this.floorManager.currentFloor >= 4 ? 2 : 1;
    const wardenDef = ENEMY_DEFS['warden'];

    for (let w = 0; w < wardenCount; w++) {
      const angle = (w / wardenCount) * Math.PI * 2;
      const dist = 80;
      const wx = cx + Math.cos(angle) * dist;
      const wy = cy + Math.sin(angle) * dist;

      const enemy = new Enemy(
        this, wx, wy, roomIndex, wardenDef,
        floorConfig.enemyHpScale * COMPANION_CONFIG.WARDEN_HP_MULT,
        floorConfig.enemyAtkScale * COMPANION_CONFIG.WARDEN_ATK_MULT,
      );
      this.enemyGroup.add(enemy);
    }

    // Room overlay (cold tone)
    const overlay = this.add.rectangle(
      cx, cy,
      room.width * tileSize, room.height * tileSize,
      0x000033, 0.3,
    );
    overlay.setDepth(0);

    // Listen for room cleared to fade overlay
    const clearCheck = () => {
      const r = this.rooms[roomIndex];
      if (r.state === RoomState.CLEARED) {
        this.tweens.add({
          targets: overlay,
          alpha: 0,
          duration: 500,
          onComplete: () => overlay.destroy(),
        });
        EventBus.off('room-cleared', clearCheck);
      }
    };
    // Poll via checkRoomClearing — piggyback on room state change
    const timerEvent = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        if (!this.rooms || !this.rooms[roomIndex]) { timerEvent.remove(); return; }
        if (this.rooms[roomIndex].state === RoomState.CLEARED) {
          clearCheck();
          timerEvent.remove();
        }
      },
    });
  }

  private checkHostageInteraction(): void {
    if (!this.hostage || this.hostage.hostageState !== HostageState.CAGED) {
      if (this.rescueButtonVisible) {
        EventBus.emit('hide-rescue-button');
        this.rescueButtonVisible = false;
      }
      return;
    }

    // Only interactable after room is cleared
    const roomData = this.hostageRoomData;
    if (!roomData) return;
    const room = this.rooms[roomData.roomIndex];
    if (room.state !== RoomState.CLEARED) return;

    if (this.hostage.isInRange(this.player.x, this.player.y)) {
      if (!this.rescueButtonVisible) {
        EventBus.emit('show-rescue-button');
        this.rescueButtonVisible = true;
      }
    } else if (this.rescueButtonVisible) {
      EventBus.emit('hide-rescue-button');
      this.rescueButtonVisible = false;
    }
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
