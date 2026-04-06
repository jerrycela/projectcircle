import Phaser from 'phaser';
import { SKILL_DEFS } from '../config';
import type { SkillDefinition } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from '../entities/Enemy';
import EventBus from './EventBus';

export type SkillSlotState = 'EMPTY' | 'READY' | 'CASTING' | 'COOLDOWN';

interface SkillSlot {
  type: string | null;
  state: SkillSlotState;
  cooldownRemaining: number; // ms
}

export class SkillManager {
  private scene: GameScene;
  private slots: [SkillSlot, SkillSlot];

  constructor(scene: GameScene) {
    this.scene = scene;
    this.slots = [
      { type: null, state: 'EMPTY', cooldownRemaining: 0 },
      { type: null, state: 'EMPTY', cooldownRemaining: 0 },
    ];
  }

  // ------------------------------------------------------------------ QUERIES

  addSkill(type: string): boolean {
    if (!SKILL_DEFS[type]) {
      console.warn(`[SkillManager] Unknown skill type: ${type}`);
      return false;
    }
    // No duplicates
    if (this.hasSkill(type)) return false;
    // Find first empty slot
    for (const slot of this.slots) {
      if (slot.state === 'EMPTY') {
        slot.type = type;
        slot.state = 'READY';
        EventBus.emit('skill-state-changed');
        return true;
      }
    }
    return false; // both slots full
  }

  hasSkill(type: string): boolean {
    return this.slots.some(s => s.type === type);
  }

  getSkillCount(): number {
    return this.slots.filter(s => s.state !== 'EMPTY').length;
  }

  getOwnedSkillTypes(): string[] {
    return this.slots.filter(s => s.type !== null).map(s => s.type as string);
  }

  isCasting(): boolean {
    return this.slots.some(s => s.state === 'CASTING');
  }

  getSlotState(slot: number): SkillSlotState {
    return this.slots[slot]?.state ?? 'EMPTY';
  }

  getSlotType(slot: number): string | null {
    return this.slots[slot]?.type ?? null;
  }

  getSlotCooldownRemaining(slot: number): number {
    return this.slots[slot]?.cooldownRemaining ?? 0;
  }

  getSlotCooldownRatio(slot: number): number {
    const slotData = this.slots[slot];
    if (!slotData || slotData.state !== 'COOLDOWN' || !slotData.type) return 0;
    const def = SKILL_DEFS[slotData.type];
    if (!def) return 0;
    return slotData.cooldownRemaining / def.cooldownMs;
  }

  // Override cooldown for debug/testing
  setSlotCooldown(type: string, ms: number): void {
    for (const slot of this.slots) {
      if (slot.type === type) {
        slot.cooldownRemaining = ms;
        if (ms > 0) slot.state = 'COOLDOWN';
        else slot.state = 'READY';
        EventBus.emit('skill-state-changed');
        return;
      }
    }
    console.warn(`[SkillManager] setSlotCooldown: skill ${type} not found in slots`);
  }

  removeAllSkills(): void {
    for (const slot of this.slots) {
      slot.type = null;
      slot.state = 'EMPTY';
      slot.cooldownRemaining = 0;
    }
    EventBus.emit('skill-state-changed');
  }

  // ------------------------------------------------------------------ CASTING

  canCast(slotIndex: number): boolean {
    // gameplayLocked is ALWAYS first guard
    if (this.scene.gameplayLocked) return false;

    const slot = this.slots[slotIndex];
    if (!slot || slot.state !== 'READY' || !slot.type) return false;

    const def = SKILL_DEFS[slot.type];
    if (!def) return false;

    if (this.scene.player.mp < def.mpCost) return false;

    return true;
  }

  cast(slotIndex: number): void {
    if (!this.canCast(slotIndex)) return;

    const slot = this.slots[slotIndex];
    if (!slot || !slot.type) return;

    const def = SKILL_DEFS[slot.type];
    if (!def) return;

    // Deduct MP
    this.scene.player.mp = Math.max(0, this.scene.player.mp - def.mpCost);

    // Set CASTING
    slot.state = 'CASTING';
    EventBus.emit('skill-state-changed');

    // Execute skill effect
    this.executeSkill(slot.type, def);

    // After cast duration -> COOLDOWN
    this.scene.time.delayedCall(def.castDurationMs, () => {
      // If gameplay locked, the animation completed — just enter cooldown
      slot.state = 'COOLDOWN';
      slot.cooldownRemaining = def.cooldownMs;
      EventBus.emit('skill-state-changed');
    });

    EventBus.emit('skill-used', slot.type);
  }

