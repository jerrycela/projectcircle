import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';
import type { Player } from './Player';
import type { Room } from '../systems/DungeonGenerator';
import { RoomState } from '../systems/DungeonGenerator';
import EventBus from '../systems/EventBus';

export const EnemyState = {
  IDLE: 'IDLE',
  CHASING: 'CHASING',
  ATTACKING: 'ATTACKING',
  KNOCKBACK: 'KNOCKBACK',
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

  declare body: Phaser.Physics.Arcade.Body;

  private knockbackTimer: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, roomIndex: number) {
    super(scene, x, y, 'enemy-spider');
    this.setOrigin(0.5, 0.5);

    this.hp = GAME_CONFIG.SPIDER_HP;
    this.maxHp = GAME_CONFIG.SPIDER_HP;
    this.speed = GAME_CONFIG.SPIDER_SPEED;
    this.attackDamage = GAME_CONFIG.SPIDER_ATTACK;
    this.attackCooldown = GAME_CONFIG.SPIDER_ATTACK_COOLDOWN;
    this.attackRange = GAME_CONFIG.SPIDER_ATTACK_RANGE;
    this.roomIndex = roomIndex;

    scene.add.existing(this);
    scene.physics.world.enable(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 32);
    body.setOffset(-16, -16);
    body.setCollideWorldBounds(true);
  }

  updateAI(player: Player, rooms: Room[]): void {
    if (!this.active) return;

    const room = rooms[this.roomIndex];
    if (!room) return;

    const body = this.body as Phaser.Physics.Arcade.Body;

    if (this.state === EnemyState.KNOCKBACK) {
      this.knockbackTimer -= this.scene.game.loop.delta;
      if (this.knockbackTimer <= 0) {
        this.state = EnemyState.CHASING;
      }
      // Let physics handle knockback velocity decay
      return;
    }

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

    // Room is ACTIVE
    const dx = player.x - this.x;
    const dy = player.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.attackRange) {
      this.state = EnemyState.ATTACKING;
      body.setVelocity(0, 0);

      // Check cooldown and deal damage
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

  takeDamage(amount: number, knockbackX: number, knockbackY: number): void {
    if (!this.active) return;

    this.hp -= amount;

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
    EventBus.emit('enemy-killed', this);
    this.setActive(false);
    this.setVisible(false);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.enable = false;
    body.setVelocity(0, 0);
  }
}
