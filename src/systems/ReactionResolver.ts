import Phaser from 'phaser';
import { Element, ELEMENTAL_CONFIG } from '../config';
import type { ElementalState } from './ElementalState';
import type { Enemy } from '../entities/Enemy';
import type { GameScene } from '../scenes/GameScene';

export type ReactionType = 'ELECTRO_STORM' | 'FLAME_BURST' | 'NO_REACTION';

export interface HitContext {
  source: 'auto-attack' | 'skill';
  skillType?: string;
  attackElement: Element | null;
  hitPosition: { x: number; y: number };
  alreadyHitIds: Set<number>;
  isSecondaryProc: boolean;
}

export interface ResolveResult {
  reaction: ReactionType;
  bonusDamage: number;
  flameAura?: boolean;
}

export class ReactionResolver {
  static resolve(
    enemy: Enemy,
    hitContext: HitContext,
  ): ResolveResult {
    const enemyElement = enemy.elementalState.element;
    const attackElement = hitContext.attackElement;

    if (attackElement === null) {
      return { reaction: 'NO_REACTION', bonusDamage: 0 };
    }

    const reaction = ReactionResolver.getReaction(enemyElement, attackElement);

    if (reaction !== 'NO_REACTION' && !hitContext.isSecondaryProc) {
      enemy.elementalState.clear();
      return ReactionResolver.executeReaction(reaction, enemy, hitContext);
    }

    enemy.elementalState.apply(attackElement);
    return { reaction: 'NO_REACTION', bonusDamage: 0 };
  }

  private static executeReaction(
    reaction: ReactionType,
    enemy: Enemy,
    hitContext: HitContext,
  ): ResolveResult {
    switch (reaction) {
      case 'ELECTRO_STORM':
        return ReactionResolver.executeElectroStorm(enemy, hitContext);
      case 'FLAME_BURST':
        return ReactionResolver.executeFlameBurst(enemy, hitContext);
      default:
        return { reaction: 'NO_REACTION', bonusDamage: 0 };
    }
  }

  private static executeElectroStorm(enemy: Enemy, hitContext: HitContext): ResolveResult {
    const scene = enemy.scene as GameScene;
    const baseDamage = ReactionResolver.getBaseDamage(scene);
    const bonusDamage = Math.floor(baseDamage * ELEMENTAL_CONFIG.ELECTRO_STORM_BONUS_RATIO);

    // Stun the trigger enemy
    enemy.applyCCStun(ELEMENTAL_CONFIG.ELECTRO_STUN_DURATION_MS);

    // Spawn visual on trigger enemy
    ReactionResolver.spawnElectricEffect(scene, enemy.x, enemy.y);

    // Chain lightning
    ReactionResolver.chainLightning(
      scene,
      enemy,
      hitContext,
      bonusDamage,
    );

    return { reaction: 'ELECTRO_STORM', bonusDamage };
  }

  private static executeFlameBurst(enemy: Enemy, hitContext: HitContext): ResolveResult {
    const scene = enemy.scene as GameScene;
    const baseDamage = ReactionResolver.getBaseDamage(scene);
    const bonusDamage = Math.floor(baseDamage * ELEMENTAL_CONFIG.FLAME_BURST_BONUS_RATIO);

    ReactionResolver.spawnExplosionEffect(scene, hitContext.hitPosition.x, hitContext.hitPosition.y);

    return { reaction: 'FLAME_BURST', bonusDamage, flameAura: true };
  }

  private static chainLightning(
    scene: GameScene,
    triggerEnemy: Enemy,
    hitContext: HitContext,
    bonusDamage: number,
  ): void {
    const decayFactors = ELEMENTAL_CONFIG.CHAIN_LIGHTNING_DECAY;
    const maxJumps = ELEMENTAL_CONFIG.CHAIN_LIGHTNING_MAX_JUMPS;
    const range = ELEMENTAL_CONFIG.CHAIN_LIGHTNING_RANGE;

    const visited = new Set<Enemy>([triggerEnemy]);
    let currentX = triggerEnemy.x;
    let currentY = triggerEnemy.y;
    let currentEnemy = triggerEnemy;

    for (let jump = 0; jump < maxJumps; jump++) {
      const nearest = ReactionResolver.findNearestEnemy(
        scene,
        currentEnemy,
        visited,
        range,
      );
      if (!nearest) break;

      visited.add(nearest);
      const decayedDamage = Math.floor(bonusDamage * decayFactors[jump]);

      // Spawn arc visual
      ReactionResolver.spawnLightningArc(scene, currentX, currentY, nearest.x, nearest.y);

      // Apply thunder element as secondary proc (won't chain again)
      const secondaryContext: HitContext = {
        source: hitContext.source,
        skillType: hitContext.skillType,
        attackElement: Element.THUNDER,
        hitPosition: { x: nearest.x, y: nearest.y },
        alreadyHitIds: hitContext.alreadyHitIds,
        isSecondaryProc: true,
      };
      nearest.elementalState.apply(Element.THUNDER);

      // Deal chain damage
      nearest.takeDamage(decayedDamage, 0, 0, currentX, currentY);

      // Stun chain target
      nearest.applyCCStun(ELEMENTAL_CONFIG.ELECTRO_STUN_DURATION_MS);

      // Spawn visual
      ReactionResolver.spawnElectricEffect(scene, nearest.x, nearest.y);

      // Spawn chain damage number
      ReactionResolver.spawnChainDamageNumber(scene, nearest.x, nearest.y, decayedDamage);

      // Suppress unused warning — secondaryContext is assembled for correctness
      void secondaryContext;

      currentX = nearest.x;
      currentY = nearest.y;
      currentEnemy = nearest;
    }
  }

