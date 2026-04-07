# Hostage Rescue & Companion Nurturing System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hostage rooms with caged companion NPCs, Warden elite guards, rescue mechanics, companion token drops, affection/portrait system with localStorage persistence, and an album panel UI.

**Architecture:** CompanionManager (new system) owns all companion state + localStorage. DungeonGenerator marks HOSTAGE rooms. LootSystem extended for token drops based on enemy element. New Hostage entity + CompanionPanel UI. All enemies get optional element field in config.

**Tech Stack:** Phaser 3, TypeScript, Arcade Physics, localStorage

---

## Task 1: Config — Companion Definitions, Enemy Elements, Warden, Token Drop Table

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add `element` field to EnemyConfig interface**

In `src/config.ts`, add optional `element` field to the `EnemyConfig` interface after `attackRange`:

```typescript
// In EnemyConfig interface, after attackRange: number;
element?: Element;
```

- [ ] **Step 2: Assign elements to existing enemy definitions**

Add `element` to each enemy in `ENEMY_DEFS`:

```typescript
spider: {
  // ... existing fields ...
  element: Element.WIND,  // web/nature theme
},
goblin: {
  // ... existing fields ...
  element: Element.FIRE,  // torch-wielding
},
bat: {
  // ... existing fields ...
  element: Element.WIND,  // air creature
},
'skeleton-swordsman': {
  // ... existing fields ...
  // no element (undead, neutral)
},
'skeleton-shieldbearer': {
  // ... existing fields ...
  element: Element.THUNDER, // metal armor conducts
},
'skeleton-summoner': {
  // ... existing fields ...
  element: Element.WATER, // dark magic
},
```

- [ ] **Step 3: Add `isElite` flag to EnemyConfig**

```typescript
// In EnemyConfig interface, after spawnWeight: number;
isElite?: boolean;
```

- [ ] **Step 4: Add Warden enemy definition**

After `'skeleton-summoner'` in `ENEMY_DEFS`, add:

```typescript
warden: {
  type: 'warden',
  textureKey: 'enemy-warden',
  size: 48,
  hp: 100,       // base; will be multiplied by floorHpScale * 2
  speed: 80,
  attack: 15,    // base; will be multiplied by floorAtkScale * 1.5
  attackCooldown: 1200,
  attackRange: 40,
  aiType: 'chase',
  unlockFloor: 1,
  spawnWeight: 0,  // never in normal spawn table
  isElite: true,
},
```

- [ ] **Step 5: Add companion and token definitions**

After the equipment constants at the bottom of `config.ts`, add:

```typescript
// ---- Companion System ----

export interface CompanionDef {
  id: string;
  name: string;
  element: Element | null;  // null = Luna (non-elemental)
  themeColor: number;
  tokenName: string;
}

export const COMPANION_DEFS: CompanionDef[] = [
  { id: 'ember', name: 'Ember', element: Element.FIRE,    themeColor: 0xFF6B35, tokenName: 'Flameheart Stone' },
  { id: 'coral', name: 'Coral', element: Element.WATER,   themeColor: 0x4ECDC4, tokenName: 'Tidal Pearl' },
  { id: 'volt',  name: 'Volt',  element: Element.THUNDER, themeColor: 0xFFE66D, tokenName: 'Thundershard' },
  { id: 'flora', name: 'Flora', element: Element.WIND,    themeColor: 0x95E06C, tokenName: 'Verdant Seed' },
  { id: 'luna',  name: 'Luna',  element: null,            themeColor: 0xB388FF, tokenName: 'Moonshade Crystal' },
];

export const COMPANION_CONFIG = {
  RESCUE_AFFECTION_FIRST: 30,
  RESCUE_AFFECTION_REPEAT: 15,
  TOKEN_AFFECTION: 25,
  GOLD_AFFECTION_PER_100: 5,
  MATERIAL_AFFECTION: 5,
  AFFECTION_CAP: 600,
  STAGE_THRESHOLDS: [100, 300, 600] as const,
  STAGE_FLOOR_GATES: [0, 3, 5] as const,  // stage index: min highestFloor
  INTERACTION_RANGE: 64,
  RESCUE_DURATION_MS: 1200,
  WARDEN_HP_MULT: 2,
  WARDEN_ATK_MULT: 1.5,
} as const;

export interface TokenDropCondition {
  companionId: string;
  check: 'element' | 'any' | 'elite' | 'floor-any' | 'floor-elite';
  element?: Element;
  minFloor?: number;
  dropRate: number;
}

export const TOKEN_DROP_TABLE: TokenDropCondition[] = [
  // Ember: fire element enemies 15%
  { companionId: 'ember', check: 'element', element: Element.FIRE, dropRate: 0.15 },
  // Coral: water element enemies 15%
  { companionId: 'coral', check: 'element', element: Element.WATER, dropRate: 0.15 },
  // Volt: thunder element enemies 15%, wardens (elite) 10%
  { companionId: 'volt', check: 'element', element: Element.THUNDER, dropRate: 0.15 },
  { companionId: 'volt', check: 'elite', dropRate: 0.10 },
  // Flora: wind element enemies 15%, any enemy 3%
  { companionId: 'flora', check: 'element', element: Element.WIND, dropRate: 0.15 },
  { companionId: 'flora', check: 'any', dropRate: 0.03 },
  // Luna: any enemy floor 8+ at 5%, elite floor 8+ at 15%
  { companionId: 'luna', check: 'floor-any', minFloor: 8, dropRate: 0.05 },
  { companionId: 'luna', check: 'floor-elite', minFloor: 8, dropRate: 0.15 },
];
```

- [ ] **Step 6: Run type check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: PASS (no errors)

- [ ] **Step 7: Commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add src/config.ts
git commit -m "feat(companion): add companion defs, enemy elements, warden, token drop table"
```

---

## Task 2: CompanionManager — State Management + localStorage + Floor Assignment

**Files:**
- Create: `src/systems/CompanionManager.ts`

- [ ] **Step 1: Create CompanionManager**

```typescript
import { COMPANION_DEFS, COMPANION_CONFIG, TOKEN_DROP_TABLE } from '../config';
import type { CompanionDef } from '../config';
import EventBus from './EventBus';

interface CompanionState {
  unlocked: boolean;
  affection: number;
  tokens: number;
}

interface CompanionSaveData {
  version: 1;
  companions: Record<string, CompanionState>;
}

const STORAGE_KEY = 'darkdungeon_companions';

export class CompanionManager {
  private state: Record<string, CompanionState> = {};
  private floorAssignment: Map<number, string> = new Map();
  private highestFloorRef: () => number;

