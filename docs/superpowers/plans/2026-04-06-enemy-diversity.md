# Phase 5b: Enemy Diversity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 5 new enemy types with 4 AI behavior modes, data-driven EnemyConfig architecture, progressive floor unlock.

**Architecture:** Single Enemy class with `aiType` branching, `ENEMY_DEFS` config table in config.ts, FloorManager spawn table, expanded EnemyState enum.

**Tech Stack:** Phaser 3 + Arcade Physics + TypeScript + Vite

---

## File Map

| File | Responsibility | Action |
|------|---------------|--------|
| `src/config.ts` | EnemyConfig interface + ENEMY_DEFS table | Modify |
| `src/entities/Enemy.ts` | Enemy class: accept config, 4 AI modes, isSummon/owner/minions | Modify |
| `src/systems/CombatSystem.ts` | Pass sourceX/Y to takeDamage | Modify |
| `src/systems/FloorManager.ts` | getSpawnTable(floor) with weights | Modify |
| `src/scenes/GameScene.ts` | Spawn table integration, room caps, minion room clear filter | Modify |
| `src/scenes/BootScene.ts` | 5 new placeholder textures | Modify |
| `src/debug/DebugManager.ts` | spawnEnemy(type), listEnemyTypes() | Modify |

---

### Task 1: EnemyConfig + ENEMY_DEFS in config.ts

**Files:**
- Modify: `src/config.ts`

**Covers AC:** 1

- [ ] **Step 1: Add EnemyConfig interface and ENEMY_DEFS after UPGRADE_DEFS**

Add this at the end of `src/config.ts`, after the closing `};` of `UPGRADE_DEFS`:

```typescript
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
```

- [ ] **Step 2: Remove SPIDER_* constants from GAME_CONFIG**

Remove these lines from the `GAME_CONFIG` object:

```typescript
// Remove these:
SPIDER_HP: 50,
SPIDER_SPEED: 80,
SPIDER_ATTACK: 10,
SPIDER_ATTACK_COOLDOWN: 1500,
SPIDER_ATTACK_RANGE: 30,
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: PASS (Enemy.ts will have errors — that's expected, we fix it in Task 2)

Note: if tsc fails due to Enemy.ts referencing removed SPIDER_* constants, that's correct — Task 2 fixes it.

- [ ] **Step 4: Commit**

```bash
git add src/config.ts
git commit -m "feat: add EnemyConfig interface and ENEMY_DEFS table, remove SPIDER_* constants"
```

---

### Task 2: Refactor Enemy class to accept EnemyConfig + expand EnemyState

**Files:**
- Modify: `src/entities/Enemy.ts`

**Covers AC:** 2, 3, 20

- [ ] **Step 1: Expand EnemyState enum**

Replace the existing `EnemyState` const object at the top of `src/entities/Enemy.ts`:

```typescript
export const EnemyState = {
  // Shared
  IDLE: 'IDLE',
  KNOCKBACK: 'KNOCKBACK',
  // Chase / Shield AI
  CHASING: 'CHASING',
  ATTACKING: 'ATTACKING',
  // Charge AI (Bat)
  PATROL: 'PATROL',
  WINDUP: 'WINDUP',
  CHARGING: 'CHARGING',
  STUNNED: 'STUNNED',
  // Summon AI
  RETREATING: 'RETREATING',
  SUMMONING: 'SUMMONING',
  COOLDOWN: 'COOLDOWN',
} as const;
```

- [ ] **Step 2: Refactor Enemy constructor to accept EnemyConfig**

Add import at the top:

```typescript
import type { EnemyConfig } from '../config';
```

Replace the constructor and add new fields:

```typescript
export class Enemy extends Phaser.GameObjects.Image {
  public hp: number;
  public maxHp: number;
  public speed: number;
  public attackDamage: number;
  public attackCooldown: number;
  public attackRange: number;
  public lastAttackTime: number = 0;
  public roomIndex: number;
  public state: EnemyState = EnemyState.IDLE;
  public config: EnemyConfig;

  // Summon support
  public isSummon: boolean = false;
  public owner: Enemy | null = null;
  public minions: Enemy[] = [];

  // Shield support
  public facingAngle: number = 0;

  // Charge support
  private chargeTargetX: number = 0;
  private chargeTargetY: number = 0;
  private chargeStartX: number = 0;
  private chargeStartY: number = 0;
  private stateTimer: number = 0;

  // Summon support
  private summonTimer: number = 0;
  private summonCooldownTimer: number = 0;

