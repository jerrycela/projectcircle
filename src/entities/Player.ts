import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';
import EventBus from '../systems/EventBus';

export class Player extends Phaser.GameObjects.Container {
  public hp: number;
  public maxHp: number;
  public mp: number;
  public maxMp: number;
  public speed: number;
  public gold: number = 0;
  public materials: { wood: number; ore: number; cloth: number } = { wood: 0, ore: 0, cloth: 0 };
  public invincible: boolean = false;

  declare body: Phaser.Physics.Arcade.Body;

  private flickerEvent?: Phaser.Time.TimerEvent;

  private baseSprite: Phaser.GameObjects.Image;
  private weaponSprite: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    this.hp = GAME_CONFIG.PLAYER_HP;
    this.maxHp = GAME_CONFIG.PLAYER_HP;
    this.mp = GAME_CONFIG.PLAYER_MP;
    this.maxMp = GAME_CONFIG.PLAYER_MP;
    this.speed = GAME_CONFIG.PLAYER_SPEED;

    // Visual children — no physics on these
    this.baseSprite = scene.add.image(0, 0, 'player-body');
    this.baseSprite.setOrigin(0.5, 0.5);

    this.weaponSprite = scene.add.image(15, 0, 'player-weapon');
    this.weaponSprite.setOrigin(0.5, 0.5);

    this.add([this.baseSprite, this.weaponSprite]);

    // Add container to scene and enable physics
    scene.add.existing(this);
    scene.physics.world.enable(this);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 32);
    body.setOffset(-16, -16);
    body.setCollideWorldBounds(true);
  }

  get isMoving(): boolean {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    return vx * vx + vy * vy > 0;
  }

  move(dirX: number, dirY: number): void {
    if (dirX === 0 && dirY === 0) {
      this.stop();
      return;
    }

    // Normalize diagonal movement
    let nx = dirX;
    let ny = dirY;
    const len = Math.sqrt(nx * nx + ny * ny);
    if (len > 0) {
      nx = nx / len;
      ny = ny / len;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(nx * this.speed, ny * this.speed);

    // Flip container based on horizontal direction
    if (dirX !== 0) {
      this.scaleX = dirX > 0 ? 1 : -1;
    }
  }

  stop(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
  }

  takeDamage(amount: number): void {
    if (this.invincible) return;
    if (!this.active) return;

    this.hp -= amount;
    if (this.hp < 0) this.hp = 0;

    // Camera flash red to signal damage
    EventBus.emit('player-hit');
    EventBus.emit('player-hp-changed', this.hp, this.maxHp);

    this.setInvincible(true);

    if (this.hp <= 0) {
      EventBus.emit('player-died');
    }
  }

  heal(amount: number): void {
    this.hp = Math.min(this.hp + amount, this.maxHp);
    EventBus.emit('player-hp-changed', this.hp, this.maxHp);
  }

  addGold(amount: number): void {
    this.gold += amount;
    EventBus.emit('player-gold-changed', this.gold);
  }

  addMaterial(type: 'wood' | 'ore' | 'cloth', amount: number): void {
    this.materials[type] += amount;
    EventBus.emit('player-material-changed', { type, amount: this.materials[type] });
  }

  setInvincible(on: boolean): void {
    this.invincible = on;

    // Cancel any existing flicker
    if (this.flickerEvent) {
      this.flickerEvent.remove();
      this.flickerEvent = undefined;
    }

    if (on) {
      // Flicker alpha every 100ms for PLAYER_INVINCIBLE_MS total
      let flickerCount = 0;
      const totalFlickers = GAME_CONFIG.PLAYER_INVINCIBLE_MS / 100;

      this.flickerEvent = this.scene.time.addEvent({
        delay: 100,
        repeat: totalFlickers - 1,
        callback: () => {
          flickerCount++;
          this.setAlpha(this.alpha === 1.0 ? 0.3 : 1.0);

          if (flickerCount >= totalFlickers) {
            // Invincibility ended
            this.setAlpha(1.0);
            this.invincible = false;
            this.flickerEvent = undefined;
          }
        },
      });
    } else {
      // Immediately clear invincibility
      this.setAlpha(1.0);
    }
  }
}