  constructor(highestFloorGetter: () => number) {
    this.highestFloorRef = highestFloorGetter;
    this.load();
  }

  // --- Persistence ---

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data: CompanionSaveData = JSON.parse(raw);
        if (data.version === 1 && data.companions) {
          this.state = data.companions;
        }
      }
    } catch {
      console.warn('[CompanionManager] Failed to load save data');
    }
    // Ensure all companions exist in state
    for (const def of COMPANION_DEFS) {
      if (!this.state[def.id]) {
        this.state[def.id] = { unlocked: false, affection: 0, tokens: 0 };
      }
    }
  }

  private save(): void {
    const data: CompanionSaveData = {
      version: 1,
      companions: this.state,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      console.warn('[CompanionManager] Failed to save');
    }
  }

  // --- Floor Assignment ---

  assignFloors(): void {
    this.floorAssignment.clear();
    // Shuffle companion IDs for floors 1-5
    const ids = COMPANION_DEFS.map(d => d.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    for (let floor = 1; floor <= 5; floor++) {
      this.floorAssignment.set(floor, ids[floor - 1]);
    }
  }

  getCompanionForFloor(floor: number): string {
    if (this.floorAssignment.has(floor)) {
      return this.floorAssignment.get(floor)!;
    }
    // Floor 6+: random
    const idx = Math.floor(Math.random() * COMPANION_DEFS.length);
    const id = COMPANION_DEFS[idx].id;
    this.floorAssignment.set(floor, id);
    return id;
  }

  exportFloorAssignment(): Record<number, string> {
    const result: Record<number, string> = {};
    for (const [floor, id] of this.floorAssignment) {
      result[floor] = id;
    }
    return result;
  }

  importFloorAssignment(data: Record<number, string>): void {
    this.floorAssignment.clear();
    for (const [floor, id] of Object.entries(data)) {
      this.floorAssignment.set(Number(floor), id);
    }
  }

  // --- Rescue ---

  rescue(companionId: string): void {
    const cs = this.state[companionId];
    if (!cs) return;

    const isFirst = !cs.unlocked;
    if (isFirst) {
      cs.unlocked = true;
      const amount = COMPANION_CONFIG.RESCUE_AFFECTION_FIRST;
      cs.affection = Math.min(cs.affection + amount, COMPANION_CONFIG.AFFECTION_CAP);
      EventBus.emit('companion-unlocked', { companionId });
    } else {
      const amount = COMPANION_CONFIG.RESCUE_AFFECTION_REPEAT;
      cs.affection = Math.min(cs.affection + amount, COMPANION_CONFIG.AFFECTION_CAP);
    }
    this.save();
    EventBus.emit('companion-rescued', { companionId, isFirst });
    this.checkStageUnlock(companionId);
    EventBus.emit('companion-affection-changed', {
      companionId,
      newValue: cs.affection,
      delta: isFirst ? COMPANION_CONFIG.RESCUE_AFFECTION_FIRST : COMPANION_CONFIG.RESCUE_AFFECTION_REPEAT,
    });
  }

  // --- Gifting ---

  gift(companionId: string, type: 'token' | 'gold' | 'material', amount: number): { affectionGained: number; resourceCost: number } {
    const cs = this.state[companionId];
    if (!cs || !cs.unlocked) return { affectionGained: 0, resourceCost: 0 };
    if (cs.affection >= COMPANION_CONFIG.AFFECTION_CAP) return { affectionGained: 0, resourceCost: 0 };

    let affectionPerUnit = 0;
    let actualAmount = amount;

    switch (type) {
      case 'token':
        affectionPerUnit = COMPANION_CONFIG.TOKEN_AFFECTION;
        actualAmount = Math.min(amount, cs.tokens);
        cs.tokens -= actualAmount;
        break;
      case 'gold':
        affectionPerUnit = COMPANION_CONFIG.GOLD_AFFECTION_PER_100;
        // amount = units of 100g
        break;
      case 'material':
        affectionPerUnit = COMPANION_CONFIG.MATERIAL_AFFECTION;
        break;
    }

    const maxGain = COMPANION_CONFIG.AFFECTION_CAP - cs.affection;
    const totalGain = Math.min(actualAmount * affectionPerUnit, maxGain);
    cs.affection += totalGain;
    this.save();

    EventBus.emit('companion-affection-changed', {
      companionId,
      newValue: cs.affection,
      delta: totalGain,
    });
    this.checkStageUnlock(companionId);

    return { affectionGained: totalGain, resourceCost: type === 'token' ? actualAmount : amount };
  }

  // --- Tokens ---

  addTokens(companionId: string, count: number): void {
    const cs = this.state[companionId];
    if (!cs) return;
    cs.tokens += count;
    this.save();
    EventBus.emit('companion-token-collected', { companionId, amount: count });
  }

  // --- Queries ---

  getCompanion(id: string): CompanionState & { def: CompanionDef } {
    const cs = this.state[id] ?? { unlocked: false, affection: 0, tokens: 0 };
    const def = COMPANION_DEFS.find(d => d.id === id)!;
    return { ...cs, def };
  }

  getAllCompanions(): Array<CompanionState & { def: CompanionDef }> {
    return COMPANION_DEFS.map(def => ({
      ...this.state[def.id],
      def,
    }));
  }

  getCurrentStage(companionId: string): number {
    const cs = this.state[companionId];
    if (!cs) return 0;
    const highestFloor = this.highestFloorRef();
    let stage = 0;
    for (let i = 0; i < COMPANION_CONFIG.STAGE_THRESHOLDS.length; i++) {
      if (cs.affection >= COMPANION_CONFIG.STAGE_THRESHOLDS[i] && highestFloor >= COMPANION_CONFIG.STAGE_FLOOR_GATES[i]) {
        stage = i + 1;
      }
    }
    return stage;
  }

  private checkStageUnlock(companionId: string): void {
    const cs = this.state[companionId];
    if (!cs) return;
    const highestFloor = this.highestFloorRef();
    for (let i = 0; i < COMPANION_CONFIG.STAGE_THRESHOLDS.length; i++) {
      if (cs.affection >= COMPANION_CONFIG.STAGE_THRESHOLDS[i] && highestFloor >= COMPANION_CONFIG.STAGE_FLOOR_GATES[i]) {
        // Emit only if this is a new unlock (stage i+1)
        // Simple approach: always emit, UI can deduplicate
        EventBus.emit('companion-stage-unlocked', { companionId, stage: i + 1 });
      }
    }
  }

  // --- Debug ---

  debugUnlock(id: string): void {
    const cs = this.state[id];
    if (cs) { cs.unlocked = true; this.save(); }
  }

  debugSetAffection(id: string, value: number): void {
    const cs = this.state[id];
    if (cs) { cs.affection = Math.min(value, COMPANION_CONFIG.AFFECTION_CAP); this.save(); }
  }

  debugGiveTokens(id: string, count: number): void {
    const cs = this.state[id];
    if (cs) { cs.tokens += count; this.save(); }
  }

  debugUnlockAll(): void {
    for (const def of COMPANION_DEFS) {
      this.state[def.id] = { unlocked: true, affection: COMPANION_CONFIG.AFFECTION_CAP, tokens: 0 };
    }
    this.save();
  }

  destroy(): void {
    // No EventBus listeners to clean up (manager only emits)
  }
}
```

- [ ] **Step 2: Run type check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add src/systems/CompanionManager.ts
git commit -m "feat(companion): add CompanionManager with state, persistence, floor assignment"
```

