import Phaser from 'phaser';
import { GAME_CONFIG } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from '../entities/Enemy';
import EventBus from './EventBus';
import type { StatsManager } from './StatsManager';

export class CombatSystem {
  private scene: GameScene;
  private statsManager: StatsManager;
  private lastAttackTime: number = 0;
  private lastScanTime: number = 0;

  constructor(scene: GameScene, statsManager: StatsManager) {
    this.scene = scene;
    this.statsManager = statsManager;

    // Camera shake on player hit (no flash for normal attacks, reserved for skills)
    EventBus.on('player-hit', () => {
      scene.cameras.main.shake(120, 0.008);
    });
  }

  destroy(): void {
    EventBus.off('player-hit');
  }

  update(time: number, _delta: number): void {
    // Throttle scan to every ATTACK_SCAN_INTERVAL ms
    if (time - this.lastScanTime < GAME_CONFIG.ATTACK_SCAN_INTERVAL) return;
    this.lastScanTime = time;

    this.tryPlayerAttack(time);
  }

  private tryPlayerAttack(time: number): void {
    const player = this.scene.player;

    // CRITICAL: player must NOT be moving to auto-attack
    if (player.isMoving) return;

    // Check attack cooldown
    if (time - this.lastAttackTime < GAME_CONFIG.ATTACK_COOLDOWN) return;

    // Find nearest enemy in range
    const enemy = this.findNearestEnemyInRange();
    if (!enemy) return;

    this.lastAttackTime = time;
    this.executePlayerAttack(player, enemy);
  }

  private findNearestEnemyInRange(): Enemy | null {
    const player = this.scene.player;
    const enemies = this.scene.enemyGroup.getChildren() as Enemy[];
    const rangeSq = GAME_CONFIG.ATTACK_RANGE * GAME_CONFIG.ATTACK_RANGE;

    let nearest: Enemy | null = null;
    let nearestDistSq = Infinity;

    for (const enemy of enemies) {
      if (!enemy.active) continue;

      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= rangeSq && distSq < nearestDistSq) {
        nearest = enemy;
        nearestDistSq = distSq;
      }
    }

    return nearest;
  }

  private executePlayerAttack(player: Phaser.GameObjects.Container, enemy: Enemy): void {
    // Calculate damage
    let damage = Phaser.Math.Between(
      this.statsManager.getStat('attackMin'),
      this.statsManager.getStat('attackMax'),
    );
    let isCrit = false;

    if (Math.random() < this.statsManager.getStat('critChance')) {
      damage = Math.floor(damage * this.statsManager.getStat('critDamage'));
      isCrit = true;
    }

    // Direction from player to enemy
    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const nx = dist > 0 ? dx / dist : 1;
    const ny = dist > 0 ? dy / dist : 0;

    // Weapon swing visual arc
    this.spawnAttackArc(player.x, player.y, enemy.x, enemy.y);

    // Floating damage number
    this.spawnDamageNumber(enemy.x, enemy.y, damage, isCrit);

    // Enemy hit flash + shake
    this.flashEnemy(enemy);
    this.shakeEnemy(enemy);

    // Screen shake on hit (subtle)
    this.scene.cameras.main.shake(80, 0.003);

    // Purple particles
    this.spawnHitParticles(enemy.x, enemy.y);

    // Apply knockback
    const knockbackX = nx * GAME_CONFIG.KNOCKBACK_FORCE;
    const knockbackY = ny * GAME_CONFIG.KNOCKBACK_FORCE;

    // Deal damage to enemy
    enemy.takeDamage(damage, knockbackX, knockbackY, player.x, player.y);
  }

  private spawnAttackArc(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): void {
    const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
    const midX = fromX + Math.cos(angle) * 40;
    const midY = fromY + Math.sin(angle) * 40;

    // Draw arc as a Graphics object
    const arc = this.scene.add.graphics();
    arc.lineStyle(3, 0xffffff, 1.0);
    arc.beginPath();
    // Short arc spanning ±40deg around the attack direction
    arc.arc(0, 0, 30, angle - 0.7, angle + 0.7, false);
    arc.strokePath();
    arc.setPosition(midX, midY);
    arc.setDepth(50);

    // Fade out over 150ms then destroy
    this.scene.tweens.add({
      targets: arc,
      alpha: 0,
      duration: 150,
      ease: 'Linear',
      onComplete: () => { arc.destroy(); },
    });
  }

  private spawnDamageNumber(x: number, y: number, damage: number, isCrit: boolean): void {
    const color = isCrit ? '#ffff00' : '#ffffff';
    const fontSize = isCrit ? '22px' : '16px';

    const text = this.scene.add.text(x, y - 10, String(damage), {
      fontSize,
      color,
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(100);

    if (isCrit) {
      // Brief scale bounce for crit
      this.scene.tweens.add({
        targets: text,
        scaleX: 1.4,
        scaleY: 1.4,
        duration: 80,
        yoyo: true,
        ease: 'Sine.Out',
      });
    }

    this.scene.tweens.add({
      targets: text,
      y: y - 60,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.Out',
      onComplete: () => { text.destroy(); },
    });
  }

  private flashEnemy(enemy: Enemy): void {
    // Subtle red tint instead of full white flash (white flash reserved for skills)
    enemy.setTint(0xff8888);
    this.scene.time.delayedCall(50, () => {
      if (enemy.active) {
        enemy.clearTint();
      }
    });
  }

  private shakeEnemy(enemy: Enemy): void {
    const baseX = enemy.x;
    this.scene.tweens.add({
      targets: enemy,
      x: baseX + 2,
      duration: 25,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.InOut',
      onComplete: () => {
        if (enemy.active) enemy.setPosition(baseX, enemy.y);
      },
    });
  }

  private spawnHitParticles(x: number, y: number): void {
    const count = Phaser.Math.Between(5, 8);

    for (let i = 0; i < count; i++) {
      const circle = this.scene.add.graphics();
      circle.fillStyle(0x4b0082, 1.0);
      circle.fillCircle(0, 0, 3);
      circle.setPosition(x, y);
      circle.setDepth(99);

      const angle = Math.random() * Math.PI * 2;
      const speed = Phaser.Math.Between(30, 80);
      const targetX = x + Math.cos(angle) * speed;
      const targetY = y + Math.sin(angle) * speed;

      this.scene.tweens.add({
        targets: circle,
        x: targetX,
        y: targetY,
        alpha: 0,
        duration: 300,
        ease: 'Cubic.Out',
        onComplete: () => { circle.destroy(); },
      });
    }
  }

  onPlayerDied(): void {
    // Physics pause and death screen are handled by GameScene.triggerDeath()
  }
}