  declare body: Phaser.Physics.Arcade.Body;

  private knockbackTimer: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, roomIndex: number, config: EnemyConfig, hpScale = 1, atkScale = 1) {
    super(scene, x, y, config.textureKey);
    this.setOrigin(0.5, 0.5);
    this.config = config;

    this.hp = Math.round(config.hp * hpScale);
    this.maxHp = Math.round(config.hp * hpScale);
    this.speed = config.speed;
    this.attackDamage = Math.round(config.attack * atkScale);
    this.attackCooldown = config.attackCooldown;
    this.attackRange = config.attackRange;
    this.roomIndex = roomIndex;

    // Set initial state based on AI type
    if (config.aiType === 'charge') {
      this.state = EnemyState.PATROL;
    } else if (config.aiType === 'summon') {
      this.state = EnemyState.RETREATING;
      this.summonTimer = config.summonConfig!.summonInterval;
    }

    scene.add.existing(this);
    scene.physics.world.enable(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    const halfSize = Math.floor(config.size / 2);
    body.setSize(config.size, config.size);
    body.setOffset(-halfSize, -halfSize);
    body.setCollideWorldBounds(true);
  }
```

- [ ] **Step 3: Update takeDamage to accept optional sourceX/sourceY**

Replace the existing `takeDamage` method:

```typescript
  takeDamage(amount: number, knockbackX: number, knockbackY: number, sourceX?: number, sourceY?: number): void {
    if (!this.active) return;

    let finalAmount = amount;

    // Shield damage reduction
    if (this.config.aiType === 'shield' && this.config.shieldConfig && sourceX !== undefined && sourceY !== undefined) {
      const dx = this.x - sourceX;
      const dy = this.y - sourceY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) { // skip at zero distance
        const attackAngle = Math.atan2(dy, dx); // angle FROM source TO enemy
        const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(attackAngle - this.facingAngle));
        const halfArc = Phaser.Math.DegToRad(this.config.shieldConfig.shieldArc / 2);
        if (angleDiff <= halfArc) {
          finalAmount = Math.round(amount * this.config.shieldConfig.damageReduction);
        }
      }
    }

    this.hp -= finalAmount;

    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
      return;
    }

    this.state = EnemyState.KNOCKBACK;
    this.knockbackTimer = GAME_CONFIG.KNOCKBACK_DURATION;

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(knockbackX, knockbackY);
  }
```

- [ ] **Step 4: Update die() for summon support**

Replace the existing `die` method:

```typescript
  die(): void {
    // If this is a minion, remove from owner's list
    if (this.owner) {
      const idx = this.owner.minions.indexOf(this);
      if (idx !== -1) this.owner.minions.splice(idx, 1);
    }

    // If this is a summoner, kill all minions
    if (this.minions.length > 0) {
      const minionsToKill = [...this.minions];
      this.minions = [];
      for (const minion of minionsToKill) {
        minion.owner = null;
        if (minion.active) {
          minion.setActive(false);
          minion.setVisible(false);
          const body = minion.body as Phaser.Physics.Arcade.Body;
          body.enable = false;
          body.setVelocity(0, 0);
          // No enemy-killed emit for minions dying with summoner
        }
      }
    }

    // Only emit enemy-killed for non-summon enemies (controls loot + room clear)
    if (!this.isSummon) {
      EventBus.emit('enemy-killed', this);
    }

    this.setActive(false);
    this.setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    body.setVelocity(0, 0);
  }