---

## Task 3: Hostage Entity

**Files:**
- Create: `src/entities/Hostage.ts`

- [ ] **Step 1: Create Hostage entity**

```typescript
import Phaser from 'phaser';
import { COMPANION_DEFS, COMPANION_CONFIG } from '../config';

export const HostageState = {
  CAGED: 'CAGED',
  RESCUED: 'RESCUED',
  FREED: 'FREED',
} as const;

export type HostageState = typeof HostageState[keyof typeof HostageState];

export class Hostage extends Phaser.GameObjects.Container {
  public companionId: string;
  public hostageState: HostageState = HostageState.CAGED;

  private cage: Phaser.GameObjects.Graphics;
  private npc: Phaser.GameObjects.Graphics;
  private themeColor: number;

  constructor(scene: Phaser.Scene, x: number, y: number, companionId: string) {
    super(scene, x, y);
    this.companionId = companionId;

    const def = COMPANION_DEFS.find(d => d.id === companionId);
    this.themeColor = def?.themeColor ?? 0xff00ff;

    // Cage: grey grid lines
    this.cage = scene.add.graphics();
    this.cage.lineStyle(2, 0x888888);
    // Vertical bars
    for (let bx = -20; bx <= 20; bx += 10) {
      this.cage.moveTo(bx, -24);
      this.cage.lineTo(bx, 24);
    }
    // Top and bottom bars
    this.cage.moveTo(-24, -24);
    this.cage.lineTo(24, -24);
    this.cage.moveTo(-24, 24);
    this.cage.lineTo(24, 24);
    this.cage.strokePath();
    this.add(this.cage);

    // NPC: colored circle
    this.npc = scene.add.graphics();
    this.npc.fillStyle(this.themeColor);
    this.npc.fillCircle(0, 0, 12);
    this.add(this.npc);

    scene.add.existing(this);
  }

  isInRange(playerX: number, playerY: number): boolean {
    const dx = playerX - this.x;
    const dy = playerY - this.y;
    return Math.sqrt(dx * dx + dy * dy) < COMPANION_CONFIG.INTERACTION_RANGE;
  }

  startRescue(onComplete: () => void): void {
    if (this.hostageState !== HostageState.CAGED) return;
    this.hostageState = HostageState.RESCUED;

    // Cage break animation: scale down + fade
    this.scene.tweens.add({
      targets: this.cage,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: COMPANION_CONFIG.RESCUE_DURATION_MS * 0.6,
      ease: 'Power2',
    });

    // After rescue duration, transition to FREED
    this.scene.time.delayedCall(COMPANION_CONFIG.RESCUE_DURATION_MS, () => {
      this.hostageState = HostageState.FREED;

      // Heart + text
      const heart = this.scene.add.text(this.x, this.y - 30, '♥', {
        fontSize: '24px',
        color: `#${this.themeColor.toString(16).padStart(6, '0')}`,
      });
      heart.setOrigin(0.5, 0.5);
      this.scene.tweens.add({
        targets: heart,
        y: heart.y - 20,
        alpha: 0,
        duration: 1500,
        onComplete: () => heart.destroy(),
      });

      onComplete();

      // Fade out NPC
      this.scene.tweens.add({
        targets: this.npc,
        alpha: 0,
        duration: 2000,
        onComplete: () => {
          this.destroy();
        },
      });
    });
  }
}
```

- [ ] **Step 2: Run type check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add src/entities/Hostage.ts
git commit -m "feat(companion): add Hostage entity with cage visual and rescue animation"
```

---

## Task 4: DungeonGenerator — HOSTAGE Room Allocation

**Files:**
- Modify: `src/systems/DungeonGenerator.ts`

- [ ] **Step 1: Update DungeonData to include hostage info**

At the top of `DungeonGenerator.ts`, update the `DungeonData` interface:

```typescript
export interface HostageRoomData {
  roomIndex: number;
  companionId: string;
}

export interface DungeonData {
  grid: number[][];
  rooms: Room[];
  hazards: HazardData[];
  hostageRoom: HostageRoomData | null;
}
```

- [ ] **Step 2: Add hostage room assignment function**

After the `assignAltarRoom` function, add:

```typescript
function assignHostageRoom(rooms: Room[], companionId: string): HostageRoomData | null {
  // Pick a non-spawn, non-altar room
  const candidates = rooms
    .map((r, i) => ({ room: r, index: i }))
    .filter(({ room, index }) => index > 0 && room.state !== RoomState.ALTAR);

  if (candidates.length === 0) return null;

  const pick = candidates[Math.floor(Math.random() * candidates.length)];
  console.log(`[DungeonGenerator] Hostage room assigned: room ${pick.index} (companion: ${companionId})`);
  return { roomIndex: pick.index, companionId };
}
```

- [ ] **Step 3: Update GenerateOptions and generate() function**

Add `companionId` to `GenerateOptions`:

```typescript
export interface GenerateOptions {
  roomCount?: { min: number; max: number };
  roomSize?: { min: number; max: number };
  companionId?: string;  // which companion for this floor's hostage room
}
```

In the `generate()` function, after `assignAltarRoom(result.rooms);` and before hazards, add:

```typescript
const hostageRoom = options?.companionId
  ? assignHostageRoom(result.rooms, options.companionId)
  : null;
```

Update the return statement to include `hostageRoom`:

```typescript
return { ...result, hazards, hostageRoom };
```

Also update the fallback return at the bottom:

```typescript
return { grid, rooms: [fallbackRoom], hazards: [], hostageRoom: null };
```

- [ ] **Step 4: Run type check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: May have errors in GameScene.ts due to new DungeonData shape — that's expected, will be fixed in Task 6.

