# Phase 5e: Altar Shop Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the altar from pick-1-of-3 cards into a two-phase interaction: skill three-choose-one (first visit per floor) followed by a repeatable 3x2 grid upgrade shop.

**Architecture:** The altar state machine gains a COOLDOWN state (replacing CONSUMED) to prevent re-trigger while player stands still. UpgradePanel is rewritten as a two-phase controller: SkillPickPhase handles skill selection, then ShopPhase renders a persistent 3x2 grid. SkillManager gains per-slot levels with scaling. All changes use existing EventBus patterns.

**Tech Stack:** Phaser 3, TypeScript, Phaser Graphics API, EventBus

**Spec:** `docs/superpowers/specs/2026-04-07-altar-shop-redesign.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/config.ts` | Modify | Add `levelScaling` to SkillDefinition, add `ALTAR_REROLL_COST` |
| `src/systems/SkillManager.ts` | Modify | Add `level` to SkillSlot, `upgradeSkill()`, `replaceSkill()`, level-aware damage/params, updated export/import |
| `src/entities/Altar.ts` | Modify | Replace CONSUMED with COOLDOWN, add `skillOffered` flag |
| `src/ui/UpgradePanel.ts` | Rewrite | Two-phase controller: skill pick → shop grid, session lifecycle |
| `src/scenes/UIScene.ts` | Modify | Pass altar ref + skillManager to UpgradePanel, update event wiring |
| `src/scenes/GameScene.ts` | Modify | Replace `altar-consumed` with `altar-session-closed` |
| `src/debug/DebugManager.ts` | Modify | Add `resetSkillOffered()`, `openShop()`, `setSkillLevel()` |

---

### Task 1: Config — Skill Level Scaling + Reroll Cost

**Files:**
- Modify: `src/config.ts:46-49` (GAME_CONFIG altar section)
- Modify: `src/config.ts:210-225` (SkillDefinition interface)
- Modify: `src/config.ts:227-262` (SKILL_DEFS)

- [ ] **Step 1: Add `ALTAR_REROLL_COST` to GAME_CONFIG**

In `src/config.ts`, add after line 49 (`ALTAR_SIZE: 48,`):

```typescript
  ALTAR_REROLL_COST: 20,
  SKILL_MAX_LEVEL: 3,
```

- [ ] **Step 2: Add `levelScaling` to SkillDefinition interface**

In `src/config.ts`, replace the `SkillDefinition` interface (lines 210-225):

```typescript
export interface SkillLevelData {
  damageMultiplier: number;
  radius?: number;
  dashDistance?: number;
  pierceCount?: number;
}

export interface SkillDefinition {
  type: string;
  name: string;
  description: string;
  mpCost: number;
  cooldownMs: number;
  castDurationMs: number;
  damageMultiplier: number;
  radius?: number;
  dashDistance?: number;
  dashDurationMs?: number;
  dashPathWidth?: number;
  projectileSpeed?: number;
  projectileRange?: number;
  pierceCount?: number;
  levelScaling: SkillLevelData[];  // index 0 = Lv1, index 1 = Lv2, index 2 = Lv3
}
```

- [ ] **Step 3: Add `levelScaling` arrays to each skill in SKILL_DEFS**

Update each skill definition to include `levelScaling`:

```typescript
export const SKILL_DEFS: Record<string, SkillDefinition> = {
  whirlwind: {
    type: 'whirlwind',
    name: 'Whirlwind',
    description: 'AOE slash hitting all nearby enemies',
    mpCost: 25,
    cooldownMs: 4000,
    castDurationMs: 300,
    damageMultiplier: 1.5,
    radius: 100,
    levelScaling: [
      { damageMultiplier: 1.5, radius: 100 },
      { damageMultiplier: 1.8, radius: 110 },
      { damageMultiplier: 2.1, radius: 120 },
    ],
  },
  'shadow-dash': {
    type: 'shadow-dash',
    name: 'Shadow Dash',
    description: 'Dash forward, damaging enemies in path',
    mpCost: 20,
    cooldownMs: 3000,
    castDurationMs: 200,
    damageMultiplier: 0.8,
    dashDistance: 150,
    dashDurationMs: 200,
    dashPathWidth: 32,
    levelScaling: [
      { damageMultiplier: 0.8, dashDistance: 150 },
      { damageMultiplier: 1.0, dashDistance: 170 },
      { damageMultiplier: 1.2, dashDistance: 190 },
    ],
  },
  'arcane-bolt': {
    type: 'arcane-bolt',
    name: 'Arcane Bolt',
    description: 'Fires a piercing magical projectile',
    mpCost: 30,
    cooldownMs: 5000,
    castDurationMs: 100,
    damageMultiplier: 2.0,
    projectileSpeed: 350,
    projectileRange: 300,
    pierceCount: 2,
    levelScaling: [
      { damageMultiplier: 2.0, pierceCount: 2 },
      { damageMultiplier: 2.4, pierceCount: 3 },
      { damageMultiplier: 2.8, pierceCount: 4 },
    ],
  },
};
```

- [ ] **Step 4: Build check**