  private static findNearestEnemy(
    scene: GameScene,
    fromEnemy: Enemy,
    visited: Set<Enemy>,
    range: number,
  ): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = Infinity;

    scene.enemyGroup.getChildren().forEach((obj) => {
      const e = obj as Enemy;
      if (!e.active) return;
      if (visited.has(e)) return;
      if (e.roomIndex !== fromEnemy.roomIndex) return;

      const dx = e.x - fromEnemy.x;
      const dy = e.y - fromEnemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= range && dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    });

    return nearest;
  }

  private static getBaseDamage(scene: GameScene): number {
    const min = scene.statsManager.getStat('attackMin');
    const max = scene.statsManager.getStat('attackMax');
    return (min + max) / 2;
  }

  private static spawnLightningArc(
    scene: GameScene,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
  ): void {
    const graphics = scene.add.graphics();
    graphics.lineStyle(2, 0x88ccff, 0.9);

    // Zigzag lightning arc
    const segments = 6;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const perpX = -dy / Math.sqrt(dx * dx + dy * dy);
    const perpY = dx / Math.sqrt(dx * dx + dy * dy);

    graphics.beginPath();
    graphics.moveTo(x1, y1);

    for (let i = 1; i < segments; i++) {
      const t = i / segments;
      const midX = x1 + dx * t;
      const midY = y1 + dy * t;
      const offset = (Math.random() - 0.5) * 20;
      graphics.lineTo(midX + perpX * offset, midY + perpY * offset);
    }
    graphics.lineTo(x2, y2);
    graphics.strokePath();

    // Fade out
    scene.tweens.add({
      targets: graphics,
      alpha: 0,
      duration: 200,
      onComplete: () => graphics.destroy(),
    });
  }

  private static spawnElectricEffect(scene: GameScene, x: number, y: number): void {
    // Blue-white tint circle burst
    const particles = scene.add.graphics();
    particles.fillStyle(0xaaddff, 0.8);
    particles.fillCircle(x, y, 14);
    particles.lineStyle(2, 0xffffff, 1.0);
    particles.strokeCircle(x, y, 14);

    scene.tweens.add({
      targets: particles,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 350,
      onComplete: () => particles.destroy(),
    });

    // Spark lines radiating outward
    const sparks = scene.add.graphics();
    sparks.lineStyle(1, 0xffffff, 0.9);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const len = 8 + Math.random() * 8;
      sparks.lineBetween(x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    }

    scene.tweens.add({
      targets: sparks,
      alpha: 0,
      duration: 250,
      onComplete: () => sparks.destroy(),
    });
  }

  private static spawnExplosionEffect(scene: GameScene, x: number, y: number): void {
    // Expanding orange-red circle
    const explosion = scene.add.graphics();
    explosion.fillStyle(0xff6600, 0.7);
    explosion.fillCircle(x, y, 10);
    explosion.lineStyle(3, 0xff2200, 0.9);
    explosion.strokeCircle(x, y, 10);

    scene.tweens.add({
      targets: explosion,
      scaleX: 5,
      scaleY: 5,
      alpha: 0,
      duration: 450,
      ease: 'Quad.easeOut',
      onComplete: () => explosion.destroy(),
    });

    // Fire particles
    for (let i = 0; i < 8; i++) {
      const particle = scene.add.graphics();
      particle.fillStyle(i % 2 === 0 ? 0xff4400 : 0xffaa00, 0.9);
      particle.fillCircle(0, 0, 4);
      particle.setPosition(x, y);

      const angle = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 30;
      scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.2,
        scaleY: 0.2,
        duration: 400 + Math.random() * 200,
        ease: 'Quad.easeOut',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private static spawnChainDamageNumber(
    scene: GameScene,
    x: number,
    y: number,
    damage: number,
  ): void {
    const text = scene.add.text(x, y - 10, `${damage}`, {
      fontSize: '11px',
      color: '#88ccff',
      stroke: '#003366',
      strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);

    scene.tweens.add({
      targets: text,
      y: y - 30,
      alpha: 0,
      duration: 600,
      onComplete: () => text.destroy(),
    });
  }

  private static getReaction(enemyElement: Element | null, attackElement: Element): ReactionType {
    if (enemyElement === Element.WATER && attackElement === Element.THUNDER) return 'ELECTRO_STORM';
    if (enemyElement === Element.FIRE && attackElement === Element.WIND) return 'FLAME_BURST';
    return 'NO_REACTION';
  }
}