- [ ] **Step 5: Commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add src/systems/DungeonGenerator.ts
git commit -m "feat(companion): add HOSTAGE room allocation to DungeonGenerator"
```

---

## Task 5: LootSystem — Token Drop Logic

**Files:**
- Modify: `src/entities/Loot.ts`
- Modify: `src/systems/LootSystem.ts`

- [ ] **Step 1: Add `companionToken` to LootType**

In `src/entities/Loot.ts`, add to the `LootType` object:

```typescript
export const LootType = {
  gold: 'gold',
  wood: 'wood',
  ore: 'ore',
  cloth: 'cloth',
  healthOrb: 'healthOrb',
  equipment: 'equipment',
  companionToken: 'companionToken',
} as const;
```

Add to `TEXTURE_MAP`:

```typescript
companionToken: 'loot-token',
```

- [ ] **Step 2: Add `companionId` to Loot entity**

In the `Loot` class, add a public field:

```typescript
public companionId?: string;
```

- [ ] **Step 3: Add token drop logic to LootSystem**

In `src/systems/LootSystem.ts`, add imports:

```typescript
import { TOKEN_DROP_TABLE, COMPANION_DEFS } from '../config';
import type { CompanionManager } from './CompanionManager';
```

Add `companionManager` to the constructor:

```typescript
private companionManager?: CompanionManager;

constructor(scene: Phaser.Scene, player: Player, lootGroup: Phaser.GameObjects.Group, equipmentManager?: EquipmentManager, companionManager?: CompanionManager) {
  // ... existing code ...
  this.companionManager = companionManager;
}
```

Add token drop method after `onEnemyKilled`:

```typescript
private rollTokenDrops(enemy: Enemy, baseX: number, baseY: number): void {
  if (!this.companionManager) return;

  const floor = (this.scene as unknown as { floorManager?: { currentFloor: number } }).floorManager?.currentFloor ?? 1;
  const enemyElement = (enemy as unknown as { config?: { element?: string; isElite?: boolean } }).config?.element ?? null;
  const isElite = (enemy as unknown as { config?: { isElite?: boolean } }).config?.isElite ?? false;

  for (const cond of TOKEN_DROP_TABLE) {
    let matches = false;

    switch (cond.check) {
      case 'element':
        matches = enemyElement === cond.element;
        break;
      case 'any':
        matches = true;
        break;
      case 'elite':
        matches = isElite;
        break;
      case 'floor-any':
        matches = floor >= (cond.minFloor ?? 0);
        break;
      case 'floor-elite':
        matches = isElite && floor >= (cond.minFloor ?? 0);
        break;
    }

    if (matches && Math.random() < cond.dropRate) {
      const ox = Phaser.Math.Between(-10, 10);
      const oy = Phaser.Math.Between(-10, 10);
      const def = COMPANION_DEFS.find(d => d.id === cond.companionId);
      if (!def) continue;

      const loot = this.spawnLoot(baseX + ox, baseY + oy, LootType.companionToken, 1);
      loot.companionId = cond.companionId;
      loot.setTint(def.themeColor);
      EventBus.emit('companion-token-dropped', { companionId: cond.companionId, tokenType: def.tokenName });
    }
  }
}
```

Call `this.rollTokenDrops(enemy, baseX, baseY);` at the end of `onEnemyKilled`.

- [ ] **Step 4: Handle token collection in collectLoot**

Add a case in the `collectLoot` switch:

```typescript
case LootType.companionToken:
  if (loot.companionId && this.companionManager) {
    this.companionManager.addTokens(loot.companionId, loot.value);
  }
  break;
```

- [ ] **Step 5: Handle token loot in update() — use magnet pickup (same as gold)**

In `update()`, the existing logic already handles non-equipment loot with magnet. The `companionToken` type will go through the magnet path since it's not `LootType.equipment`. No change needed here.

- [ ] **Step 6: Run type check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: May have errors due to constructor change in LootSystem — will be fixed in Task 6.

- [ ] **Step 7: Commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add src/entities/Loot.ts src/systems/LootSystem.ts
git commit -m "feat(companion): add token drop logic to LootSystem"
```

---

## Task 6: GameScene Integration — CompanionManager, Hostage Spawning, Rescue Flow

**Files:**
- Modify: `src/scenes/GameScene.ts`

- [ ] **Step 1: Add imports and fields**

Add imports at top:

```typescript
import { CompanionManager } from '../systems/CompanionManager';
import { Hostage, HostageState } from '../entities/Hostage';
import { COMPANION_CONFIG, ENEMY_DEFS } from '../config';
import type { HostageRoomData } from '../systems/DungeonGenerator';
```

Add fields to `GameScene` class:

```typescript
public companionManager!: CompanionManager;
private hostage?: Hostage;
private hostageRoomData: HostageRoomData | null = null;
private hostageWardenCount: number = 0;
private rescueButtonVisible: boolean = false;
```

- [ ] **Step 2: Add companion floor assignment to RunState**

In the `RunState` interface, add:

```typescript
companionFloorAssignment?: Record<number, string>;
```

- [ ] **Step 3: Initialize CompanionManager in create()**

In `create()`, after `this.floorManager = new FloorManager(...)`:

```typescript
this.companionManager = new CompanionManager(() => this.floorManager.highestFloor);
if (this.runState?.companionFloorAssignment) {
  this.companionManager.importFloorAssignment(this.runState.companionFloorAssignment);
} else {
  this.companionManager.assignFloors();
}
```

- [ ] **Step 4: Pass companionId to generate() and companionManager to LootSystem**

Update the `generate()` call:

```typescript
const companionId = this.companionManager.getCompanionForFloor(this.floorManager.currentFloor);
const { grid, rooms, hazards, hostageRoom } = generate({
  roomCount: floorConfig.roomCount,
  roomSize: floorConfig.roomSize,
  companionId,
});
this.hostageRoomData = hostageRoom;
```

Update LootSystem constructor:

```typescript
this.lootSystem = new LootSystem(this, this.player, this.lootGroup, this.equipmentManager, this.companionManager);
```

- [ ] **Step 5: Skip regular enemy spawning for hostage room**

In `spawnEnemiesInRoom`, add a guard after the ALTAR check:

```typescript
if (this.hostageRoomData && roomIndex === this.hostageRoomData.roomIndex) return;
```

- [ ] **Step 6: Spawn hostage and wardens on room enter**

In `detectPlayerRoom()`, inside the `if (room.state === RoomState.UNVISITED)` block, after `this.spawnEnemiesInRoom(...)`, add:

```typescript
// Check if this is the hostage room
if (this.hostageRoomData && i === this.hostageRoomData.roomIndex) {
  this.spawnHostageRoom(i, this.hostageRoomData.companionId, fc);
}
```

Add the spawn method:

```typescript
private spawnHostageRoom(roomIndex: number, companionId: string, floorConfig: import('../systems/FloorManager').FloorConfig): void {
  const room = this.rooms[roomIndex];
  const tileSize = GAME_CONFIG.TILE_SIZE;
  const cx = room.centerX * tileSize + tileSize / 2;
  const cy = room.centerY * tileSize + tileSize / 2;

  // Spawn hostage at room center
  this.hostage = new Hostage(this, cx, cy, companionId);

  // Spawn wardens
  const wardenCount = this.floorManager.currentFloor >= 4 ? 2 : 1;
  this.hostageWardenCount = wardenCount;
  const wardenDef = ENEMY_DEFS['warden'];

  for (let w = 0; w < wardenCount; w++) {
    const angle = (w / wardenCount) * Math.PI * 2;
    const dist = 80;
    const wx = cx + Math.cos(angle) * dist;
    const wy = cy + Math.sin(angle) * dist;

    const enemy = new Enemy(
      this, wx, wy, roomIndex, wardenDef,
      floorConfig.enemyHpScale * COMPANION_CONFIG.WARDEN_HP_MULT,
      floorConfig.enemyAtkScale * COMPANION_CONFIG.WARDEN_ATK_MULT,
    );
    this.enemyGroup.add(enemy);
  }

  // Room overlay (cold tone)
  const overlay = this.add.rectangle(
    cx, cy,
    room.width * tileSize, room.height * tileSize,
    0x000033, 0.3,
  );
  overlay.setDepth(0);

  // Listen for room cleared to enable rescue
  const clearCheck = () => {
    if (room.state === RoomState.CLEARED) {
      // Fade overlay
      this.tweens.add({
        targets: overlay,
        alpha: 0,
        duration: 500,
        onComplete: () => overlay.destroy(),
      });
      EventBus.emit('hostage-guards-defeated', { companionId });
    }
  };
  // Poll in update via existing checkRoomClearing — use event
  EventBus.on('hostage-guards-defeated', clearCheck);
}
```

- [ ] **Step 7: Add rescue check in update()**

In `update()`, after `this.staircase?.update();`, add:

```typescript
this.checkHostageInteraction();
```

Add the method:

```typescript
private checkHostageInteraction(): void {
  if (!this.hostage || this.hostage.hostageState !== HostageState.CAGED) {
    if (this.rescueButtonVisible) {
      EventBus.emit('hide-rescue-button');
      this.rescueButtonVisible = false;
    }
    return;
  }

  // Only interactable after room is cleared
  const roomData = this.hostageRoomData;
  if (!roomData) return;
  const room = this.rooms[roomData.roomIndex];
  if (room.state !== RoomState.CLEARED) return;

  if (this.hostage.isInRange(this.player.x, this.player.y)) {
    if (!this.rescueButtonVisible) {
      EventBus.emit('show-rescue-button');
      this.rescueButtonVisible = true;
    }
  } else if (this.rescueButtonVisible) {
    EventBus.emit('hide-rescue-button');
    this.rescueButtonVisible = false;
  }
}
```

- [ ] **Step 8: Handle rescue action**

In `create()`, add EventBus listener:

```typescript
EventBus.on('rescue-triggered', () => {
  if (!this.hostage || this.hostage.hostageState !== HostageState.CAGED) return;

  // Suppress all damage during rescue
  this.player.setInvincible(true);
  EventBus.emit('hide-rescue-button');
  this.rescueButtonVisible = false;

  this.hostage.startRescue(() => {
    this.player.setInvincible(false);
    this.companionManager.rescue(this.hostage!.companionId);
    this.hostage = undefined;
  });
});
```

- [ ] **Step 9: Update buildRunState to include companion floor assignment**

In `buildRunState()`, add to the `base` object:

```typescript
companionFloorAssignment: this.companionManager.exportFloorAssignment(),
```

- [ ] **Step 10: Update onShutdown to clean up**

In `onShutdown()`, add:

```typescript
EventBus.off('rescue-triggered');
EventBus.off('hostage-guards-defeated');
EventBus.off('show-rescue-button');
EventBus.off('hide-rescue-button');
this.companionManager?.destroy();
```

- [ ] **Step 11: Run type check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add src/scenes/GameScene.ts
git commit -m "feat(companion): integrate CompanionManager, hostage spawning, rescue flow in GameScene"
```

---

## Task 7: Companion Album Panel UI

**Files:**
- Create: `src/ui/CompanionPanel.ts`
- Modify: `src/ui/HUD.ts`
- Modify: `src/scenes/UIScene.ts`

- [ ] **Step 1: Create CompanionPanel**

```typescript
import Phaser from 'phaser';
import EventBus from '../systems/EventBus';
import { COMPANION_DEFS, COMPANION_CONFIG } from '../config';
import type { GameScene } from '../scenes/GameScene';

const PANEL_W = 420;
const PANEL_H = 700;

const TEXT_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontSize: '12px',
  color: '#ffffff',
  fontFamily: 'monospace',
};

export class CompanionPanel {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private visible: boolean = false;
  private currentView: 'overview' | 'detail' = 'overview';
  private selectedCompanionId: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.container = scene.add.container(0, 0);
    this.container.setDepth(150);
    this.container.setVisible(false);