  // Force cast for debug (bypass canCast guards)
  forceCast(slotIndex: number): void {
    const slot = this.slots[slotIndex];
    if (!slot || !slot.type || slot.state === 'EMPTY') {
      console.warn(`[SkillManager] forceCast: slot ${slotIndex} is empty or invalid`);
      return;
    }
    const def = SKILL_DEFS[slot.type];
    if (!def) return;

    slot.state = 'CASTING';
    EventBus.emit('skill-state-changed');

    this.executeSkill(slot.type, def);

    this.scene.time.delayedCall(def.castDurationMs, () => {
      slot.state = 'COOLDOWN';
      slot.cooldownRemaining = def.cooldownMs;
      EventBus.emit('skill-state-changed');
    });

    EventBus.emit('skill-used', slot.type);
  }

  // ------------------------------------------------------------------ UPDATE

  update(delta: number): void {
    for (const slot of this.slots) {
      if (slot.state === 'COOLDOWN') {
        slot.cooldownRemaining = Math.max(0, slot.cooldownRemaining - delta);
        if (slot.cooldownRemaining === 0) {
          slot.state = 'READY';
          EventBus.emit('skill-state-changed');
        }
      }
    }
  }

  // ------------------------------------------------------------------ STATE

  exportState(): { skills: string[] } {
    return {
      skills: this.slots.filter(s => s.type !== null).map(s => s.type as string),
    };
  }

  importState(state: { skills: string[] }): void {
    // Reset all
    for (const slot of this.slots) {
      slot.type = null;
      slot.state = 'EMPTY';
      slot.cooldownRemaining = 0;
    }
    // Re-apply (cooldowns reset on floor transition by design)
    for (const type of state.skills) {
      this.addSkill(type);
    }
  }

  // ------------------------------------------------------------------ SKILL EXECUTION

  private executeSkill(type: string, def: SkillDefinition): void {
    switch (type) {
      case 'whirlwind':
        this.executeWhirlwind(def);
        break;
      case 'shadow-dash':
        this.executeShadowDash(def);
        break;
      case 'arcane-bolt':
        this.executeArcaneBolt(def);
        break;
      default:
        console.warn(`[SkillManager] Unknown skill: ${type}`);
    }
  }

  private calcSkillDamage(def: SkillDefinition): number {
    const min = this.scene.statsManager.getStat('attackMin');
    const max = this.scene.statsManager.getStat('attackMax');
    return Math.floor(Phaser.Math.Between(min, max) * def.damageMultiplier);
  }

  private spawnSkillDamageNumber(x: number, y: number, damage: number): void {
    const text = this.scene.add.text(x, y - 10, String(damage), {
      fontSize: '18px',
      color: '#00ffff',
      fontFamily: 'monospace',
      stroke: '#000000',
      strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(100);

    this.scene.tweens.add({
      targets: text,
      y: y - 65,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.Out',
      onComplete: () => { text.destroy(); },
    });
  }

  // ---- Whirlwind

  private executeWhirlwind(def: SkillDefinition): void {
    const player = this.scene.player;
    const radius = def.radius ?? 100;

    // Camera shake
    this.scene.cameras.main.shake(100, 0.005);

    // Visual: expanding ring + slash marks
    this.spawnWhirlwindVisual(player.x, player.y, radius, def.castDurationMs);

    // Damage all enemies in radius
    const enemies = this.scene.enemyGroup.getChildren() as Enemy[];
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - player.x;
      const dy = enemy.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= radius) {
        const dmg = this.calcSkillDamage(def);
        this.spawnSkillDamageNumber(enemy.x, enemy.y, dmg);
        // Knockback outward
        const nx = dist > 0 ? dx / dist : 1;
        const ny = dist > 0 ? dy / dist : 0;
        enemy.takeDamage(dmg, nx * 80, ny * 80, player.x, player.y);
      }
    }
  }