```

- [ ] **Step 5: Keep existing updateAI for chase (unchanged)**

The existing `updateAI` method handles chase AI. Refactor it to branch by `config.aiType`. Replace the entire `updateAI` method:

```typescript
  updateAI(player: Player, rooms: Room[]): void {
    if (!this.active) return;

    const room = rooms[this.roomIndex];
    if (!room) return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    // Knockback handling (shared across all AI types)
    if (this.state === EnemyState.KNOCKBACK) {
      this.knockbackTimer -= this.scene.game.loop.delta;
      if (this.knockbackTimer <= 0) {
        // Return to default state for this AI type
        if (this.config.aiType === 'charge') this.state = EnemyState.PATROL;
        else if (this.config.aiType === 'summon') this.state = EnemyState.RETREATING;
        else this.state = EnemyState.CHASING;
      }
      return;
    }

    // Room state checks (shared)
    if (room.state === RoomState.UNVISITED || room.state === RoomState.CLEARED) {
      this.state = EnemyState.IDLE;
      body.setVelocity(0, 0);
      return;
    }

    // Altar disengage (shared)
    const playerRoomIndex = (this.scene as GameScene).currentPlayerRoom;
    if (playerRoomIndex !== null) {
      const playerRoom = rooms[playerRoomIndex];
      if (playerRoom && playerRoom.state === RoomState.ALTAR) {
        this.state = EnemyState.IDLE;
        body.setVelocity(0, 0);
        return;
      }
    }

    // Branch by AI type
    switch (this.config.aiType) {
      case 'chase':
      case 'shield':
        this.updateChaseAI(player, body);
        break;
      case 'charge':
        this.updateChargeAI(player, body);
        break;
      case 'summon':
        this.updateSummonAI(player, body);
        break;
    }
  }

  private updateChaseAI(player: Player, body: Phaser.Physics.Arcade.Body): void {
    // Update facing angle for shield type
    if (this.config.aiType === 'shield' && this.config.shieldConfig) {
      const targetAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
      const maxRotation = Phaser.Math.DegToRad(this.config.shieldConfig.turnRate) * (this.scene.game.loop.delta / 1000);
      this.facingAngle = Phaser.Math.Angle.RotateTo(this.facingAngle, targetAngle, maxRotation);
    }

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.attackRange) {
      this.state = EnemyState.ATTACKING;
      body.setVelocity(0, 0);

      const now = this.scene.time.now;
      if (now - this.lastAttackTime >= this.attackCooldown) {
        this.lastAttackTime = now;
        player.takeDamage(this.attackDamage);
      }
    } else {
      this.state = EnemyState.CHASING;
      this.scene.physics.moveToObject(this, player, this.speed);
    }
  }

  private updateChargeAI(player: Player, body: Phaser.Physics.Arcade.Body): void {
    const delta = this.scene.game.loop.delta;
    const cfg = this.config.chargeConfig!;

    switch (this.state) {
      case EnemyState.PATROL: {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        this.scene.physics.moveToObject(this, player, this.config.speed);
        if (dist < cfg.triggerRange) {
          this.state = EnemyState.WINDUP;
          this.stateTimer = cfg.windupMs;
          this.chargeTargetX = player.x;
          this.chargeTargetY = player.y;
          body.setVelocity(0, 0);
          this.setTint(0xff4444);
        }
        break;
      }
      case EnemyState.WINDUP: {
        this.stateTimer -= delta;
        // Shake effect
        this.x += (Math.random() - 0.5) * 2;
        if (this.stateTimer <= 0) {
          this.state = EnemyState.CHARGING;
          this.chargeStartX = this.x;
          this.chargeStartY = this.y;
          this.clearTint();
          // Set velocity toward locked target
          const angle = Phaser.Math.Angle.Between(this.x, this.y, this.chargeTargetX, this.chargeTargetY);
          body.setVelocity(Math.cos(angle) * cfg.chargeSpeed, Math.sin(angle) * cfg.chargeSpeed);
        }
        break;
      }
      case EnemyState.CHARGING: {
        // Check wall collision
        if (body.blocked.up || body.blocked.down || body.blocked.left || body.blocked.right) {
          this.enterStunned(body);
          break;
        }
        // Check max distance
        const traveled = Phaser.Math.Distance.Between(this.chargeStartX, this.chargeStartY, this.x, this.y);
        if (traveled >= cfg.maxDistance) {
          this.enterStunned(body);
          break;
        }
        // Check player collision (manual, since we may ignore enemy collisions)
        const distToPlayer = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        if (distToPlayer < this.config.size / 2 + 20) {
          player.takeDamage(this.attackDamage);
          this.enterStunned(body);
        }
        break;
      }
      case EnemyState.STUNNED: {
        this.stateTimer -= delta;
        // Alpha flicker
        this.setAlpha(this.stateTimer % 200 < 100 ? 0.5 : 1.0);
        if (this.stateTimer <= 0) {
          this.setAlpha(1.0);
          this.state = EnemyState.PATROL;
        }
        break;
      }
    }
  }

  private enterStunned(body: Phaser.Physics.Arcade.Body): void {
    this.state = EnemyState.STUNNED;
    this.stateTimer = this.config.chargeConfig!.stunMs;
    body.setVelocity(0, 0);
    this.clearTint();
  }

  private updateSummonAI(player: Player, body: Phaser.Physics.Arcade.Body): void {
    const delta = this.scene.game.loop.delta;
    const cfg = this.config.summonConfig!;

    // Update summon timer
    this.summonTimer -= delta;

    // Retreating / maintaining distance (shared across RETREATING and COOLDOWN)
    if (this.state === EnemyState.RETREATING || this.state === EnemyState.COOLDOWN) {
      const dist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
      if (dist < cfg.retreatDistance) {
        // Move away from player
        const angle = Phaser.Math.Angle.Between(player.x, player.y, this.x, this.y);
        body.setVelocity(Math.cos(angle) * this.speed, Math.sin(angle) * this.speed);
      } else if (dist > cfg.retreatDistance + 40) {
        // Move toward player to prevent infinite kiting
        this.scene.physics.moveToObject(this, player, this.speed);
      } else {
        body.setVelocity(0, 0);
      }
    }

    switch (this.state) {
      case EnemyState.RETREATING: {
        // Check if should summon
        if (this.summonTimer <= 0 && this.minions.filter(m => m.active).length < cfg.maxMinions) {
          this.state = EnemyState.SUMMONING;
          this.stateTimer = cfg.windupMs;
          body.setVelocity(0, 0);
        }
        break;
      }
      case EnemyState.SUMMONING: {
        this.stateTimer -= delta;
        // Pulse bright effect
        this.setTint(this.stateTimer % 300 < 150 ? 0xffffff : 0x9966cc);
        if (this.stateTimer <= 0) {
          this.clearTint();
          this.spawnMinion();
          this.state = EnemyState.COOLDOWN;
          this.summonCooldownTimer = cfg.cooldownMs;
        }
        break;
      }
      case EnemyState.COOLDOWN: {
        this.summonCooldownTimer -= delta;
        if (this.summonCooldownTimer <= 0) {
          this.state = EnemyState.RETREATING;
          this.summonTimer = cfg.summonInterval;
        }
        break;
      }
    }
  }

  private spawnMinion(): void {
    const cfg = this.config.summonConfig!;
    const gameScene = this.scene as GameScene;
    const minionConfig = ENEMY_DEFS[cfg.summonType];
    if (!minionConfig) return;

    const floorConfig = gameScene.floorManager.getFloorConfig();
    const offsetX = (Math.random() - 0.5) * 60;
    const offsetY = (Math.random() - 0.5) * 60;

    const minion = new Enemy(
      this.scene,
      this.x + offsetX,
      this.y + offsetY,
      this.roomIndex,
      minionConfig,
      floorConfig.enemyHpScale * cfg.minionHpScale,
      floorConfig.enemyAtkScale * cfg.minionAtkScale,
    );
    minion.isSummon = true;
    minion.owner = this;
    this.minions.push(minion);
    gameScene.enemyGroup.add(minion);
  }