Run: `npx tsc --noEmit`
Expected: Type errors in SkillManager.ts (hasn't been updated yet) — that's fine, note them and move on.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts
git commit -m "feat(config): add skill level scaling and altar reroll cost"
```

---

### Task 2: SkillManager — Skill Levels, Upgrade, Replace

**Files:**
- Modify: `src/systems/SkillManager.ts`

- [ ] **Step 1: Add `level` to SkillSlot interface**

In `src/systems/SkillManager.ts`, update the `SkillSlot` interface (line 10-14):

```typescript
interface SkillSlot {
  type: string | null;
  state: SkillSlotState;
  cooldownRemaining: number;
  level: number;  // 1-3, default 1 when learned
}
```

- [ ] **Step 2: Update constructor to initialize level**

Update the constructor slots (lines 22-25):

```typescript
    this.slots = [
      { type: null, state: 'EMPTY', cooldownRemaining: 0, level: 0 },
      { type: null, state: 'EMPTY', cooldownRemaining: 0, level: 0 },
    ];
```

- [ ] **Step 3: Update `addSkill` to set level = 1**

In `addSkill` method (line 39-40), after `slot.type = type;` and `slot.state = 'READY';`, add:

```typescript
        slot.level = 1;
```

- [ ] **Step 4: Add `upgradeSkill` method**

Add after `hasSkill` method (~line 51):

```typescript
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
```

- [ ] **Step 5: Add `replaceSkill` method**

Add after `upgradeSkill`:

```typescript
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
```

- [ ] **Step 6: Update `removeAllSkills` to reset level**

In `removeAllSkills` (line 99-106), add `slot.level = 0;` inside the loop:

```typescript
  removeAllSkills(): void {
    for (const slot of this.slots) {
      slot.type = null;
      slot.state = 'EMPTY';
      slot.cooldownRemaining = 0;
      slot.level = 0;
    }
    EventBus.emit('skill-state-changed');
  }
```

- [ ] **Step 7: Update `calcSkillDamage` for level scaling**

Replace `calcSkillDamage` method (line 232-235):

```typescript
  private calcSkillDamage(def: SkillDefinition, level: number): number {
    const min = this.scene.statsManager.getStat('attackMin');
    const max = this.scene.statsManager.getStat('attackMax');
    const scaling = def.levelScaling[level - 1] ?? def.levelScaling[0];
    return Math.floor(Phaser.Math.Between(min, max) * scaling.damageMultiplier);
  }
```

- [ ] **Step 8: Update `executeSkill` to pass level**

In `executeSkill` (line 216-229), get the slot level and pass it:

```typescript
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
      case 'arcane-bolt':
        this.executeArcaneBolt(def, scaling);
        break;
      default:
        console.warn(`[SkillManager] Unknown skill: ${type}`);
    }
  }