  private spawnWhirlwindVisual(cx: number, cy: number, radius: number, durationMs: number): void {
    const ring = this.scene.add.graphics();
    ring.setDepth(80);

    const slashMarks: Phaser.GameObjects.Graphics[] = [];
    for (let i = 0; i < 4; i++) {
      const slash = this.scene.add.graphics();
      slash.setDepth(81);
      slashMarks.push(slash);
    }

    // Tween radius from 0 to max
    const tweenObj = { r: 0 };
    this.scene.tweens.add({
      targets: tweenObj,
      r: radius,
      duration: durationMs,
      ease: 'Cubic.Out',
      onUpdate: () => {
        const r = tweenObj.r;
        const alpha = 1 - r / radius;

        ring.clear();
        ring.lineStyle(3, 0xffffff, Math.max(0, alpha));
        ring.strokeCircle(cx, cy, r);

        // 4 slash marks at 90-degree intervals
        for (let i = 0; i < 4; i++) {
          const angle = (i / 4) * Math.PI * 2 + (r / radius) * Math.PI;
          const sx = cx + Math.cos(angle) * r;
          const sy = cy + Math.sin(angle) * r;
          const slash = slashMarks[i];
          slash.clear();
          slash.lineStyle(2, 0xffffff, Math.max(0, alpha));
          slash.beginPath();
          slash.moveTo(sx - Math.cos(angle + Math.PI / 2) * 12, sy - Math.sin(angle + Math.PI / 2) * 12);
          slash.lineTo(sx + Math.cos(angle + Math.PI / 2) * 12, sy + Math.sin(angle + Math.PI / 2) * 12);
          slash.strokePath();
        }
      },
      onComplete: () => {
        ring.destroy();
        for (const s of slashMarks) s.destroy();
      },
    });
  }

  // ---- Shadow Dash

  private executeShadowDash(def: SkillDefinition): void {
    const player = this.scene.player;
    const distance = def.dashDistance ?? 150;
    const pathWidth = def.dashPathWidth ?? 32;
    const duration = def.dashDurationMs ?? 200;

    // Determine facing direction
    let dirX: number;
    let dirY: number;

    const body = player.body as Phaser.Physics.Arcade.Body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    const speed = Math.sqrt(vx * vx + vy * vy);

    if (speed > 1) {
      dirX = vx / speed;
      dirY = vy / speed;
    } else {
      // Stationary — use scaleX for direction
      dirX = player.scaleX > 0 ? 1 : -1;
      dirY = 0;
    }

    // Spawn ghost trail before moving
    this.spawnShadowDashTrail(player.x, player.y);

    const startX = player.x;
    const startY = player.y;
    const targetX = startX + dirX * distance;
    const targetY = startY + dirY * distance;

    // Player is invincible during dash
    player.setInvincible(true);

    // Use physics.moveTo — Arcade Physics handles wall collision
    const actualSpeed = distance / (duration / 1000); // px/s
    this.scene.physics.moveTo(player, targetX, targetY, actualSpeed);

    // Track enemies hit during dash (each hit once)
    const hitEnemies = new Set<Enemy>();

    // Check enemies along dash path each frame
    const dashTimer = this.scene.time.addEvent({
      delay: 16,
      repeat: Math.ceil(duration / 16),
      callback: () => {
        this.checkDashPathDamage(startX, startY, player.x, player.y, pathWidth, def, hitEnemies);

        // Spawn trail afterimages
        if (Math.random() < 0.5) {
          this.spawnShadowDashAfterimage(player.x, player.y);
        }
      },
    });

    // End dash after duration
    this.scene.time.delayedCall(duration, () => {
      dashTimer.remove();
      body.setVelocity(0, 0);
      player.setInvincible(false);
    });
  }