    EventBus.on('show-companion-panel', this.show, this);
  }

  private show = (): void => {
    if (this.visible) return;
    this.visible = true;
    this.currentView = 'overview';
    EventBus.emit('ui-input-lock', true);
    EventBus.emit('gameplay-lock', true);
    this.renderOverview();
  };

  private renderOverview(): void {
    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    if (!gameScene?.companionManager) { this.hide(); return; }

    this.container.removeAll(true);
    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;

    // Overlay
    const overlay = this.scene.add.rectangle(cx, cy, 450, 800, 0x000000, 0.6);
    this.container.add(overlay);

    // Panel
    const bg = this.scene.add.rectangle(cx, cy, PANEL_W, PANEL_H, 0x111111, 0.95);
    bg.setStrokeStyle(2, 0x444444);
    this.container.add(bg);

    const panelX = cx - PANEL_W / 2;
    const panelY = cy - PANEL_H / 2;

    // Title
    const title = this.scene.add.text(cx, panelY + 14, 'Companions', {
      ...TEXT_STYLE, fontSize: '16px',
    });
    title.setOrigin(0.5, 0);
    this.container.add(title);

    // Close button
    const closeBtn = this.scene.add.text(panelX + PANEL_W - 16, panelY + 10, 'X', {
      ...TEXT_STYLE, fontSize: '18px', color: '#ff4444',
    });
    closeBtn.setOrigin(0.5, 0);
    closeBtn.setInteractive({ useHandCursor: true });
    closeBtn.on('pointerup', () => this.hide());
    this.container.add(closeBtn);

    // 5 companion slots
    const slotW = 70;
    const slotH = 90;
    const startX = cx - (slotW * 5 + 10 * 4) / 2 + slotW / 2;
    const slotY = panelY + 60;

    const companions = gameScene.companionManager.getAllCompanions();

    for (let i = 0; i < companions.length; i++) {
      const comp = companions[i];
      const sx = startX + i * (slotW + 10);

      const slotBg = this.scene.add.rectangle(sx, slotY + slotH / 2, slotW, slotH, 0x222222);
      slotBg.setStrokeStyle(1, comp.unlocked ? comp.def.themeColor : 0x444444);
      this.container.add(slotBg);

      if (comp.unlocked) {
        // Avatar circle
        const avatar = this.scene.add.graphics();
        avatar.fillStyle(comp.def.themeColor);
        avatar.fillCircle(sx, slotY + 25, 18);
        this.container.add(avatar);

        // Name
        const name = this.scene.add.text(sx, slotY + 50, comp.def.name, {
          ...TEXT_STYLE, fontSize: '10px',
        });
        name.setOrigin(0.5, 0);
        this.container.add(name);

        // Affection bar
        const barW = 50;
        const barH = 6;
        const barX = sx - barW / 2;
        const barY = slotY + 65;
        const barBg = this.scene.add.rectangle(barX + barW / 2, barY + barH / 2, barW, barH, 0x333333);
        this.container.add(barBg);

        const ratio = comp.affection / COMPANION_CONFIG.AFFECTION_CAP;
        if (ratio > 0) {
          // Gradient: blue -> pink -> gold based on ratio
          const color = ratio < 0.5 ? 0x4488ff : ratio < 0.8 ? 0xff88aa : 0xffd700;
          const fill = this.scene.add.rectangle(barX + (barW * ratio) / 2, barY + barH / 2, barW * ratio, barH, color);
          this.container.add(fill);
        }

        // Make clickable
        slotBg.setInteractive({ useHandCursor: true });
        slotBg.on('pointerup', () => this.showDetail(comp.def.id));
      } else {
        // Locked silhouette
        const q = this.scene.add.text(sx, slotY + 30, '???', {
          ...TEXT_STYLE, fontSize: '14px', color: '#555555',
        });
        q.setOrigin(0.5, 0.5);
        this.container.add(q);
      }
    }

    this.container.setVisible(true);
  }

  private showDetail(companionId: string): void {
    const gameScene = this.scene.scene.get('GameScene') as GameScene;
    if (!gameScene?.companionManager) return;

    this.currentView = 'detail';
    this.selectedCompanionId = companionId;
    this.container.removeAll(true);

    const cx = this.scene.cameras.main.width / 2;
    const cy = this.scene.cameras.main.height / 2;
    const comp = gameScene.companionManager.getCompanion(companionId);
    const stage = gameScene.companionManager.getCurrentStage(companionId);
    const highestFloor = gameScene.floorManager.highestFloor;

    // Overlay + Panel
    const overlay = this.scene.add.rectangle(cx, cy, 450, 800, 0x000000, 0.6);
    this.container.add(overlay);
    const bg = this.scene.add.rectangle(cx, cy, PANEL_W, PANEL_H, 0x111111, 0.95);
    bg.setStrokeStyle(2, comp.def.themeColor);
    this.container.add(bg);

    const panelX = cx - PANEL_W / 2;
    const panelY = cy - PANEL_H / 2;

    // Back button
    const backBtn = this.scene.add.text(panelX + 16, panelY + 10, '< Back', {
      ...TEXT_STYLE, fontSize: '14px', color: '#aaaaaa',
    });
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on('pointerup', () => this.renderOverview());
    this.container.add(backBtn);

    // Name + element
    const elementLabel = comp.def.element ?? 'None';
    const nameText = this.scene.add.text(cx, panelY + 14, `${comp.def.name} [${elementLabel}]`, {
      ...TEXT_STYLE, fontSize: '16px', color: `#${comp.def.themeColor.toString(16).padStart(6, '0')}`,
    });
    nameText.setOrigin(0.5, 0);
    this.container.add(nameText);

    // Portrait placeholder (300x400 fixed container, left area)
    const portraitX = panelX + 20;
    const portraitY = panelY + 50;
    const portraitW = 180;
    const portraitH = 240;
    const stageLabels = ['Daily Outfit', 'Special Outfit', 'Full Portrait'];
    const stageAlphas = [0.3, 0.6, 1.0];
    const portraitStage = Math.max(0, stage - 1);

    if (stage > 0) {
      const portraitBg = this.scene.add.rectangle(
        portraitX + portraitW / 2, portraitY + portraitH / 2,
        portraitW, portraitH,
        comp.def.themeColor, stageAlphas[portraitStage],
      );
      portraitBg.setStrokeStyle(1, comp.def.themeColor);
      this.container.add(portraitBg);

      const portraitLabel = this.scene.add.text(
        portraitX + portraitW / 2, portraitY + portraitH / 2,
        stageLabels[portraitStage],
        { ...TEXT_STYLE, fontSize: '14px' },
      );
      portraitLabel.setOrigin(0.5, 0.5);
      this.container.add(portraitLabel);
    } else {
      const lockedBg = this.scene.add.rectangle(
        portraitX + portraitW / 2, portraitY + portraitH / 2,
        portraitW, portraitH, 0x333333,
      );
      lockedBg.setStrokeStyle(1, 0x555555);
      this.container.add(lockedBg);
      const lockText = this.scene.add.text(
        portraitX + portraitW / 2, portraitY + portraitH / 2,
        'Locked', { ...TEXT_STYLE, fontSize: '14px', color: '#666666' },
      );
      lockText.setOrigin(0.5, 0.5);
      this.container.add(lockText);
    }

    // Affection bar (right side)
    const rightX = portraitX + portraitW + 20;
    const affBarY = portraitY + 10;
    const affBarW = 160;
    const affBarH = 16;

    const affLabel = this.scene.add.text(rightX, affBarY - 16, `Affection: ${comp.affection}/${COMPANION_CONFIG.AFFECTION_CAP}`, {
      ...TEXT_STYLE, fontSize: '11px',
    });
    this.container.add(affLabel);

    const affBarBg = this.scene.add.rectangle(rightX + affBarW / 2, affBarY + affBarH / 2, affBarW, affBarH, 0x333333);
    this.container.add(affBarBg);
    const ratio = comp.affection / COMPANION_CONFIG.AFFECTION_CAP;
    if (ratio > 0) {
      const color = ratio < 0.17 ? 0x4488ff : ratio < 0.5 ? 0xff88aa : 0xffd700;
      const affFill = this.scene.add.rectangle(rightX + (affBarW * ratio) / 2, affBarY + affBarH / 2, affBarW * ratio, affBarH, color);
      this.container.add(affFill);
    }

    // 3 stage status
    let stageY = affBarY + 30;
    for (let s = 0; s < 3; s++) {
      const threshold = COMPANION_CONFIG.STAGE_THRESHOLDS[s];
      const floorGate = COMPANION_CONFIG.STAGE_FLOOR_GATES[s];
      const isUnlocked = stage > s;
      const meetsFloor = highestFloor >= floorGate;

      let statusText: string;
      let statusColor: string;
      if (isUnlocked) {
        statusText = `Stage ${s + 1}: Unlocked`;
        statusColor = '#00ff00';
      } else if (!meetsFloor) {
        statusText = `Stage ${s + 1}: Reach Floor ${floorGate}`;
        statusColor = '#ff6666';
      } else {
        const remaining = threshold - comp.affection;
        statusText = `Stage ${s + 1}: Need ${remaining} more`;
        statusColor = '#ffcc00';
      }

      const st = this.scene.add.text(rightX, stageY, statusText, {
        ...TEXT_STYLE, fontSize: '10px', color: statusColor,
      });
      this.container.add(st);
      stageY += 20;
    }

    // Gift area
    const giftY = portraitY + portraitH + 30;
    const atCap = comp.affection >= COMPANION_CONFIG.AFFECTION_CAP;

    const giftTitle = this.scene.add.text(panelX + 20, giftY, 'Send Gifts', {
      ...TEXT_STYLE, fontSize: '14px',
    });
    this.container.add(giftTitle);

    const player = (gameScene as GameScene).player;

    // Token gift row
    this.createGiftRow(panelX + 20, giftY + 30, `${comp.def.tokenName}: ${comp.tokens}`, comp.tokens > 0 && !atCap, () => {
      gameScene.companionManager.gift(companionId, 'token', 1);
      this.showDetail(companionId); // refresh
    });

    // Token gift all
    this.createGiftRow(panelX + 20, giftY + 60, `Gift All Tokens (${comp.tokens})`, comp.tokens > 0 && !atCap, () => {
      gameScene.companionManager.gift(companionId, 'token', comp.tokens);
      this.showDetail(companionId);
    });

    // Gold gift
    this.createGiftRow(panelX + 20, giftY + 90, `Gold: ${player.gold} (Gift 100g)`, player.gold >= 100 && !atCap, () => {
      player.addGold(-100);
      gameScene.companionManager.gift(companionId, 'gold', 1);
      this.showDetail(companionId);
    });

    // Material gift (use wood as representative)
    const totalMats = player.materials.wood + player.materials.ore + player.materials.cloth;
    this.createGiftRow(panelX + 20, giftY + 120, `Material: W${player.materials.wood} O${player.materials.ore} C${player.materials.cloth} (Gift 1)`, totalMats > 0 && !atCap, () => {
      // Deduct first available material
      if (player.materials.wood > 0) { player.addMaterial('wood', -1); }
      else if (player.materials.ore > 0) { player.addMaterial('ore', -1); }
      else if (player.materials.cloth > 0) { player.addMaterial('cloth', -1); }
      gameScene.companionManager.gift(companionId, 'material', 1);
      this.showDetail(companionId);
    });

    this.container.setVisible(true);
  }

  private createGiftRow(x: number, y: number, label: string, enabled: boolean, onClick: () => void): void {
    const text = this.scene.add.text(x, y, `[Gift] ${label}`, {
      ...TEXT_STYLE,
      fontSize: '11px',
      color: enabled ? '#ffffff' : '#555555',
    });
    this.container.add(text);

    if (enabled) {
      text.setInteractive({ useHandCursor: true });
      text.on('pointerup', onClick);
    }
  }

  private hide(): void {
    this.visible = false;
    this.container.setVisible(false);
    this.container.removeAll(true);
    EventBus.emit('ui-input-lock', false);
    EventBus.emit('gameplay-lock', false);
  }

  destroy(): void {
    EventBus.off('show-companion-panel', this.show, this);
    this.container.destroy();
  }
}
```

- [ ] **Step 2: Add Companions button to HUD**

In `src/ui/HUD.ts`, add a `companionBtn` field and create it after the equipment button:

```typescript
private companionBtn: Phaser.GameObjects.Text;
```

In the constructor, after `this.equipBtn.on('pointerup', ...)`:

```typescript
this.companionBtn = scene.add.text(
  camW - GOLD_PADDING,
  62,
  '[Companions]',
  { ...TEXT_STYLE, fontSize: '13px', color: '#ffaacc' },
);
this.companionBtn.setOrigin(1, 0);
this.companionBtn.setDepth(11);
this.companionBtn.setInteractive({ useHandCursor: true });
this.companionBtn.on('pointerup', () => {
  EventBus.emit('show-companion-panel');
});
```

- [ ] **Step 3: Add CompanionPanel and rescue button to UIScene**

In `src/scenes/UIScene.ts`, add imports:

```typescript
import { CompanionPanel } from '../ui/CompanionPanel';
```

Add field:

```typescript
private companionPanel!: CompanionPanel;
private rescueBtn?: Phaser.GameObjects.Text;
```

In `create()`, after `this.equipmentPanel = new EquipmentPanel(this);`:

```typescript
this.companionPanel = new CompanionPanel(this);

