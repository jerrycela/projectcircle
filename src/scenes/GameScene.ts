import Phaser from 'phaser';
import { DebugManager } from '../debug/DebugManager';
import { generate } from '../systems/DungeonGenerator';
import { RoomState } from '../systems/DungeonGenerator';
import type { Room } from '../systems/DungeonGenerator';
import { GAME_CONFIG } from '../config';
import { Player } from '../entities/Player';
import { Enemy } from '../entities/Enemy';
import EventBus from '../systems/EventBus';
import { CombatSystem } from '../systems/CombatSystem';
import { LootSystem } from '../systems/LootSystem';
import { StatsManager } from '../systems/StatsManager';

export class GameScene extends Phaser.Scene {
  private debugManager?: DebugManager;
  public combatSystem!: CombatSystem;
  public lootSystem!: LootSystem;
  public statsManager!: StatsManager;
  public gameplayLocked: boolean = false;
  private recoveryAccum: number = 0;

  public rooms: Room[] = [];
  public grid: number[][] = [];
  public wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  public player!: Player;
  public enemyGroup!: Phaser.Physics.Arcade.Group;
  public lootGroup!: Phaser.GameObjects.Group;
  public currentPlayerRoom: number | null = null;

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

  create(): void {
    console.log('GameScene started');

    const { grid, rooms } = generate();
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
          // Floor tile — no physics needed
          const tile = this.add.image(worldX, worldY, 'floor-tile');
          tile.setOrigin(0, 0);
          floorGroup.add(tile);
        } else {
          // Wall tile — StaticGroup for collision
          const tile = this.wallGroup.create(worldX, worldY, 'wall-tile') as Phaser.Physics.Arcade.Image;
          tile.setOrigin(0, 0);
          tile.refreshBody();
        }
      }
    }

    this.physics.world.setBounds(0, 0, mapPixelWidth, mapPixelHeight);
    this.cameras.main.setBounds(0, 0, mapPixelWidth, mapPixelHeight);
    this.cameras.main.setBackgroundColor('#000000');

    // Spawn player at center of first room (world coordinates)
    const firstRoom = rooms[0];
    const spawnX = firstRoom.centerX * tileSize + tileSize / 2;
    const spawnY = firstRoom.centerY * tileSize + tileSize / 2;
    this.statsManager = new StatsManager();
    this.player = new Player(this, spawnX, spawnY, this.statsManager);

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
    this.spawnEnemiesInRoom(0);

    // Loot group and system
    this.lootGroup = this.add.group();
    this.lootSystem = new LootSystem(this, this.player, this.lootGroup);

    // Combat system
    this.combatSystem = new CombatSystem(this, this.statsManager);

    // Player death handler
    EventBus.on('player-died', () => {
      this.combatSystem.onPlayerDied();
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

    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      this.debugManager = new DebugManager(this);
    }
  }

  private onShutdown(): void {
    this.combatSystem?.destroy();
    this.lootSystem?.destroy();
    EventBus.off('joystick-move');
    EventBus.off('joystick-stop');
    EventBus.off('player-died');
    EventBus.off('gameplay-lock');
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
    this.combatSystem.update(time, delta);
    this.lootSystem.update();
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
            this.spawnEnemiesInRoom(i);
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

      const anyAlive = roomEnemies.some(e => e.active);
      if (!anyAlive) {
        room.state = RoomState.CLEARED;
        console.log(`[GameScene] Room ${i} cleared`);
      }
    }
  }

  spawnEnemiesInRoom(roomIndex: number): void {
    const room = this.rooms[roomIndex];
    if (!room) return;
    if (room.state === RoomState.ALTAR) return;

    const tileSize = GAME_CONFIG.TILE_SIZE;
    const count = Phaser.Math.Between(
      GAME_CONFIG.ENEMIES_PER_ROOM.min,
      GAME_CONFIG.ENEMIES_PER_ROOM.max,
    );

    // Room world bounds (inner floor area, excluding wall tiles)
    const roomLeft = room.x * tileSize;
    const roomTop = room.y * tileSize;
    const roomRight = (room.x + room.width) * tileSize;
    const roomBottom = (room.y + room.height) * tileSize;

    const safeFromPlayer = GAME_CONFIG.SPAWN_SAFETY_FROM_PLAYER;
    const safeFromWall = GAME_CONFIG.SPAWN_SAFETY_FROM_WALL;
    const maxRetries = 20;

    for (let i = 0; i < count; i++) {
      let placed = false;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const wx = Phaser.Math.Between(roomLeft + safeFromWall, roomRight - safeFromWall);
        const wy = Phaser.Math.Between(roomTop + safeFromWall, roomBottom - safeFromWall);

        // Check distance from player
        const pdx = wx - this.player.x;
        const pdy = wy - this.player.y;
        if (Math.sqrt(pdx * pdx + pdy * pdy) < safeFromPlayer) continue;

        // Check that this tile is floor (grid value 0)
        const gx = Math.floor(wx / tileSize);
        const gy = Math.floor(wy / tileSize);
        if (
          gy < 0 || gy >= this.grid.length ||
          gx < 0 || gx >= this.grid[0].length ||
          this.grid[gy][gx] !== 0
        ) continue;

        // Valid position found
        const enemy = new Enemy(this, wx, wy, roomIndex);
        this.enemyGroup.add(enemy);
        placed = true;
        break;
      }

      if (!placed) {
        console.warn(`[GameScene] Could not place enemy ${i} in room ${roomIndex} after ${maxRetries} attempts`);
      }
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
