import type { LevelLayout } from '../schemas'

export const LEVEL_LAYOUTS: readonly LevelLayout[] = [
  // Layout 0: Empty (for first rooms, distance=1)
  {
    id: 'empty',
    name: '空房間',
    obstacles: [],
    launchPads: [
      { x: 87.5, y: 328 },
      { x: 262.5, y: 328 },
    ],
    waypoints: {
      up:    { points: [] },
      down:  { points: [] },
      left:  { points: [] },
      right: { points: [] },
    },
    allowedBreachDirections: ['up', 'left', 'right', 'down'],
    crystalPosition: { x: 175, y: 360 },
  },

  // Layout 1: Corridor - S-curve formed by offset walls
  {
    id: 'corridor',
    name: '蛇行走廊',
    obstacles: [
      { x: 0,   y: 100, width: 200, height: 24, type: 'wall' },
      { x: 150, y: 220, width: 200, height: 24, type: 'wall' },
    ],
    launchPads: [
      { x: 175, y: 350 },
    ],
    waypoints: {
      up:   { points: [{ x: 280, y: 60 }, { x: 280, y: 160 }, { x: 70, y: 160 }, { x: 70, y: 280 }, { x: 175, y: 320 }] },
      left: { points: [{ x: 60, y: 60 }, { x: 280, y: 60 }, { x: 280, y: 160 }, { x: 70, y: 280 }, { x: 175, y: 320 }] },
      right:{ points: [{ x: 280, y: 160 }, { x: 70, y: 160 }, { x: 70, y: 280 }, { x: 175, y: 320 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
    crystalPosition: { x: 175, y: 370 },
  },

  // Layout 2: Fortress - central block with two gaps
  {
    id: 'fortress',
    name: '中央堡壘',
    obstacles: [
      { x: 100, y: 150, width: 150, height: 24, type: 'wall' },
      { x: 100, y: 250, width: 150, height: 24, type: 'wall' },
      { x: 100, y: 174, width: 24,  height: 76, type: 'wall' },
    ],
    launchPads: [
      { x: 87.5, y: 350 },
      { x: 262.5, y: 350 },
    ],
    waypoints: {
      up:   { points: [{ x: 175, y: 80 }, { x: 300, y: 200 }, { x: 250, y: 320 }] },
      left: { points: [{ x: 50, y: 200 }, { x: 50, y: 300 }, { x: 175, y: 320 }] },
      right:{ points: [{ x: 300, y: 200 }, { x: 250, y: 320 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
    crystalPosition: { x: 175, y: 200 },
  },

  // Layout 3: Split - vertical wall dividing room into two lanes
  {
    id: 'split',
    name: '分岔路',
    obstacles: [
      { x: 163, y: 60, width: 24, height: 220, type: 'wall' },
    ],
    launchPads: [
      { x: 80, y: 350 },
      { x: 270, y: 350 },
    ],
    waypoints: {
      up:   { points: [{ x: 80, y: 60 }, { x: 80, y: 320 }] },
      left: { points: [{ x: 80, y: 200 }, { x: 80, y: 320 }] },
      right:{ points: [{ x: 270, y: 200 }, { x: 270, y: 320 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
    crystalPosition: { x: 175, y: 370 },
  },

  // Layout 4: Arena - four pillars in diamond
  {
    id: 'arena',
    name: '競技場',
    obstacles: [
      { x: 151, y: 80,  width: 48, height: 48, type: 'wall' },
      { x: 50,  y: 176, width: 48, height: 48, type: 'wall' },
      { x: 252, y: 176, width: 48, height: 48, type: 'wall' },
      { x: 151, y: 272, width: 48, height: 48, type: 'wall' },
    ],
    launchPads: [
      { x: 87.5, y: 370 },
      { x: 262.5, y: 370 },
    ],
    waypoints: {
      up:   { points: [{ x: 100, y: 60 }, { x: 100, y: 200 }, { x: 175, y: 340 }] },
      left: { points: [{ x: 40, y: 120 }, { x: 120, y: 250 }, { x: 175, y: 340 }] },
      right:{ points: [{ x: 310, y: 120 }, { x: 230, y: 250 }, { x: 175, y: 340 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
    crystalPosition: { x: 175, y: 180 },
  },

  // Layout 5: Bottleneck - narrow choke point in the middle
  {
    id: 'bottleneck',
    name: '瓶頸道',
    obstacles: [
      { x: 0,   y: 170, width: 120, height: 24, type: 'wall' },
      { x: 230, y: 170, width: 120, height: 24, type: 'wall' },
    ],
    launchPads: [
      { x: 175, y: 340 },
    ],
    waypoints: {
      up:   { points: [{ x: 175, y: 80 }, { x: 175, y: 210 }, { x: 175, y: 310 }] },
      left: { points: [{ x: 50, y: 120 }, { x: 175, y: 210 }, { x: 175, y: 310 }] },
      right:{ points: [{ x: 300, y: 120 }, { x: 175, y: 210 }, { x: 175, y: 310 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
    crystalPosition: { x: 175, y: 330 },
  },

  // Layout 6: Barricade - destructible crates blocking direct path
  {
    id: 'barricade',
    name: '路障陣',
    obstacles: [
      { x: 60,  y: 120, width: 48, height: 48, type: 'destructible', hp: 80 },
      { x: 240, y: 120, width: 48, height: 48, type: 'destructible', hp: 80 },
      { x: 150, y: 200, width: 48, height: 48, type: 'destructible', hp: 80 },
      { x: 60,  y: 280, width: 48, height: 48, type: 'destructible', hp: 80 },
      { x: 240, y: 280, width: 48, height: 48, type: 'destructible', hp: 80 },
    ],
    launchPads: [
      { x: 87.5, y: 360 },
      { x: 262.5, y: 360 },
    ],
    waypoints: {
      up:   { points: [{ x: 175, y: 60 }, { x: 175, y: 160 }, { x: 175, y: 320 }] },
      left: { points: [{ x: 50, y: 200 }, { x: 120, y: 320 }] },
      right:{ points: [{ x: 300, y: 200 }, { x: 230, y: 320 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
    crystalPosition: { x: 175, y: 360 },
  },

  // Layout 7: Flanking - obstacles force enemies to split
  {
    id: 'flanking',
    name: '包夾陣',
    obstacles: [
      { x: 130, y: 60,  width: 90, height: 24, type: 'wall' },
      { x: 0,   y: 200, width: 100, height: 24, type: 'wall' },
      { x: 250, y: 200, width: 100, height: 24, type: 'wall' },
    ],
    launchPads: [
      { x: 60, y: 340 },
      { x: 175, y: 360 },
      { x: 290, y: 340 },
    ],
    waypoints: {
      up:   { points: [{ x: 60, y: 50 }, { x: 60, y: 160 }, { x: 175, y: 310 }] },
      left: { points: [{ x: 50, y: 160 }, { x: 175, y: 310 }] },
      right:{ points: [{ x: 300, y: 160 }, { x: 175, y: 310 }] },
    },
    allowedBreachDirections: ['up', 'left', 'right'],
    crystalPosition: { x: 175, y: 320 },
  },
]

/**
 * Get layout by ID
 */
export function getLayoutById(id: string): LevelLayout | undefined {
  return LEVEL_LAYOUTS.find(l => l.id === id)
}

/**
 * Get a random layout appropriate for room distance.
 * Distance 1: always empty.
 * Distance 2+: random non-empty layout.
 */
export function selectLayoutForDistance(distance: number): LevelLayout {
  if (distance <= 1) {
    return LEVEL_LAYOUTS[0]  // empty
  }
  const candidates = LEVEL_LAYOUTS.filter(l => l.id !== 'empty')
  return candidates[Math.floor(Math.random() * candidates.length)]
}
