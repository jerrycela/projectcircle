import Phaser from 'phaser';
import { GAME_CONFIG, ENEMY_DEFS } from '../config';
import type { EnemyConfig } from '../config';
import type { Player } from './Player';
import type { Room } from '../systems/DungeonGenerator';
import { RoomState } from '../systems/DungeonGenerator';
import EventBus from '../systems/EventBus';
import type { GameScene } from '../scenes/GameScene';
import { ElementalState } from '../systems/ElementalState';

export const EnemyState = {
  IDLE: 'IDLE',
  KNOCKBACK: 'KNOCKBACK',
  CHASING: 'CHASING',
  ATTACKING: 'ATTACKING',
  PATROL: 'PATROL',
  WINDUP: 'WINDUP',
  CHARGING: 'CHARGING',
  STUNNED: 'STUNNED',
  RETREATING: 'RETREATING',
  SUMMONING: 'SUMMONING',
  COOLDOWN: 'COOLDOWN',
} as const;

export type EnemyState = typeof EnemyState[keyof typeof EnemyState];

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
  public isSummon: boolean = false;
  public owner: Enemy | null = null;
  public minions: Enemy[] = [];
  public facingAngle: number = 0;
  public elementalState: ElementalState = new ElementalState(true);
  private ccStunRemainingMs: number = 0;
  private preCCState: EnemyState | null = null;

  private chargeTargetX: number = 0;
  private chargeTargetY: number = 0;
  private chargeStartX: number = 0;
  private chargeStartY: number = 0;
  private stateTimer: number = 0;
  private summonTimer: number = 0;
  private summonCooldownTimer: number = 0;

  declare body: Phaser.Physics.Arcade.Body;

  private knockbackTimer: number = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    roomIndex: number,
    config: EnemyConfig,
    hpScale = 1,
    atkScale = 1,
  ) {
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

    scene.add.existing(this);
    scene.physics.world.enable(this);

    const half = config.size / 2;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(config.size, config.size);
    body.setOffset(-half, -half);
    body.setCollideWorldBounds(true);

    // Set initial state based on AI type
    if (config.aiType === 'charge') {
      this.state = EnemyState.PATROL;
    } else if (config.aiType === 'summon') {
      this.state = EnemyState.RETREATING;
    } else {
      this.state = EnemyState.IDLE;
    }
  }

  updateAI(player: Player, rooms: Room[]): void {
    // CC Stun layer — independent of AI state
    if (this.ccStunRemainingMs > 0) {
      this.ccStunRemainingMs -= this.scene.game.loop.delta;
      const body = this.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);

      // Electric sparks while stunned
      if (Math.random() < 0.15) {
        const spark = this.scene.add.graphics();
        spark.fillStyle(0xaaddff, 0.8);
        spark.fillCircle(0, 0, 2);
        spark.setPosition(
          this.x + Phaser.Math.Between(-16, 16),
          this.y + Phaser.Math.Between(-16, 16),
        );
        spark.setDepth(86);
        this.scene.tweens.add({
          targets: spark,
          alpha: 0,
          duration: 150,
          onComplete: () => spark.destroy(),
        });
      }

      if (this.ccStunRemainingMs <= 0) {
        this.ccStunRemainingMs = 0;
        if (this.preCCState !== null) {
          this.state = this.preCCState;
          this.preCCState = null;
        }
      }
      return;
    }

    if (!this.active) return;

    const room = rooms[this.roomIndex];
    if (!room) return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    // Shared: knockback handling
    if (this.state === EnemyState.KNOCKBACK) {
      this.knockbackTimer -= this.scene.game.loop.delta;
      if (this.knockbackTimer <= 0) {
        // Return to default state for AI type
        switch (this.config.aiType) {
          case 'charge':
            this.state = EnemyState.PATROL;
            break;
          case 'summon':
            this.state = EnemyState.RETREATING;
            break;
          default:
            this.state = EnemyState.CHASING;
        }
      }
      return;
    }

    // Shared: room state checks
    if (room.state === RoomState.UNVISITED) {
      this.state = EnemyState.IDLE;
      body.setVelocity(0, 0);
      return;
    }

    if (room.state === RoomState.CLEARED) {
      this.state = EnemyState.IDLE;
      body.setVelocity(0, 0);
      return;
    }

    // Shared: altar disengage
    const playerRoomIndex = (this.scene as GameScene).currentPlayerRoom;
    if (playerRoomIndex !== null) {
      const playerRoom = rooms[playerRoomIndex];
      if (playerRoom && playerRoom.state === RoomState.ALTAR) {
        this.state = EnemyState.IDLE;
        body.setVelocity(0, 0);
        return;
      }
    }

    // Dispatch to AI type
    switch (this.config.aiType) {
      case 'chase':
      case 'shield':
        this.updateChaseAI(player);
        break;
      case 'charge':
        this.updateChargeAI(player);
        break;
      case 'summon':
        this.updateSummonAI(player, rooms);
        break;
    }
  }

  private updateChaseAI(player: Player): void {
    const body = this.body as Phaser.Physics.Arcade.Body;

    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Shield: track facing angle toward player with turnRate
    if (this.config.aiType === 'shield' && this.config.shieldConfig) {
      const targetAngle = Math.atan2(dy, dx);
      const turnRateRad = Phaser.Math.DegToRad(this.config.shieldConfig.turnRate) * (this.scene.game.loop.delta / 1000);
      const angleDiff = Phaser.Math.Angle.Wrap(targetAngle - this.facingAngle);
      if (Math.abs(angleDiff) <= turnRateRad) {
        this.facingAngle = targetAngle;
      } else {
        this.facingAngle += Math.sign(angleDiff) * turnRateRad;
      }
      this.facingAngle = Phaser.Math.Angle.Wrap(this.facingAngle);
    }

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

  private updateChargeAI(player: Player): void {
    if (!this.config.chargeConfig) return;
    const cfg = this.config.chargeConfig;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const delta = this.scene.game.loop.delta;

    switch (this.state) {
      case EnemyState.PATROL: {
        // Drift slowly or idle; check trigger range
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= cfg.triggerRange) {
          this.state = EnemyState.WINDUP;
          this.stateTimer = cfg.windupMs;
          // Lock target position at windup start
          this.chargeTargetX = player.x;
          this.chargeTargetY = player.y;
          body.setVelocity(0, 0);
          // Red tint for windup telegraph
          this.setTint(0xff4444);
        } else {
          // Slow patrol movement toward player
          this.scene.physics.moveToObject(this, player, this.speed * 0.4);
        }
        break;
      }

      case EnemyState.WINDUP: {
        this.stateTimer -= delta;
        // Shake during windup
        if (Math.floor(this.stateTimer / 60) % 2 === 0) {
          this.setX(this.x + (Math.random() - 0.5) * 2);
        }
        if (this.stateTimer <= 0) {
          this.state = EnemyState.CHARGING;
          this.chargeStartX = this.x;
          this.chargeStartY = this.y;
          this.clearTint();
          // Launch charge
          const cdx = this.chargeTargetX - this.x;
          const cdy = this.chargeTargetY - this.y;
          const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
          const nx = cdist > 0 ? cdx / cdist : 1;
          const ny = cdist > 0 ? cdy / cdist : 0;
          body.setVelocity(nx * cfg.chargeSpeed, ny * cfg.chargeSpeed);
        }
        break;
      }

      case EnemyState.CHARGING: {
        // Check wall collision
        if (body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down) {
          this.enterStunned(cfg.stunMs);
          break;
        }
        // Check distance traveled
        const travelDx = this.x - this.chargeStartX;
        const travelDy = this.y - this.chargeStartY;
        const traveled = Math.sqrt(travelDx * travelDx + travelDy * travelDy);
        if (traveled >= cfg.maxDistance) {
          this.enterStunned(cfg.stunMs);
          break;
        }
        // Check player hit
        const pdx = player.x - this.x;
        const pdy = player.y - this.y;
        const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pdist < this.attackRange + 10) {
          player.takeDamage(this.attackDamage);
          this.enterStunned(cfg.stunMs);
        }
        break;
      }

      case EnemyState.STUNNED: {
        this.stateTimer -= delta;
        if (this.stateTimer <= 0) {
          this.state = EnemyState.PATROL;
          body.setVelocity(0, 0);
          this.clearTint();
        }
        break;
      }

      default:
        this.state = EnemyState.PATROL;
        break;
    }
  }

  private enterStunned(stunMs: number): void {
    this.state = EnemyState.STUNNED;
    this.stateTimer = stunMs;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.setTint(0x888888);
  }

  applyCCStun(durationMs: number): void {
    let dur = durationMs;
    if (this.state === EnemyState.KNOCKBACK) {
      const remaining = Math.max(0, this.knockbackTimer);
      dur = Math.max(0, dur - remaining);
    }
    if (dur <= 0) return;
    if (this.ccStunRemainingMs <= 0) {
      this.preCCState = this.state;
    }
    this.ccStunRemainingMs = Math.max(this.ccStunRemainingMs, dur);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
  }

  get isCCStunned(): boolean {
    return this.ccStunRemainingMs > 0;
  }

  private updateSummonAI(player: Player, rooms: Room[]): void {
    if (!this.config.summonConfig) return;
    const cfg = this.config.summonConfig;
    const body = this.body as Phaser.Physics.Arcade.Body;
    const delta = this.scene.game.loop.delta;

    switch (this.state) {
      case EnemyState.RETREATING: {
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < cfg.retreatDistance) {
          // Move away from player
          const nx = dist > 0 ? dx / dist : 0;
          const ny = dist > 0 ? dy / dist : 0;
          body.setVelocity(-nx * this.speed, -ny * this.speed);
        } else {
          body.setVelocity(0, 0);
        }

        // Check if we can summon
        this.summonTimer -= delta;
        if (this.summonTimer <= 0 && this.minions.length < cfg.maxMinions) {
          this.state = EnemyState.SUMMONING;
          this.stateTimer = cfg.windupMs;
          this.summonTimer = cfg.summonInterval;
          body.setVelocity(0, 0);
          this.setTint(0xaa44ff);
        }
        break;
      }

      case EnemyState.SUMMONING: {
        this.stateTimer -= delta;
        // Pulse tint during windup
        const pulse = Math.sin(this.stateTimer / 100) > 0;
        this.setTint(pulse ? 0xaa44ff : 0xffffff);

        if (this.stateTimer <= 0) {
          this.clearTint();
          // Spawn minion if under cap
          if (this.minions.length < cfg.maxMinions) {
            this.spawnMinion(rooms);
          }
          this.state = EnemyState.COOLDOWN;
          this.summonCooldownTimer = cfg.cooldownMs;
        }
        break;
      }

      case EnemyState.COOLDOWN: {
        this.summonCooldownTimer -= delta;

        // Still retreat during cooldown
        const dx = player.x - this.x;
        const dy = player.y - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < cfg.retreatDistance) {
          const nx = dist > 0 ? dx / dist : 0;
          const ny = dist > 0 ? dy / dist : 0;
          body.setVelocity(-nx * this.speed, -ny * this.speed);
        } else {
          body.setVelocity(0, 0);
        }

        if (this.summonCooldownTimer <= 0) {
          this.state = EnemyState.RETREATING;
        }
        break;
      }

      default:
        this.state = EnemyState.RETREATING;
        break;
    }
  }

  private spawnMinion(rooms: Room[]): void {
    if (!this.config.summonConfig) return;
    const cfg = this.config.summonConfig;

    const minionConfig = ENEMY_DEFS[cfg.summonType];
    if (!minionConfig) return;

    const gameScene = this.scene as GameScene;

    // Spawn offset
    const angle = Math.random() * Math.PI * 2;
    const spawnX = this.x + Math.cos(angle) * 50;
    const spawnY = this.y + Math.sin(angle) * 50;

    const minion = new Enemy(
      this.scene,
      spawnX,
      spawnY,
      this.roomIndex,
      minionConfig,
      cfg.minionHpScale,
      cfg.minionAtkScale,
    );

    minion.isSummon = true;
    minion.owner = this;
    this.minions.push(minion);

    // Add to scene enemy group and set up wall collision
    gameScene.enemyGroup.add(minion);
    gameScene.physics.add.collider(minion, gameScene.wallGroup);
  }

  takeDamage(amount: number, knockbackX: number, knockbackY: number, sourceX?: number, sourceY?: number): void {
    if (!this.active) return;

    let finalAmount = amount;

    // Shield damage reduction when facing source
    if (
      this.config.aiType === 'shield' &&
      this.config.shieldConfig &&
      sourceX !== undefined &&
      sourceY !== undefined
    ) {
      const sdx = sourceX - this.x;
      const sdy = sourceY - this.y;
      const dist = Math.sqrt(sdx * sdx + sdy * sdy);

      if (dist > 0) {
        const attackAngle = Math.atan2(sdy, sdx);
        const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(attackAngle - this.facingAngle));
        const halfArc = Phaser.Math.DegToRad(this.config.shieldConfig.shieldArc / 2);

        if (angleDiff <= halfArc) {
          finalAmount = Math.round(amount * (1 - this.config.shieldConfig.damageReduction));
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

  die(): void {
    // If this is a minion, remove from owner's minion list
    if (this.isSummon && this.owner) {
      const idx = this.owner.minions.indexOf(this);
      if (idx !== -1) {
        this.owner.minions.splice(idx, 1);
      }
    }

    // If this is a summoner, clear all minions
    if (this.minions.length > 0) {
      const minionsCopy = [...this.minions];
      this.minions = [];
      for (const minion of minionsCopy) {
        if (minion.active) {
          minion.owner = null;
          minion.die();
        }
      }
    }

    this.elementalState.clear();
    this.ccStunRemainingMs = 0;

    // Only emit enemy-killed for non-summons
    if (!this.isSummon) {
      EventBus.emit('enemy-killed', this);
    }

    this.setActive(false);
    this.setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    body.setVelocity(0, 0);
  }
}