```

Add the missing import for ENEMY_DEFS at the top of the file:

```typescript
import { GAME_CONFIG, ENEMY_DEFS } from '../config';
import type { EnemyConfig } from '../config';
```

- [ ] **Step 6: Type check**

Run: `npx tsc --noEmit`
Expected: Errors in GameScene.ts (constructor call signature changed) and CombatSystem.ts (takeDamage signature) — those are fixed in Tasks 3-4.

- [ ] **Step 7: Commit**

```bash
git add src/entities/Enemy.ts
git commit -m "feat: refactor Enemy to accept EnemyConfig, add 4 AI modes + summon/shield support"
```

---

### Task 3: Update CombatSystem to pass sourceX/sourceY

**Files:**
- Modify: `src/systems/CombatSystem.ts`

**Covers AC:** 20

- [ ] **Step 1: Update executePlayerAttack to pass player position**

In `src/systems/CombatSystem.ts`, find the line in `executePlayerAttack` that calls `enemy.takeDamage`. Change:

```typescript
    enemy.takeDamage(damage, knockbackX, knockbackY);
```

To:

```typescript
    enemy.takeDamage(damage, knockbackX, knockbackY, player.x, player.y);
```

- [ ] **Step 2: Commit**

```bash
git add src/systems/CombatSystem.ts
git commit -m "feat: pass player position to takeDamage for shield arc calculation"
```

---

### Task 4: Update FloorManager with getSpawnTable

**Files:**
- Modify: `src/systems/FloorManager.ts`

**Covers AC:** 13, 14

- [ ] **Step 1: Add getSpawnTable method**

Add import at top of `src/systems/FloorManager.ts`:

```typescript
import { GAME_CONFIG, ENEMY_DEFS } from '../config';
import type { EnemyConfig } from '../config';
```

Add this method to the `FloorManager` class, after `resetToFloor1()`:

```typescript
  getSpawnTable(): { config: EnemyConfig; weight: number }[] {
    const table: { config: EnemyConfig; weight: number }[] = [];
    for (const config of Object.values(ENEMY_DEFS)) {
      if (config.unlockFloor <= this.currentFloor) {
        let weight = config.spawnWeight;
        // 1.5x weight bonus on unlock floor
        if (config.unlockFloor === this.currentFloor) {
          weight = Math.round(weight * 1.5);
        }
        table.push({ config, weight });
      }
    }
    return table;
  }
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: May still have errors from GameScene — fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add src/systems/FloorManager.ts
git commit -m "feat: add getSpawnTable with progressive unlock and weight bonus"
```

---

### Task 5: Update GameScene spawn system + room clear filter

**Files:**
- Modify: `src/scenes/GameScene.ts`

**Covers AC:** 15, 24

- [ ] **Step 1: Rewrite spawnEnemiesInRoom to use spawn table**

Replace the entire `spawnEnemiesInRoom` method in `src/scenes/GameScene.ts`:

```typescript
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

    // Get spawn table and track per-room caps
    const spawnTable = this.floorManager.getSpawnTable();
    const totalWeight = spawnTable.reduce((sum, e) => sum + e.weight, 0);
    const roomTypeCounts: Record<string, number> = {};

    for (let i = 0; i < count; i++) {
      // Weighted random selection with maxPerRoom cap
      const config = this.pickEnemyConfig(spawnTable, totalWeight, roomTypeCounts);
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
    spawnTable: { config: import('../config').EnemyConfig; weight: number }[],
    totalWeight: number,
    roomTypeCounts: Record<string, number>,
  ): import('../config').EnemyConfig | null {
    // Filter out types that hit maxPerRoom cap
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
```

Add the `EnemyConfig` type import at top if not already:

```typescript
import type { EnemyConfig } from '../config';
```

- [ ] **Step 2: Update checkRoomClearing to filter out summons**

In `checkRoomClearing`, change the `anyAlive` check. Replace:

```typescript
      const anyAlive = roomEnemies.some(e => e.active);
```

With:

```typescript
      const anyAlive = roomEnemies.some(e => e.active && !e.isSummon);
```

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: PASS (or only BootScene texture warnings if new textures not yet added)

- [ ] **Step 4: Commit**

```bash
git add src/scenes/GameScene.ts
git commit -m "feat: spawn table integration with weighted random + room caps + summon filter"
```

---

### Task 6: Add placeholder textures in BootScene

**Files:**
- Modify: `src/scenes/BootScene.ts`

**Covers AC:** 16

- [ ] **Step 1: Add 5 new enemy textures**

In `src/scenes/BootScene.ts`, add these after the existing `enemySpider` texture generation (after `enemySpider.destroy();`):

```typescript
    // enemy-goblin: 28x28 green triangle
    const enemyGoblin = this.make.graphics({ x: 0, y: 0 }, false);
    enemyGoblin.fillStyle(0x228b22);
    enemyGoblin.fillTriangle(14, 0, 28, 28, 0, 28);
    enemyGoblin.generateTexture('enemy-goblin', 28, 28);
    enemyGoblin.destroy();

    // enemy-bat: 24x24 purple diamond
    const enemyBat = this.make.graphics({ x: 0, y: 0 }, false);
    enemyBat.fillStyle(0x6a0dad);
    enemyBat.fillTriangle(12, 0, 24, 12, 12, 24);
    enemyBat.fillTriangle(12, 0, 0, 12, 12, 24);
    enemyBat.generateTexture('enemy-bat', 24, 24);
    enemyBat.destroy();

    // enemy-skel-sword: 32x32 light gray square
    const enemySkelSword = this.make.graphics({ x: 0, y: 0 }, false);
    enemySkelSword.fillStyle(0xcccccc);
    enemySkelSword.fillRect(0, 0, 32, 32);
    enemySkelSword.generateTexture('enemy-skel-sword', 32, 32);
    enemySkelSword.destroy();

    // enemy-skel-shield: 34x34 gray square with front line (shield indicator)
    const enemySkelShield = this.make.graphics({ x: 0, y: 0 }, false);
    enemySkelShield.fillStyle(0xaaaaaa);
    enemySkelShield.fillRect(0, 0, 34, 34);
    enemySkelShield.lineStyle(3, 0xffffff);
    enemySkelShield.lineBetween(0, 0, 0, 34); // left edge = "front" shield line
    enemySkelShield.generateTexture('enemy-skel-shield', 34, 34);
    enemySkelShield.destroy();

    // enemy-skel-summoner: 30x30 light purple circle + cross
    const enemySkelSummoner = this.make.graphics({ x: 0, y: 0 }, false);
    enemySkelSummoner.fillStyle(0x9966cc);
    enemySkelSummoner.fillCircle(15, 15, 15);
    enemySkelSummoner.lineStyle(2, 0xffffff);
    enemySkelSummoner.lineBetween(15, 5, 15, 25); // vertical cross
    enemySkelSummoner.lineBetween(5, 15, 25, 15); // horizontal cross
    enemySkelSummoner.generateTexture('enemy-skel-summoner', 30, 30);
    enemySkelSummoner.destroy();
```

- [ ] **Step 2: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/scenes/BootScene.ts
git commit -m "feat: add placeholder textures for 5 new enemy types"
```

---

### Task 7: Update DebugManager

**Files:**
- Modify: `src/debug/DebugManager.ts`

**Covers AC:** 17, 18

- [ ] **Step 1: Add imports**

At top of `src/debug/DebugManager.ts`, add:

```typescript
import { ENEMY_DEFS } from '../config';
```

- [ ] **Step 2: Add spawnEnemy and listEnemyTypes to registerDebugAPI**

Find the section where debug methods are registered on `window.__debug`. Add these two methods:

```typescript
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
```

Also add the Enemy import if not already present:

```typescript
import { Enemy } from '../entities/Enemy';
```

- [ ] **Step 3: Update getStateSnapshot to include enemy types**

In `buildStateSnapshot`, find the enemies section and update:

```typescript
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
```

- [ ] **Step 4: Update existing spawnEnemies debug command to use new API**

Find the existing debug command that spawns enemies (the `spawnEnemies` command in `registerDebugAPI`). Update it to use the new Enemy constructor. Change:

```typescript
          this.scene.spawnEnemiesInRoom(roomIndex);
```

To:

```typescript
          const fc = this.scene.floorManager.getFloorConfig();
          this.scene.spawnEnemiesInRoom(roomIndex, fc.enemyHpScale, fc.enemyAtkScale, fc.enemiesPerRoom);
```

- [ ] **Step 5: Type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/debug/DebugManager.ts
git commit -m "feat: add spawnEnemy/listEnemyTypes debug commands + enemy type in snapshot"
```

---

### Task 8: Build, deploy, and verify

**Files:** None (verification only)

**Covers AC:** All remaining

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: PASS with no errors

- [ ] **Step 2: Deploy to GitHub Pages**

Run: `npx gh-pages -d dist`
Expected: Published successfully

- [ ] **Step 3: Commit any remaining changes**

```bash
git status
# If any uncommitted changes, commit them
```

---

## AC Coverage Map

| AC | Task |
|----|------|
| 1. EnemyConfig + ENEMY_DEFS | Task 1 |
| 2. Enemy accepts EnemyConfig | Task 2 |
| 3. Spider unchanged | Task 2 (chase AI path) |
| 4. Goblin F2 chase | Tasks 1+2+5+6 |
| 5. Bat F3 charge cycle | Tasks 1+2+5+6 |
| 6. Bat windup telegraph | Task 2 (updateChargeAI WINDUP) |
| 7. Bat locks direction | Task 2 (CHARGING state) |
| 8. Bat 800ms stun | Task 2 (STUNNED state) |
| 9. Skel Swordsman F3 chase | Tasks 1+2+5+6 |
| 10. Skel Shieldbearer F4 shield | Tasks 1+2+3+5+6 |
| 11. Skel Summoner F5 summon | Tasks 1+2+5+6 |
| 12. Minion isSummon + room clear + death | Tasks 2+5 |
| 13. getSpawnTable | Task 4 |
| 14. 1.5x weight bonus | Task 4 |
| 15. HP/ATK scaling | Task 5 |
| 16. 6 textures | Task 6 |
| 17. Debug commands | Task 7 |
| 18. Snapshot enemy types | Task 7 |
| 19. Shield turn rate | Task 2 (updateChaseAI) |
| 20. takeDamage sourceX/Y | Tasks 2+3 |
| 21. Minions no loot/no event | Task 2 (die method) |
| 22. Summoner death clears owner | Task 2 (die method) |
| 23. Bat charge ignores enemies | Task 2 (CHARGING manual collision) |
| 24. Room caps | Task 5 (pickEnemyConfig) |
