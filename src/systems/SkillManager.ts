import Phaser from 'phaser';
import { SKILL_DEFS, GAME_CONFIG } from '../config';
import { Element, ELEMENTAL_CONFIG } from '../config';
import type { SkillDefinition, SkillLevelData } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Enemy } from '../entities/Enemy';
import EventBus from './EventBus';
import { ReactionResolver } from './ReactionResolver';
import type { HitContext } from './ReactionResolver';

export type SkillSlotState = 'EMPTY' | 'READY' | 'CASTING' | 'COOLDOWN';

interface SkillSlot {
  type: string | null;
  state: SkillSlotState;
  cooldownRemaining: number; // ms
  level: number;
}

export class SkillManager {
  private scene: GameScene;
  private slots: SkillSlot[];

  constructor(scene: GameScene) {
    this.scene = scene;
    this.slots = [];
    for (let i = 0; i < GAME_CONFIG.SKILL_SLOT_COUNT; i++) {
      this.slots.push({ type: null, state: 'EMPTY', cooldownRemaining: 0, level: 0 });
    }
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
        slot.level = 1;
        EventBus.emit('skill-state-changed');
        return true;
      }
    }
    return false; // both slots full
  }

  hasSkill(type: string): boolean {
    return this.slots.some(s => s.type === type);
  }

  upgradeSkill(type: string): boolean {
    const def = SKILL_DEFS[type];
    if (!def) return false;
    for (const slot of this.slots) {
      if (slot.type === type) {
        if (slot.level >= GAME_CONFIG.SKILL_MAX_LEVEL) return false;
        slot.level++;
        EventBus.emit('skill-state-changed');
        return true;
      }
    }
    return false;
  }

  getSkillLevel(type: string): number {
    for (const slot of this.slots) {
      if (slot.type === type) return slot.level;
    }
    return 0;
  }

  getSlotLevel(slot: number): number {
    return this.slots[slot]?.level ?? 0;
  }

  replaceSkill(slotIndex: number, newType: string): boolean {
    const slot = this.slots[slotIndex];
    if (!slot || slot.state === 'EMPTY') return false;
    if (!SKILL_DEFS[newType]) return false;
    slot.type = newType;
    slot.state = 'READY';
    slot.cooldownRemaining = 0;
    slot.level = 1;
    EventBus.emit('skill-state-changed');
    return true;
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
      slot.level = 0;
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

  exportState(): { skills: Array<{ type: string; level: number }> } {
    return {
      skills: this.slots
        .filter(s => s.type !== null)
        .map(s => ({ type: s.type as string, level: s.level })),
    };
  }

  importState(state: { skills: Array<string | { type: string; level: number }> }): void {
    for (const slot of this.slots) {
      slot.type = null;
      slot.state = 'EMPTY';
      slot.cooldownRemaining = 0;
      slot.level = 0;
    }
    for (const entry of state.skills) {
      const type = typeof entry === 'string' ? entry : entry.type;
      const level = typeof entry === 'string' ? 1 : (entry.level ?? 1);
      if (!SKILL_DEFS[type]) continue;
      for (const slot of this.slots) {
        if (slot.state === 'EMPTY') {
          slot.type = type;
          slot.state = 'READY';
          slot.level = level;
          break;
        }
      }
    }
    EventBus.emit('skill-state-changed');
  }

  // ------------------------------------------------------------------ SKILL EXECUTION

  private executeSkill(type: string, def: SkillDefinition): void {
    const level = this.getSkillLevel(type);
    const scaling = def.levelScaling[(level || 1) - 1] ?? def.levelScaling[0];
    switch (type) {
      case 'whirlwind':
        this.executeWhirlwind(def, scaling);
        break;
      case 'shadow-dash':
        this.executeShadowDash(def, scaling);
        break;
      case 'tornado':
        this.executeTornado(def, scaling);
        break;
      case 'thunderstorm':
        this.executeThunderstorm(def, scaling);
        break;
      default:
        console.warn(`[SkillManager] Unknown skill: ${type}`);
    }
  }

  private calcSkillDamage(def: SkillDefinition, level: number): number {
    const min = this.scene.statsManager.getStat('attackMin');
    const max = this.scene.statsManager.getStat('attackMax');
    const scaling = def.levelScaling[level - 1] ?? def.levelScaling[0];
    return Math.floor(Phaser.Math.Between(min, max) * scaling.damageMultiplier);
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

  private executeWhirlwind(def: SkillDefinition, scaling: SkillLevelData): void {
    const player = this.scene.player;
    const radius = scaling.radius ?? def.radius ?? 100;

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
        const level = this.getSkillLevel(def.type);
        const dmg = this.calcSkillDamage(def, level);

        const attackElement = def.category === 'magic'
          ? (def.fixedElement ?? null)
          : (this.scene.player.elementalState.element ?? null);

        const hitContext: HitContext = {
          source: 'skill',
          skillType: def.type,
          attackElement,
          hitPosition: { x: enemy.x, y: enemy.y },
          alreadyHitIds: new Set(),
          isSecondaryProc: false,
        };

        const result = ReactionResolver.resolve(enemy, hitContext);
        this.spawnSkillDamageNumber(enemy.x, enemy.y, dmg + result.bonusDamage);
        const nx = dist > 0 ? dx / dist : 1;
        const ny = dist > 0 ? dy / dist : 0;
        enemy.takeDamage(dmg + result.bonusDamage, nx * 80, ny * 80, player.x, player.y);
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

  private executeShadowDash(def: SkillDefinition, scaling: SkillLevelData): void {
    const player = this.scene.player;
    const distance = scaling.dashDistance ?? def.dashDistance ?? 150;
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
        const level = this.getSkillLevel(def.type);
        this.checkDashPathDamage(startX, startY, player.x, player.y, pathWidth, def, hitEnemies, level);

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
    level: number,
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
        const dmg = this.calcSkillDamage(def, level);

        const attackElement = def.category === 'magic'
          ? (def.fixedElement ?? null)
          : (this.scene.player.elementalState.element ?? null);

        const hitContext: HitContext = {
          source: 'skill',
          skillType: def.type,
          attackElement,
          hitPosition: { x: enemy.x, y: enemy.y },
          alreadyHitIds: new Set(),
          isSecondaryProc: false,
        };

        const result = ReactionResolver.resolve(enemy, hitContext);
        this.spawnSkillDamageNumber(enemy.x, enemy.y, dmg + result.bonusDamage);
        enemy.takeDamage(dmg + result.bonusDamage, nx * 60, ny * 60, startX, startY);
      }
    }
  }

  // ---- Tornado

  private executeTornado(def: SkillDefinition, scaling: SkillLevelData): void {
    const player = this.scene.player;
    const radius = scaling.radius ?? def.radius ?? 48;
    const speed = def.projectileSpeed ?? 200;
    const maxDist = def.maxTravelDistance ?? 300;
    const tickInterval = def.tickIntervalMs ?? 100;

    const body = player.body as Phaser.Physics.Arcade.Body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    const spd = Math.sqrt(vx * vx + vy * vy);
    const dirX = spd > 1 ? vx / spd : (player.scaleX > 0 ? 1 : -1);
    const dirY = spd > 1 ? vy / spd : 0;

    const startX = player.x;
    const startY = player.y;
    let posX = startX;
    let posY = startY;
    let destroyed = false;
    let tickTimer = 0;
    let hasFlameAura = false;
    let flameAuraTimer = 0;

    const tornado = this.scene.add.graphics();
    tornado.setDepth(75);

    const hitThisTick = new Set<Enemy>();

    const updateListener = (_time: number, delta: number) => {
      if (destroyed) return;

      posX += dirX * speed * (delta / 1000);
      posY += dirY * speed * (delta / 1000);

      const travelDx = posX - startX;
      const travelDy = posY - startY;
      if (Math.sqrt(travelDx * travelDx + travelDy * travelDy) >= maxDist) {
        destroyTornado();
        return;
      }

      if (hasFlameAura) {
        flameAuraTimer -= delta;
        if (flameAuraTimer <= 0) {
          hasFlameAura = false;
        }
      }

      tornado.clear();
      const color = hasFlameAura ? 0xff4400 : 0x88ffcc;
      tornado.fillStyle(color, 0.6);
      tornado.fillCircle(posX, posY, radius);
      tornado.lineStyle(2, color, 0.8);
      tornado.strokeCircle(posX, posY, radius);

      tickTimer -= delta;
      if (tickTimer <= 0) {
        tickTimer = tickInterval;
        hitThisTick.clear();

        const enemies = this.scene.enemyGroup.getChildren() as Enemy[];
        for (const enemy of enemies) {
          if (!enemy.active || hitThisTick.has(enemy)) continue;
          const edx = enemy.x - posX;
          const edy = enemy.y - posY;
          const edist = Math.sqrt(edx * edx + edy * edy);
          if (edist > radius) continue;

          hitThisTick.add(enemy);
          const level = this.getSkillLevel(def.type);
          const dmg = this.calcSkillDamage(def, level);

          const hitContext: HitContext = {
            source: 'skill',
            skillType: 'tornado',
            attackElement: hasFlameAura ? Element.FIRE : Element.WIND,
            hitPosition: { x: enemy.x, y: enemy.y },
            alreadyHitIds: new Set(),
            isSecondaryProc: hasFlameAura,
          };

          const result = ReactionResolver.resolve(enemy, hitContext);

          if (result.flameAura) {
            hasFlameAura = true;
            flameAuraTimer = ELEMENTAL_CONFIG.FLAME_AURA_DURATION_MS;
          }

          this.spawnSkillDamageNumber(enemy.x, enemy.y, dmg + result.bonusDamage);
          enemy.takeDamage(dmg + result.bonusDamage, dirX * 30, dirY * 30, posX, posY);
        }
      }
    };

    const destroyTornado = () => {
      if (destroyed) return;
      destroyed = true;
      this.scene.events.off('update', updateListener);
      tornado.destroy();
    };

    this.scene.events.on('update', updateListener);
    const maxTime = (maxDist / speed) * 1000 + 500;
    this.scene.time.delayedCall(maxTime, destroyTornado);
  }

  // ---- Thunderstorm

  private executeThunderstorm(def: SkillDefinition, scaling: SkillLevelData): void {
    const player = this.scene.player;
    const radius = scaling.radius ?? def.radius ?? 80;
    const level = this.getSkillLevel(def.type);
    const dmg = this.calcSkillDamage(def, level);

    const body = player.body as Phaser.Physics.Arcade.Body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    const spd = Math.sqrt(vx * vx + vy * vy);
    const dirX = spd > 1 ? vx / spd : (player.scaleX > 0 ? 1 : -1);
    const dirY = spd > 1 ? vy / spd : 0;

    const targetX = player.x + dirX * 120;
    const targetY = player.y + dirY * 120;

    this.scene.cameras.main.shake(150, 0.01);
    this.spawnThunderstormVisual(targetX, targetY, radius);

    const enemies = this.scene.enemyGroup.getChildren() as Enemy[];
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - targetX;
      const dy = enemy.y - targetY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      const hitContext: HitContext = {
        source: 'skill',
        skillType: 'thunderstorm',
        attackElement: Element.THUNDER,
        hitPosition: { x: enemy.x, y: enemy.y },
        alreadyHitIds: new Set(),
        isSecondaryProc: false,
      };

      const result = ReactionResolver.resolve(enemy, hitContext);
      this.spawnSkillDamageNumber(enemy.x, enemy.y, dmg + result.bonusDamage);

      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 0;
      enemy.takeDamage(dmg + result.bonusDamage, nx * 50, ny * 50, targetX, targetY);
    }
  }

  private spawnThunderstormVisual(cx: number, cy: number, radius: number): void {
    const circle = this.scene.add.graphics();
    circle.fillStyle(0xffff44, 0.4);
    circle.fillCircle(cx, cy, radius);
    circle.lineStyle(3, 0xffff88, 0.8);
    circle.strokeCircle(cx, cy, radius);
    circle.setDepth(79);

    for (let i = 0; i < 3; i++) {
      const bolt = this.scene.add.graphics();
      bolt.lineStyle(2, 0xffff88, 1.0);
      bolt.beginPath();
      const startOffX = Phaser.Math.Between(-radius / 2, radius / 2);
      bolt.moveTo(cx + startOffX, cy - radius);
      let bx = cx + startOffX;
      let by = cy - radius;
      for (let s = 0; s < 4; s++) {
        bx += Phaser.Math.Between(-20, 20);
        by += radius * 2 / 4;
        bolt.lineTo(bx, by);
      }
      bolt.strokePath();
      bolt.setDepth(80);

      this.scene.tweens.add({
        targets: bolt,
        alpha: 0,
        duration: 200,
        delay: 50 * i,
        ease: 'Linear',
        onComplete: () => bolt.destroy(),
      });
    }

    this.scene.tweens.add({
      targets: circle,
      alpha: 0,
      duration: 300,
      ease: 'Linear',
      onComplete: () => circle.destroy(),
    });
  }
}