```

- [ ] **Step 9: Update `executeWhirlwind` to use scaling**

Change signature and use scaling radius + damage:

```typescript
  private executeWhirlwind(def: SkillDefinition, scaling: SkillLevelData): void {
    const player = this.scene.player;
    const radius = scaling.radius ?? def.radius ?? 100;
    // ... rest of method unchanged, except:
    // Replace: const dmg = this.calcSkillDamage(def);
    // With:
    const level = this.getSkillLevel(def.type);
    // ... inside the enemy loop:
        const dmg = this.calcSkillDamage(def, level);
```

Full replacement of the damage line and radius line only. The visual and enemy loop logic stay the same but use `radius` from `scaling`.

- [ ] **Step 10: Update `executeShadowDash` to use scaling**

Change signature and use scaling dashDistance:

```typescript
  private executeShadowDash(def: SkillDefinition, scaling: SkillLevelData): void {
    const player = this.scene.player;
    const distance = scaling.dashDistance ?? def.dashDistance ?? 150;
    // ... rest unchanged, except calcSkillDamage calls use level
```

- [ ] **Step 11: Update `executeArcaneBolt` to use scaling**

Change signature and use scaling pierceCount:

```typescript
  private executeArcaneBolt(def: SkillDefinition, scaling: SkillLevelData): void {
    // ...
    const maxHits = (scaling.pierceCount ?? def.pierceCount ?? 2) + 1;
    // ... rest unchanged, except calcSkillDamage calls use level
```

- [ ] **Step 12: Update all `calcSkillDamage` call sites**

Search for `this.calcSkillDamage(def)` — replace with `this.calcSkillDamage(def, level)` where `level = this.getSkillLevel(def.type)`. There are 3 call sites:
- `executeWhirlwind` (line ~279)
- `checkDashPathDamage` (line ~460) — this method needs `level` passed in or obtained internally
- `executeArcaneBolt` (line ~534)

For `checkDashPathDamage`, add a `level` parameter:

```typescript
  private checkDashPathDamage(
    startX: number, startY: number,
    currentX: number, currentY: number,
    pathWidth: number,
    def: SkillDefinition,
    hitEnemies: Set<Enemy>,
    level: number,
  ): void {
    // ... inside:
        const dmg = this.calcSkillDamage(def, level);
```

Update the call site in `executeShadowDash` to pass `this.getSkillLevel(def.type)`.

- [ ] **Step 13: Update `exportState` / `importState` for backward compatibility**

Replace `exportState` and `importState`:

```typescript
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
      // Backward compat: old format is string[], new format is {type, level}[]
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
```

- [ ] **Step 14: Add import for SkillLevelData and GAME_CONFIG**

At top of file, update imports:

```typescript
import { SKILL_DEFS, GAME_CONFIG } from '../config';
import type { SkillDefinition, SkillLevelData } from '../config';
```

- [ ] **Step 15: Build check**

Run: `npx tsc --noEmit`
Expected: PASS (or only errors in UpgradePanel.ts which is being rewritten)

- [ ] **Step 16: Commit**

```bash
git add src/systems/SkillManager.ts
git commit -m "feat(skill): add skill levels, upgrade, replace, level-scaled damage"
```

---

### Task 3: Altar — COOLDOWN State + skillOffered Flag

**Files:**
- Modify: `src/entities/Altar.ts`

- [ ] **Step 1: Update AltarState type and add skillOffered**

Replace line 6 and add field:

```typescript
type AltarState = 'IDLE' | 'IN_RANGE' | 'ARMING' | 'OPEN' | 'COOLDOWN';

export class Altar extends Phaser.GameObjects.Image {
  private altarState: AltarState = 'IDLE';
  private armTimer: number = 0;
  private promptText: Phaser.GameObjects.Text;
  private playerRef: Player;
  public skillOffered: boolean = false;
```

- [ ] **Step 2: Update the `update` method — handle COOLDOWN state**

Replace the entire `update` method:

```typescript
  update(_time: number, delta: number): void {
    const dx = this.playerRef.x - this.x;
    const dy = this.playerRef.y - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const inRange = dist < GAME_CONFIG.ALTAR_ACTIVATE_RANGE;

    const body = this.playerRef.body as Phaser.Physics.Arcade.Body;
    const velMag = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2);
    const stopped = velMag < 5;

    switch (this.altarState) {
      case 'IDLE':
        if (inRange) {
          this.altarState = 'IN_RANGE';
          this.promptText.setVisible(true);
          this.promptText.setAlpha(1);
        }
        break;

      case 'IN_RANGE':
        if (!inRange) {
          this.altarState = 'IDLE';
          this.promptText.setVisible(false);
        } else if (stopped) {
          this.altarState = 'ARMING';
          this.armTimer = 0;
        }
        break;

      case 'ARMING':
        if (!inRange || !stopped) {
          this.altarState = 'IN_RANGE';
          this.armTimer = 0;
          this.promptText.setAlpha(1);
        } else {
          this.armTimer += delta;
          this.promptText.setAlpha(0.5 + 0.5 * Math.sin(this.armTimer * 0.01));
          if (this.armTimer >= GAME_CONFIG.ALTAR_ARM_DELAY) {
            this.altarState = 'OPEN';
            this.promptText.setVisible(false);
            EventBus.emit('altar-activated', this);
          }
        }
        break;

      case 'OPEN':
        // Waiting for panel to close — do nothing
        break;

      case 'COOLDOWN':
        // Wait for player to leave range before allowing re-trigger
        if (!inRange) {
          this.altarState = 'IDLE';
        }
        break;
    }
  }
```

- [ ] **Step 3: Replace `consume()` with `endSession()`**

Remove the old `consume()` method and add:

```typescript
  endSession(): void {
    this.altarState = 'COOLDOWN';
    this.promptText.setVisible(false);
    // Do NOT dim — altar stays full alpha for reuse
  }
```

- [ ] **Step 4: Build check**

Run: `npx tsc --noEmit`
Expected: Error in GameScene.ts (`altar.consume()` no longer exists) — expected, will fix in Task 5.

- [ ] **Step 5: Commit**

```bash
git add src/entities/Altar.ts
git commit -m "feat(altar): replace CONSUMED with COOLDOWN, add skillOffered flag"
```

---

### Task 4: UpgradePanel — Full Rewrite (Two-Phase + Shop Grid)

**Files:**
- Rewrite: `src/ui/UpgradePanel.ts`

This is the largest task. The panel becomes a two-phase controller:
1. **Skill Pick Phase** — 1-3 skill cards, reroll, skip (only on first visit)
2. **Shop Phase** — 3x2 grid of all 6 stat upgrades, buy freely, X to close

- [ ] **Step 1: Write the complete new UpgradePanel**

Replace the entire contents of `src/ui/UpgradePanel.ts`:

```typescript
import Phaser from 'phaser';
import { UPGRADE_DEFS, SKILL_DEFS, GAME_CONFIG } from '../config';
import type { UpgradeDefinition, SkillDefinition } from '../config';
import type { StatsManager, StatBlock } from '../systems/StatsManager';
import type { Player } from '../entities/Player';
import type { SkillManager } from '../systems/SkillManager';
import type { Altar } from '../entities/Altar';
import EventBus from '../systems/EventBus';

type PanelPhase = 'SKILL_PICK' | 'SHOP' | 'CLOSED';

export class UpgradePanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private phase: PanelPhase = 'CLOSED';
  private statsManager!: StatsManager;
  private player!: Player;
  private skillManager!: SkillManager;
  private altar: Altar | null = null;
  private sessionActive: boolean = false;

  // Skill pick state
  private currentSkillCards: string[] = [];
  private rerollsUsed: number = 0;

  // Flash throttle
  private lastFlashTime: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(300);
    this.container.setVisible(false);
  }

  show(statsManager: StatsManager, player: Player, skillManager: SkillManager, altar: Altar): void {
    if (this.sessionActive) return;
    this.statsManager = statsManager;
    this.player = player;
    this.skillManager = skillManager;
    this.altar = altar;
    this.sessionActive = true;
    this.rerollsUsed = 0;

    // Lock input for entire session
    EventBus.emit('ui-input-lock');
    EventBus.emit('gameplay-lock', true);

    // Decide phase: skill pick first (if not yet offered), then shop
    if (!altar.skillOffered) {
      const pool = this.getEligibleSkillPool();
      if (pool.length > 0) {
        this.showSkillPick(pool);
      } else {
        // No skills available — skip to shop
        altar.skillOffered = true;
        this.showShop();
      }
    } else {
      this.showShop();
    }
  }

  // ------------------------------------------------------------------ SKILL PICK PHASE

  private getEligibleSkillPool(): string[] {
    const pool: string[] = [];
    for (const key of Object.keys(SKILL_DEFS)) {
      if (this.skillManager.hasSkill(key)) {
        // Owned — only include if level < max
        if (this.skillManager.getSkillLevel(key) < GAME_CONFIG.SKILL_MAX_LEVEL) {
          pool.push(key);
        }
      } else {
        // Not owned — always include
        pool.push(key);
      }
    }
    return pool;
  }

  private drawSkillCards(pool: string[]): string[] {
    const shuffled = [...pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(3, shuffled.length));
  }

  private showSkillPick(pool: string[]): void {
    this.phase = 'SKILL_PICK';
    this.currentSkillCards = this.drawSkillCards(pool);
    this.container.removeAll(true);

    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    // Background overlay
    const bg = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    bg.setInteractive();
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(width / 2, 80, 'Choose a Skill', {
      fontSize: '24px', color: '#cc66ff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    // Skill cards
    const cardW = 300;
    const cardH = 140;
    const gap = 16;
    const startY = 160;

    this.currentSkillCards.forEach((skillKey, i) => {
      const cy = startY + i * (cardH + gap) + cardH / 2;
      this.createSkillCard(width / 2, cy, cardW, cardH, skillKey);
    });

    // Buttons row
    const buttonY = startY + this.currentSkillCards.length * (cardH + gap) + 30;

    // Reroll button
    const rerollCost = this.rerollsUsed === 0 ? 0 : GAME_CONFIG.ALTAR_REROLL_COST;
    const canReroll = rerollCost === 0 || this.player.gold >= rerollCost;
    const rerollLabel = this.rerollsUsed === 0 ? 'Reroll (Free)' : `Reroll (${rerollCost}G)`;

    const rerollBg = this.scene.add.rectangle(width / 2 - 80, buttonY, 140, 40, 0x333333, canReroll ? 1.0 : 0.5);
    rerollBg.setStrokeStyle(1, canReroll ? 0x9933ff : 0x666666);
    if (canReroll) {
      rerollBg.setInteractive({ useHandCursor: true });
      rerollBg.on('pointerover', () => rerollBg.setFillStyle(0x555555));
      rerollBg.on('pointerout', () => rerollBg.setFillStyle(0x333333));
      rerollBg.on('pointerdown', () => {
        if (rerollCost > 0) {
          this.player.gold -= rerollCost;
          EventBus.emit('player-gold-changed', this.player.gold);
        }
        this.rerollsUsed++;
        const newPool = this.getEligibleSkillPool();
        this.showSkillPick(newPool);
      });
    }
    this.container.add(rerollBg);

    const rerollText = this.scene.add.text(width / 2 - 80, buttonY, rerollLabel, {
      fontSize: '14px', color: canReroll ? '#cc66ff' : '#666666', fontFamily: 'monospace',
    });
    rerollText.setOrigin(0.5, 0.5);
    this.container.add(rerollText);

    // Skip button
    const skipBg = this.scene.add.rectangle(width / 2 + 80, buttonY, 100, 40, 0x333333);
    skipBg.setStrokeStyle(1, 0x666666);
    skipBg.setInteractive({ useHandCursor: true });
    skipBg.on('pointerover', () => skipBg.setFillStyle(0x555555));
    skipBg.on('pointerout', () => skipBg.setFillStyle(0x333333));
    skipBg.on('pointerdown', () => {
      if (this.altar) this.altar.skillOffered = true;
      this.showShop();
    });
    this.container.add(skipBg);

    const skipText = this.scene.add.text(width / 2 + 80, buttonY, 'Skip', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    skipText.setOrigin(0.5, 0.5);
    this.container.add(skipText);

    this.container.setVisible(true);
  }

  private createSkillCard(cx: number, cy: number, w: number, h: number, skillKey: string): void {
    const def = SKILL_DEFS[skillKey];
    const isOwned = this.skillManager.hasSkill(skillKey);
    const currentLevel = this.skillManager.getSkillLevel(skillKey);

    const cardBg = this.scene.add.rectangle(cx, cy, w, h, 0x1a1a33, 1.0);
    cardBg.setStrokeStyle(2, 0x9933ff);
    cardBg.setInteractive({ useHandCursor: true });
    this.container.add(cardBg);

    // Badge
    const badgeLabel = isOwned ? `Lv.${currentLevel} -> ${currentLevel + 1}` : 'NEW';
    const badgeText = this.scene.add.text(cx + w / 2 - 12, cy - h / 2 + 8, badgeLabel, {
      fontSize: '10px', color: '#cc66ff', fontFamily: 'monospace',
    });
    badgeText.setOrigin(1, 0);
    this.container.add(badgeText);

    // Name
    const nameText = this.scene.add.text(cx - w / 2 + 20, cy - 42, def.name, {
      fontSize: '20px', color: '#cc66ff', fontFamily: 'monospace',
    });
    this.container.add(nameText);

    // Description
    const descText = this.scene.add.text(cx - w / 2 + 20, cy - 12, def.description, {
      fontSize: '13px', color: '#aaaacc', fontFamily: 'monospace',
    });
    this.container.add(descText);

    // Stats line
    const cdSec = (def.cooldownMs / 1000).toFixed(0);
    const statsLine = `MP: ${def.mpCost} | CD: ${cdSec}s`;
    const statsText = this.scene.add.text(cx - w / 2 + 20, cy + 14, statsLine, {
      fontSize: '12px', color: '#7777aa', fontFamily: 'monospace',
    });
    this.container.add(statsText);

    // FREE label
    const freeText = this.scene.add.text(cx + w / 2 - 20, cy + 40, 'FREE', {
      fontSize: '16px', color: '#cc66ff', fontFamily: 'monospace',
    });
    freeText.setOrigin(1, 0.5);
    this.container.add(freeText);

    // Click
    cardBg.on('pointerdown', () => {
      this.onSkillCardClicked(skillKey, cx, cy);
    });

    cardBg.on('pointerover', () => cardBg.setFillStyle(0x2a2a44));
    cardBg.on('pointerout', () => cardBg.setFillStyle(0x1a1a33));
  }

  private onSkillCardClicked(skillKey: string, cx: number, cy: number): void {
    const def = SKILL_DEFS[skillKey];
    const isOwned = this.skillManager.hasSkill(skillKey);

    if (isOwned) {
      // Upgrade existing skill
      this.skillManager.upgradeSkill(skillKey);
      const newLevel = this.skillManager.getSkillLevel(skillKey);
      this.showFlash(cx, cy - 60, `${def.name} -> Lv.${newLevel}!`);
      if (this.altar) this.altar.skillOffered = true;
      this.scene.time.delayedCall(400, () => this.showShop());
    } else {
      // Learn new skill
      const slotCount = this.skillManager.getSkillCount();
      if (slotCount < 2) {
        // Has empty slot
        this.skillManager.addSkill(skillKey);
        this.showFlash(cx, cy - 60, `${def.name} acquired!`);
        if (this.altar) this.altar.skillOffered = true;
        this.scene.time.delayedCall(400, () => this.showShop());
      } else {
        // Slots full — show replace modal
        this.showReplaceModal(skillKey);
      }
    }
  }

  private showReplaceModal(newSkillKey: string): void {
    this.container.removeAll(true);
    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    const bg = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.8);
    bg.setInteractive();
    this.container.add(bg);

    const title = this.scene.add.text(width / 2, 120, 'Replace which skill?', {
      fontSize: '22px', color: '#ff6666', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    // New skill info
    const newDef = SKILL_DEFS[newSkillKey];
    const newInfo = this.scene.add.text(width / 2, 160, `New: ${newDef.name}`, {
      fontSize: '16px', color: '#cc66ff', fontFamily: 'monospace',
    });
    newInfo.setOrigin(0.5, 0.5);
    this.container.add(newInfo);

    // Show two slot buttons
    for (let i = 0; i < 2; i++) {
      const slotType = this.skillManager.getSlotType(i);
      const slotLevel = this.skillManager.getSlotLevel(i);
      if (!slotType) continue;
      const slotDef = SKILL_DEFS[slotType];
      if (!slotDef) continue;

      const btnY = 240 + i * 100;
      const btnBg = this.scene.add.rectangle(width / 2, btnY, 280, 70, 0x332222);
      btnBg.setStrokeStyle(2, 0xff6666);
      btnBg.setInteractive({ useHandCursor: true });
      this.container.add(btnBg);

      const slotText = this.scene.add.text(width / 2, btnY - 12, `Slot ${i + 1}: ${slotDef.name} Lv.${slotLevel}`, {
        fontSize: '16px', color: '#ff9999', fontFamily: 'monospace',
      });
      slotText.setOrigin(0.5, 0.5);
      this.container.add(slotText);

      const replaceLabel = this.scene.add.text(width / 2, btnY + 14, 'Replace', {
        fontSize: '12px', color: '#ff6666', fontFamily: 'monospace',
      });
      replaceLabel.setOrigin(0.5, 0.5);
      this.container.add(replaceLabel);

      btnBg.on('pointerover', () => btnBg.setFillStyle(0x443333));
      btnBg.on('pointerout', () => btnBg.setFillStyle(0x332222));
      btnBg.on('pointerdown', () => {
        this.skillManager.replaceSkill(i, newSkillKey);
        this.showFlash(width / 2, btnY - 60, `${newDef.name} acquired!`);
        if (this.altar) this.altar.skillOffered = true;
        this.scene.time.delayedCall(400, () => this.showShop());
      });
    }

    // Cancel button — return to skill panel with same cards
    const cancelY = 240 + 2 * 100 + 20;
    const cancelBg = this.scene.add.rectangle(width / 2, cancelY, 120, 40, 0x333333);
    cancelBg.setStrokeStyle(1, 0x666666);
    cancelBg.setInteractive({ useHandCursor: true });
    cancelBg.on('pointerover', () => cancelBg.setFillStyle(0x555555));
    cancelBg.on('pointerout', () => cancelBg.setFillStyle(0x333333));
    cancelBg.on('pointerdown', () => {
      // Return to skill pick with same cards
      this.showSkillPickWithCards(this.currentSkillCards);
    });
    this.container.add(cancelBg);

    const cancelText = this.scene.add.text(width / 2, cancelY, 'Cancel', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    cancelText.setOrigin(0.5, 0.5);
    this.container.add(cancelText);
  }

  private showSkillPickWithCards(cards: string[]): void {
    this.currentSkillCards = cards;
    this.container.removeAll(true);

    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    const bg = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    bg.setInteractive();
    this.container.add(bg);

    const title = this.scene.add.text(width / 2, 80, 'Choose a Skill', {
      fontSize: '24px', color: '#cc66ff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    const cardW = 300;
    const cardH = 140;
    const gap = 16;
    const startY = 160;

    cards.forEach((skillKey, i) => {
      const cy = startY + i * (cardH + gap) + cardH / 2;
      this.createSkillCard(width / 2, cy, cardW, cardH, skillKey);
    });

    // Buttons
    const buttonY = startY + cards.length * (cardH + gap) + 30;

    // Reroll
    const rerollCost = this.rerollsUsed === 0 ? 0 : GAME_CONFIG.ALTAR_REROLL_COST;
    const canReroll = rerollCost === 0 || this.player.gold >= rerollCost;
    const rerollLabel = this.rerollsUsed === 0 ? 'Reroll (Free)' : `Reroll (${rerollCost}G)`;

    const rerollBg = this.scene.add.rectangle(width / 2 - 80, buttonY, 140, 40, 0x333333, canReroll ? 1.0 : 0.5);
    rerollBg.setStrokeStyle(1, canReroll ? 0x9933ff : 0x666666);
    if (canReroll) {
      rerollBg.setInteractive({ useHandCursor: true });
      rerollBg.on('pointerover', () => rerollBg.setFillStyle(0x555555));
      rerollBg.on('pointerout', () => rerollBg.setFillStyle(0x333333));
      rerollBg.on('pointerdown', () => {
        if (rerollCost > 0) {
          this.player.gold -= rerollCost;
          EventBus.emit('player-gold-changed', this.player.gold);
        }
        this.rerollsUsed++;
        const newPool = this.getEligibleSkillPool();
        this.showSkillPick(newPool);
      });
    }
    this.container.add(rerollBg);

    const rerollText = this.scene.add.text(width / 2 - 80, buttonY, rerollLabel, {
      fontSize: '14px', color: canReroll ? '#cc66ff' : '#666666', fontFamily: 'monospace',
    });
    rerollText.setOrigin(0.5, 0.5);
    this.container.add(rerollText);

    // Skip
    const skipBg = this.scene.add.rectangle(width / 2 + 80, buttonY, 100, 40, 0x333333);
    skipBg.setStrokeStyle(1, 0x666666);
    skipBg.setInteractive({ useHandCursor: true });
    skipBg.on('pointerover', () => skipBg.setFillStyle(0x555555));
    skipBg.on('pointerout', () => skipBg.setFillStyle(0x333333));
    skipBg.on('pointerdown', () => {
      if (this.altar) this.altar.skillOffered = true;
      this.showShop();
    });
    this.container.add(skipBg);

    const skipText = this.scene.add.text(width / 2 + 80, buttonY, 'Skip', {
      fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
    });
    skipText.setOrigin(0.5, 0.5);
    this.container.add(skipText);

    this.container.setVisible(true);
  }

  // ------------------------------------------------------------------ SHOP PHASE

  private showShop(): void {
    this.phase = 'SHOP';
    this.container.removeAll(true);

    const width = this.scene.cameras.main.width;
    const height = this.scene.cameras.main.height;

    // Background
    const bg = this.scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.7);
    bg.setInteractive();
    this.container.add(bg);

    // Title
    const title = this.scene.add.text(width / 2, 60, 'UPGRADES', {
      fontSize: '24px', color: '#ffcc00', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 3,
    });
    title.setOrigin(0.5, 0.5);
    this.container.add(title);

    // 3x2 Grid
    const upgradeKeys = Object.keys(UPGRADE_DEFS);
    const cols = 3;
    const cellW = 120;
    const cellH = 130;
    const gapX = 12;
    const gapY = 12;
    const gridW = cols * cellW + (cols - 1) * gapX;
    const gridStartX = (width - gridW) / 2 + cellW / 2;
    const gridStartY = 130;

    upgradeKeys.forEach((key, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const cx = gridStartX + col * (cellW + gapX);
      const cy = gridStartY + row * (cellH + gapY) + cellH / 2;
      this.createShopCell(cx, cy, cellW, cellH, key);
    });

    // Gold display
    const goldY = gridStartY + 2 * (cellH + gapY) + cellH + 30;
    const goldText = this.scene.add.text(40, goldY, `Gold: ${this.player.gold}`, {
      fontSize: '18px', color: '#ffcc00', fontFamily: 'monospace',
    });
    this.container.add(goldText);
    // Store reference to update later
    (this.container as unknown as Record<string, Phaser.GameObjects.Text>).__goldText = goldText;

    // Close (X) button
    const closeBg = this.scene.add.rectangle(width - 50, goldY, 50, 40, 0x333333);
    closeBg.setStrokeStyle(1, 0x666666);
    closeBg.setInteractive({ useHandCursor: true });
    closeBg.on('pointerover', () => closeBg.setFillStyle(0x555555));
    closeBg.on('pointerout', () => closeBg.setFillStyle(0x333333));
    closeBg.on('pointerdown', () => this.closeSession('close-button'));
    this.container.add(closeBg);

    const closeText = this.scene.add.text(width - 50, goldY, 'X', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'monospace',
    });
    closeText.setOrigin(0.5, 0.5);
    this.container.add(closeText);

    this.container.setVisible(true);
  }

  private createShopCell(cx: number, cy: number, w: number, h: number, upgradeKey: string): void {
    const def = UPGRADE_DEFS[upgradeKey];
    const level = this.statsManager.getLevel(upgradeKey);
    const isMaxed = level >= def.maxLevel;
    const cost = def.baseCost + level * def.costScale;
    const canAfford = !isMaxed && this.player.gold >= cost;

    // Colors per upgrade type (for icon placeholder)
    const iconColors: Record<string, number> = {
      attack: 0xff4444,
      armor: 0x888888,
      critDamage: 0xff8800,
      recovery: 0x44ff44,
      moveSpeed: 0x4488ff,
      maxHp: 0xff4444,
    };

    // Determine state
    let borderColor = 0x666666;
    let alpha = 0.5;
    if (isMaxed) {
      borderColor = 0x666666;
      alpha = 0.7;
    } else if (canAfford) {
      borderColor = 0xffcc00;
      alpha = 1.0;
    }

    // Cell background
    const cellBg = this.scene.add.rectangle(cx, cy, w, h, 0x222222, alpha);
    cellBg.setStrokeStyle(2, borderColor);
    this.container.add(cellBg);

    // Icon placeholder (colored circle)
    const icon = this.scene.add.graphics();
    icon.fillStyle(iconColors[upgradeKey] ?? 0xffffff, alpha);
    icon.fillCircle(cx, cy - 30, 16);
    this.container.add(icon);

    // Name
    const nameText = this.scene.add.text(cx, cy + 2, def.name.replace('+', ''), {
      fontSize: '11px', color: canAfford ? '#ffffff' : '#888888', fontFamily: 'monospace',
    });
    nameText.setOrigin(0.5, 0.5);
    this.container.add(nameText);

    // Cumulative bonus
    const totalBonus = def.effectPerLevel[0] * level;
    const bonusLabel = `+${totalBonus}`;
    const bonusText = this.scene.add.text(cx, cy + 18, bonusLabel, {
      fontSize: '10px', color: canAfford ? '#aaaaaa' : '#666666', fontFamily: 'monospace',
    });
    bonusText.setOrigin(0.5, 0.5);
    this.container.add(bonusText);

    // Cost or MAX
    const costLabel = isMaxed ? 'MAX' : `${cost}G`;
    const costColor = isMaxed ? '#888888' : (canAfford ? '#ffcc00' : '#663300');
    const costText = this.scene.add.text(cx, cy + 36, costLabel, {
      fontSize: '12px', color: costColor, fontFamily: 'monospace',
    });
    costText.setOrigin(0.5, 0.5);
    this.container.add(costText);

    // Level
    const levelLabel = `Lv.${level}/${def.maxLevel}`;
    const levelText = this.scene.add.text(cx, cy + 52, levelLabel, {
      fontSize: '9px', color: '#666666', fontFamily: 'monospace',
    });
    levelText.setOrigin(0.5, 0.5);
    this.container.add(levelText);

    // Interaction
    if (isMaxed) {
      // No interaction for maxed cells
      return;
    }

    cellBg.setInteractive({ useHandCursor: canAfford });

    if (canAfford) {
      cellBg.on('pointerover', () => cellBg.setFillStyle(0x333333));
      cellBg.on('pointerout', () => cellBg.setFillStyle(0x222222));
    }

    cellBg.on('pointerdown', () => {
      if (!canAfford) {
        this.showFlash(cx, cy - 30, 'Not enough gold');
        return;
      }
      this.purchaseUpgrade(upgradeKey);
    });
  }

  private purchaseUpgrade(upgradeKey: string): void {
    const def = UPGRADE_DEFS[upgradeKey];
    const level = this.statsManager.getLevel(upgradeKey);
    const cost = def.baseCost + level * def.costScale;

    // Deduct gold
    this.player.gold -= cost;
    EventBus.emit('player-gold-changed', this.player.gold);

    // Apply stat bonuses
    def.statKeys.forEach((key, i) => {
      this.statsManager.addBonus(key as keyof StatBlock, def.effectPerLevel[i]);
    });
    this.statsManager.incrementLevel(upgradeKey);

    // Update player maxHp live
    this.player.maxHp = this.statsManager.getStat('maxHp');

    // Max HP+ heals
    if (upgradeKey === 'maxHp') {
      this.player.hp = Math.min(this.player.hp + def.effectPerLevel[0], this.player.maxHp);
      EventBus.emit('player-hp-changed', this.player.hp, this.player.maxHp);
    }

    // Refresh shop to update all cells
    this.showShop();
  }

  // ------------------------------------------------------------------ SESSION LIFECYCLE

  private closeSession(reason: 'close-button' | 'teardown' | 'debug'): void {
    if (!this.sessionActive) return;
    this.sessionActive = false;
    this.phase = 'CLOSED';
    this.container.setVisible(false);
    this.container.removeAll(true);

    // Unlock
    EventBus.emit('ui-input-unlock');
    EventBus.emit('gameplay-lock', false);

    // Notify altar
    EventBus.emit('altar-session-closed', { altar: this.altar, reason });
    this.altar = null;
  }

  /** Called when scene is shutting down — cleanup if session is active */
  destroy(): void {
    if (this.sessionActive) {
      this.closeSession('teardown');
    }
  }

  // ------------------------------------------------------------------ UTILITIES

  private showFlash(x: number, y: number, message: string): void {
    const now = Date.now();
    if (now - this.lastFlashTime < 1000) return;
    this.lastFlashTime = now;

    const text = this.scene.add.text(x, y, message, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
    });
    text.setOrigin(0.5, 0.5);
    text.setDepth(310);

    this.scene.tweens.add({
      targets: text,
      y: y - 30,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.Out',
      onComplete: () => text.destroy(),
    });
  }
}
```

- [ ] **Step 2: Build check**

Run: `npx tsc --noEmit`
Expected: Errors in UIScene.ts and GameScene.ts (API changes) — will fix next.

- [ ] **Step 3: Commit**

```bash
git add src/ui/UpgradePanel.ts
git commit -m "feat(ui): rewrite UpgradePanel with two-phase skill pick + shop grid"
```

---

### Task 5: GameScene + UIScene — Event Wiring

**Files:**
- Modify: `src/scenes/GameScene.ts`
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Update GameScene — replace `altar-consumed` with `altar-session-closed`**

In `src/scenes/GameScene.ts`, find and replace the event listener (around line 227-229):

```typescript
// OLD:
EventBus.on('altar-consumed', () => {
  this.altar?.consume();
});

// NEW:
EventBus.on('altar-session-closed', (data: { altar: unknown; reason: string }) => {
  // Altar handles its own state transition via endSession()
  if (this.altar && data.altar === this.altar) {
    this.altar.endSession();
  }
});
```

Also update the `shutdown` cleanup (around line 305):

```typescript
// OLD:
EventBus.off('altar-consumed');

// NEW:
EventBus.off('altar-session-closed');
```

- [ ] **Step 2: Update UIScene — pass altar ref and skillManager to UpgradePanel**

In `src/scenes/UIScene.ts`, update the `altar-activated` handler (around line 30-35):

```typescript
// OLD:
EventBus.on('altar-activated', () => {
  const gameScene = this.scene.get('GameScene') as GameScene;
  if (gameScene?.statsManager && gameScene?.player) {
    this.upgradePanel.show(gameScene.statsManager, gameScene.player, gameScene.skillManager);
  }
});

// NEW:
EventBus.on('altar-activated', (altar: Altar) => {
  const gameScene = this.scene.get('GameScene') as GameScene;
  if (gameScene?.statsManager && gameScene?.player && gameScene?.skillManager) {
    this.upgradePanel.show(gameScene.statsManager, gameScene.player, gameScene.skillManager, altar);
  }
});
```

Add the import at top of UIScene.ts:

```typescript
import type { Altar } from '../entities/Altar';
```

- [ ] **Step 3: Add scene shutdown cleanup in UIScene**

In UIScene's `shutdown` method (or add one if missing), call:

```typescript
this.upgradePanel.destroy();
```

- [ ] **Step 4: Build check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/scenes/GameScene.ts src/scenes/UIScene.ts
git commit -m "feat(scenes): wire altar-session-closed event, pass altar ref to UpgradePanel"
```

---

### Task 6: DebugManager — Altar Debug Commands

**Files:**
- Modify: `src/debug/DebugManager.ts`

- [ ] **Step 1: Add altar debug methods to DebugAPI interface**

In `src/debug/DebugManager.ts`, add to the `DebugAPI` interface (before the closing `}`):

```typescript
  // Altar debug commands
  resetSkillOffered(): void;
  openShop(): void;
  setSkillLevel(type: string, level: number): void;
```

- [ ] **Step 2: Implement the debug methods in setupDebugAPI**

Add inside `window.__debug = { ... }`:

```typescript
      resetSkillOffered: () => {
        const gameScene = this.scene;
        if (gameScene.altar) {
          gameScene.altar.skillOffered = false;
          console.log('[Debug] resetSkillOffered: skill phase will trigger on next altar visit');
        } else {
          console.log('[Debug] resetSkillOffered: no altar in current floor');
        }
      },
      openShop: () => {
        const gameScene = this.scene;
        if (gameScene.altar) {
          EventBus.emit('altar-activated', gameScene.altar);
          console.log('[Debug] openShop: forcing altar activation');
        } else {
          console.log('[Debug] openShop: no altar in current floor');
        }
      },
      setSkillLevel: (type: string, level: number) => {
        const gameScene = this.scene;
        if (!gameScene.skillManager) {
          console.log('[Debug] setSkillLevel: skillManager not ready');
          return;
        }
        if (!gameScene.skillManager.hasSkill(type)) {
          console.log(`[Debug] setSkillLevel: player doesn't have skill "${type}"`);
          return;
        }
        // Set level by upgrading from current to target
        const current = gameScene.skillManager.getSkillLevel(type);
        if (level < 1 || level > GAME_CONFIG.SKILL_MAX_LEVEL) {
          console.log(`[Debug] setSkillLevel: level must be 1-${GAME_CONFIG.SKILL_MAX_LEVEL}`);
          return;
        }
        // Direct set via slot manipulation
        const slots = (gameScene.skillManager as unknown as { slots: Array<{ type: string | null; level: number }> }).slots;
        for (const slot of slots) {
          if (slot.type === type) {
            slot.level = level;
            break;
          }
        }
        EventBus.emit('skill-state-changed');
        console.log(`[Debug] setSkillLevel: ${type} -> Lv.${level}`);
      },
```

- [ ] **Step 3: Add import for GAME_CONFIG if not already imported**

Add at top of file if needed:

```typescript
import { GAME_CONFIG } from '../config';
```

- [ ] **Step 4: Verify altar is accessible from GameScene**

Check that `GameScene` exposes `altar` as public. In `src/scenes/GameScene.ts`, find the altar field declaration and ensure it's `public`:

```typescript
public altar?: Altar;
```

If it's currently `private`, change it to `public`.

- [ ] **Step 5: Build check**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/debug/DebugManager.ts src/scenes/GameScene.ts
git commit -m "feat(debug): add resetSkillOffered, openShop, setSkillLevel commands"
```

---

### Task 7: Build Verification + Joystick Fix Commit

**Files:**
- Verify: `src/` (full build)
- Stage: `index.html` (touch-action fix from earlier)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Stage and commit the joystick fix if not already committed**

Check: `git status` — if `index.html` has uncommitted changes:

```bash
git add index.html
git commit -m "fix(mobile): add touch-action:none to canvas for mobile joystick"
```

- [ ] **Step 3: Final type check**

Run: `npx tsc --noEmit`
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit any remaining fixes**

If any type errors were found and fixed:

```bash
git add -A
git commit -m "fix: resolve remaining type errors from altar shop redesign"
```

---

## Self-Review Checklist

1. **Spec coverage:** All 20 ACs mapped to tasks:
   - AC1-3 (flow): Task 3 (Altar) + Task 4 (UpgradePanel)
   - AC4-8 (shop): Task 4 (shop grid)
   - AC9-11 (cooldown): Task 3 (COOLDOWN state)
   - AC12-13 (lock/skillOffered): Task 4 (session lifecycle) + Task 3 (flag)
   - AC14 (replace cancel): Task 4 (showReplaceModal cancel)
   - AC15-16 (debug): Task 6
   - AC17 (reroll cost): Task 1 (config) + Task 4 (reroll logic)
   - AC18 (teardown): Task 4 (destroy method)
   - AC19-20 (floor reset, pool<3): Task 3 (per-instance flag) + Task 4 (pool logic)

2. **Placeholder scan:** No TBD/TODO. All code blocks are complete.

3. **Type consistency:** `SkillLevelData` defined in Task 1, used in Task 2. `endSession()` defined in Task 3, called in Task 5. `altar-session-closed` payload consistent between Task 4 (emit) and Task 5 (listen). `show()` signature updated in Task 4 and called correctly in Task 5.