  private spawnShadowDashTrail(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 50, () => {
        this.spawnShadowDashAfterimage(x, y);
      });
    }
  }

  private spawnShadowDashAfterimage(x: number, y: number): void {
    const ghost = this.scene.add.graphics();
    ghost.fillStyle(0x8888ff, 0.6);
    ghost.fillCircle(0, 0, 16);
    ghost.setPosition(x, y);
    ghost.setDepth(45);

    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 200,
      ease: 'Linear',
      onComplete: () => { ghost.destroy(); },
    });
  }

  private checkDashPathDamage(
    startX: number, startY: number,
    currentX: number, currentY: number,
    pathWidth: number,
    def: SkillDefinition,
    hitEnemies: Set<Enemy>,
  ): void {
    const enemies = this.scene.enemyGroup.getChildren() as Enemy[];
    const halfWidth = pathWidth / 2;

    for (const enemy of enemies) {
      if (!enemy.active || hitEnemies.has(enemy)) continue;

      // Check if enemy is within the swept path rectangle
      const dx = currentX - startX;
      const dy = currentY - startY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) continue;

      const nx = dx / len;
      const ny = dy / len;

      // Vector from start to enemy
      const ex = enemy.x - startX;
      const ey = enemy.y - startY;

      // Project onto path direction
      const along = ex * nx + ey * ny;
      if (along < 0 || along > len) continue;

      // Perpendicular distance
      const perp = Math.abs(ex * (-ny) + ey * nx);
      if (perp <= halfWidth) {
        hitEnemies.add(enemy);
        const dmg = this.calcSkillDamage(def);
        this.spawnSkillDamageNumber(enemy.x, enemy.y, dmg);
        enemy.takeDamage(dmg, nx * 60, ny * 60, startX, startY);
      }
    }
  }

  // ---- Arcane Bolt

  private executeArcaneBolt(def: SkillDefinition): void {
    const player = this.scene.player;

    // Determine fire direction based on facing
    const body = player.body as Phaser.Physics.Arcade.Body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    const speed = Math.sqrt(vx * vx + vy * vy);

    let dirX: number;
    let dirY: number;

    if (speed > 1) {
      dirX = vx / speed;
      dirY = vy / speed;
    } else {
      dirX = player.scaleX > 0 ? 1 : -1;
      dirY = 0;
    }

    const boltSpeed = def.projectileSpeed ?? 350;
    const range = def.projectileRange ?? 300;
    const maxHits = (def.pierceCount ?? 2) + 1; // pierceCount=2 means hits 3 total

    // Create projectile as a Graphics object (visual) + physics body
    const bolt = this.scene.add.graphics();
    bolt.fillStyle(0x9933ff, 1.0);
    bolt.fillCircle(0, 0, 8);
    bolt.setPosition(player.x, player.y);
    bolt.setDepth(75);

    // Enable physics on the graphics object
    this.scene.physics.world.enable(bolt);
    const boltBody = (bolt as unknown as { body: Phaser.Physics.Arcade.Body }).body as Phaser.Physics.Arcade.Body;
    boltBody.setCircle(8, -8, -8);
    boltBody.setVelocity(dirX * boltSpeed, dirY * boltSpeed);

    // Add to projectile group
    this.scene.projectileGroup.add(bolt);

    const hitEnemies = new Set<Enemy>();
    let hitCount = 0;
    const startX = player.x;
    const startY = player.y;
    let destroyed = false;

    const destroyBolt = () => {
      if (destroyed) return;
      destroyed = true;
      this.spawnArcaneBoltExplosion(bolt.x, bolt.y);
      bolt.destroy();
    };

    // Overlap check with enemy group
    this.scene.physics.add.overlap(
      bolt as unknown as Phaser.GameObjects.GameObject,
      this.scene.enemyGroup,
      (boltObj, enemyObj) => {
        if (destroyed) return;
        const enemy = enemyObj as Enemy;
        if (!enemy.active || hitEnemies.has(enemy)) return;

        hitEnemies.add(enemy);
        hitCount++;

        const dmg = this.calcSkillDamage(def);
        this.spawnSkillDamageNumber(enemy.x, enemy.y, dmg);
        enemy.takeDamage(dmg, dirX * 60, dirY * 60, startX, startY);

        if (hitCount >= maxHits) {
          destroyBolt();
        }
      },
    );

    // Particle trail + range check via update event
    const updateListener = () => {
      if (destroyed) return;

      // Range check
      const dx = bolt.x - startX;
      const dy = bolt.y - startY;
      if (Math.sqrt(dx * dx + dy * dy) >= range) {
        destroyBolt();
        return;
      }

      // Particle trail — 3 small circles per frame
      for (let i = 0; i < 3; i++) {
        const particle = this.scene.add.graphics();
        particle.fillStyle(0x6600cc, 0.7);
        particle.fillCircle(0, 0, Phaser.Math.Between(2, 4));
        particle.setPosition(bolt.x + Phaser.Math.Between(-4, 4), bolt.y + Phaser.Math.Between(-4, 4));
        particle.setDepth(74);

        this.scene.tweens.add({
          targets: particle,
          alpha: 0,
          duration: 100,
          ease: 'Linear',
          onComplete: () => { particle.destroy(); },
        });
      }
    };

    this.scene.events.on('update', updateListener);

    // Cleanup listener when bolt is destroyed
    bolt.on('destroy', () => {
      this.scene.events.off('update', updateListener);
    });
  }

  private spawnArcaneBoltExplosion(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const particle = this.scene.add.graphics();
      particle.fillStyle(0x9933ff, 1.0);
      particle.fillCircle(0, 0, Phaser.Math.Between(3, 6));
      particle.setPosition(x, y);
      particle.setDepth(76);

      const angle = (i / 8) * Math.PI * 2;
      const speed = Phaser.Math.Between(50, 120);

      this.scene.tweens.add({
        targets: particle,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        duration: 300,
        ease: 'Cubic.Out',
        onComplete: () => { particle.destroy(); },
      });
    }
  }
}