// Rescue button (hidden by default)
EventBus.on('show-rescue-button', () => {
  if (this.rescueBtn) return;
  const cx = this.cameras.main.width - 80;
  const cy = this.cameras.main.height - 60;
  this.rescueBtn = this.add.text(cx, cy, '[RESCUE]', {
    fontSize: '20px',
    color: '#ffcc00',
    fontFamily: 'monospace',
    backgroundColor: '#333333',
    padding: { x: 12, y: 8 },
  });
  this.rescueBtn.setOrigin(0.5, 0.5);
  this.rescueBtn.setDepth(200);
  this.rescueBtn.setInteractive({ useHandCursor: true });
  this.rescueBtn.on('pointerup', () => {
    EventBus.emit('rescue-triggered');
  });
});

EventBus.on('hide-rescue-button', () => {
  if (this.rescueBtn) {
    this.rescueBtn.destroy();
    this.rescueBtn = undefined;
  }
});
```

In the `game-scene-shutdown` listener, add:

```typescript
this.companionPanel.destroy();
if (this.rescueBtn) { this.rescueBtn.destroy(); this.rescueBtn = undefined; }
```

- [ ] **Step 4: Add token notification to UIScene**

In `create()`:

```typescript
EventBus.on('companion-token-collected', (data: { companionId: string; amount: number }) => {
  const def = (await import('../config')).COMPANION_DEFS.find((d: { id: string }) => d.id === data.companionId);
  // Use sync import instead
});
```

Actually, use a simpler approach — import at top and handle inline:

Add to UIScene imports:

```typescript
import { COMPANION_DEFS } from '../config';
```

In `create()`:

```typescript
EventBus.on('companion-token-collected', (data: { companionId: string; amount: number }) => {
  const def = COMPANION_DEFS.find(d => d.id === data.companionId);
  if (!def) return;
  const cx = this.cameras.main.width / 2;
  const notif = this.add.text(cx, 100, `${def.tokenName} +${data.amount}`, {
    fontSize: '14px',
    color: `#${def.themeColor.toString(16).padStart(6, '0')}`,
    fontFamily: 'monospace',
  });
  notif.setOrigin(0.5, 0.5);
  notif.setDepth(100);
  this.tweens.add({
    targets: notif,
    y: notif.y - 30,
    alpha: 0,
    duration: 1500,
    onComplete: () => notif.destroy(),
  });
});
```

- [ ] **Step 5: Run type check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add src/ui/CompanionPanel.ts src/ui/HUD.ts src/scenes/UIScene.ts
git commit -m "feat(companion): add CompanionPanel UI, HUD button, rescue button, token notification"
```

---

## Task 8: DebugManager — Companion Debug Commands

**Files:**
- Modify: `src/debug/DebugManager.ts`

- [ ] **Step 1: Add companion debug commands to DebugAPI interface**

In the `DebugAPI` interface, after the elemental debug commands:

```typescript
// Companion debug commands
unlockCompanion(id: string): void;
setAffection(id: string, value: number): void;
giveToken(id: string, count: number): void;
unlockAllCompanions(): void;
```

- [ ] **Step 2: Add companion section to GameState interface**

In the `GameState` interface, add:

```typescript
companions: {
  [id: string]: {
    unlocked: boolean;
    affection: number;
    tokens: number;
    stage: number;
  };
};
```

- [ ] **Step 3: Implement debug commands in setupDebugAPI**

In `setupDebugAPI()`, add after the elemental commands:

```typescript
unlockCompanion: (id: string) => {
  this.scene.companionManager?.debugUnlock(id);
  console.log(`[Debug] Unlocked companion: ${id}`);
},
setAffection: (id: string, value: number) => {
  this.scene.companionManager?.debugSetAffection(id, value);
  console.log(`[Debug] Set ${id} affection to ${value}`);
},
giveToken: (id: string, count: number) => {
  this.scene.companionManager?.debugGiveTokens(id, count);
  console.log(`[Debug] Gave ${count} tokens to ${id}`);
},
unlockAllCompanions: () => {
  this.scene.companionManager?.debugUnlockAll();
  console.log('[Debug] All companions unlocked at max affection');
},
```

- [ ] **Step 4: Add companion data to buildStateSnapshot**

In `buildStateSnapshot()`, add the companions section:

```typescript
companions: (() => {
  const result: GameState['companions'] = {};
  if (this.scene.companionManager) {
    for (const comp of this.scene.companionManager.getAllCompanions()) {
      result[comp.def.id] = {
        unlocked: comp.unlocked,
        affection: comp.affection,
        tokens: comp.tokens,
        stage: this.scene.companionManager.getCurrentStage(comp.def.id),
      };
    }
  }
  return result;
})(),
```

- [ ] **Step 5: Run type check**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add src/debug/DebugManager.ts
git commit -m "feat(companion): add companion debug commands to DebugManager"
```

---

## Task 9: Texture Placeholders in BootScene

**Files:**
- Modify: `src/scenes/BootScene.ts`

- [ ] **Step 1: Add placeholder textures for Warden and tokens**

In `BootScene.ts`, in `create()` where other placeholder textures are generated, add:

```typescript
// Warden placeholder (large red enemy)
const wardenGfx = this.add.graphics();
wardenGfx.fillStyle(0xCC0000);
wardenGfx.fillRect(0, 0, 48, 48);
// Crown marker
wardenGfx.fillStyle(0xFFD700);
wardenGfx.fillTriangle(12, 8, 24, 0, 36, 8);
wardenGfx.generateTexture('enemy-warden', 48, 48);
wardenGfx.destroy();

// Token placeholder (diamond shape)
const tokenGfx = this.add.graphics();
tokenGfx.fillStyle(0xffffff); // tinted at spawn
tokenGfx.fillTriangle(8, 0, 16, 8, 8, 16);
tokenGfx.fillTriangle(8, 0, 0, 8, 8, 16);
tokenGfx.generateTexture('loot-token', 16, 16);
tokenGfx.destroy();
```

- [ ] **Step 2: Run type check and build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit && npm run build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add src/scenes/BootScene.ts
git commit -m "feat(companion): add warden and token placeholder textures"
```

---

## Task 10: Full Build Verification + Fix Any Type Errors

**Files:**
- Any files with type errors

- [ ] **Step 1: Run full build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npx tsc --noEmit`

- [ ] **Step 2: Fix any type errors found**

Address each error. Common expected issues:
- `GameScene.companionManager` not declared as public — ensure it's `public`
- Missing imports in files that reference new types
- `FloorConfig` type import needed in GameScene

- [ ] **Step 3: Run vite build**

Run: `cd "/Users/admin/2026 gamejam/dark-dungeon" && npm run build`
Expected: Build succeeds

- [ ] **Step 4: Commit fixes if any**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add -A
git commit -m "fix(companion): resolve type errors from companion system integration"
```

---

## Task 11: QA — Delegate to Sonnet Subagent

- [ ] **Step 1: Run QA via Sonnet subagent**

Delegate to `Agent(model: "sonnet")` with the full AC list from `openspec/007-hostage-companion-system.md` (50 ACs). Use the QA prompt template from CLAUDE.md. The subagent should:

1. `npm run build && npx vite preview --port 4173`
2. Open `http://localhost:4173/?debug=1` in agent-browser
3. Test each AC using debug API
4. Return markdown table: AC | Test Method | PASS/FAIL | Notes

- [ ] **Step 2: Fix any failing ACs**

- [ ] **Step 3: Re-run QA until all ACs pass**

- [ ] **Step 4: Final commit**

```bash
cd "/Users/admin/2026 gamejam/dark-dungeon"
git add -A
git commit -m "feat(companion): hostage rescue & companion system complete — 50/50 AC pass"
```
