import { GAME_CONFIG } from '../config';

export const RoomState = {
  UNVISITED: 'UNVISITED',
  ACTIVE: 'ACTIVE',
  CLEARED: 'CLEARED',
} as const;

export type RoomState = typeof RoomState[keyof typeof RoomState];

export interface Room {
  x: number;       // grid x (top-left)
  y: number;       // grid y (top-left)
  width: number;   // grid units
  height: number;  // grid units
  centerX: number; // grid center x
  centerY: number; // grid center y
  state: RoomState;
}

export interface DungeonData {
  grid: number[][];
  rooms: Room[];
}

const MAX_RETRIES = 10;
const PLACEMENT_ATTEMPTS = 30;

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function initGrid(width: number, height: number): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < height; y++) {
    grid.push(new Array<number>(width).fill(1));
  }
  return grid;
}

function roomsOverlap(
  ax: number, ay: number, aw: number, ah: number,
  bx: number, by: number, bw: number, bh: number,
  gap: number,
): boolean {
  return (
    ax - gap < bx + bw &&
    ax + aw + gap > bx &&
    ay - gap < by + bh &&
    ay + ah + gap > by
  );
}

function carveRoom(grid: number[][], room: Room): void {
  for (let gy = room.y; gy < room.y + room.height; gy++) {
    for (let gx = room.x; gx < room.x + room.width; gx++) {
      grid[gy][gx] = 0;
    }
  }
}

function carveCorridor(grid: number[][], ax: number, ay: number, bx: number, by: number): void {
  // Horizontal segment first, then vertical (L-shaped)
  const startX = Math.min(ax, bx);
  const endX = Math.max(ax, bx);
  for (let gx = startX; gx <= endX; gx++) {
    grid[ay][gx] = 0;
  }

  const startY = Math.min(ay, by);
  const endY = Math.max(ay, by);
  for (let gy = startY; gy <= endY; gy++) {
    grid[gy][bx] = 0;
  }
}

function isConnected(grid: number[][], rooms: Room[]): boolean {
  if (rooms.length === 0) return true;

  const width = grid[0].length;
  const height = grid.length;
  const visited = new Set<number>();

  const startX = rooms[0].centerX;
  const startY = rooms[0].centerY;
  const queue: Array<[number, number]> = [[startX, startY]];
  visited.add(startY * width + startX);

  const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const key = ny * width + nx;
      if (visited.has(key)) continue;
      if (grid[ny][nx] !== 0) continue;
      visited.add(key);
      queue.push([nx, ny]);
    }
  }

  // Check all room centers are reachable
  for (const room of rooms) {
    const key = room.centerY * width + room.centerX;
    if (!visited.has(key)) return false;
  }
  return true;
}

function tryGenerate(roomCount: number): DungeonData | null {
  const width = GAME_CONFIG.MAP_WIDTH;
  const height = GAME_CONFIG.MAP_HEIGHT;
  const roomMin = GAME_CONFIG.ROOM_SIZE.min;
  const roomMax = GAME_CONFIG.ROOM_SIZE.max;

  const grid = initGrid(width, height);
  const rooms: Room[] = [];

  for (let i = 0; i < roomCount; i++) {
    let placed = false;

    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const rw = randInt(roomMin, roomMax);
      const rh = randInt(roomMin, roomMax);
      // Keep rooms within map bounds (leave 1-tile border)
      const rx = randInt(1, width - rw - 2);
      const ry = randInt(1, height - rh - 2);

      // Check overlap with existing rooms (1-tile gap)
      let overlaps = false;
      for (const existing of rooms) {
        if (roomsOverlap(rx, ry, rw, rh, existing.x, existing.y, existing.width, existing.height, 1)) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        const room: Room = {
          x: rx,
          y: ry,
          width: rw,
          height: rh,
          centerX: Math.floor(rx + rw / 2),
          centerY: Math.floor(ry + rh / 2),
          state: RoomState.UNVISITED,
        };
        rooms.push(room);
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Skip this room if placement failed
      continue;
    }
  }

  if (rooms.length < 2) return null;

  // Carve rooms
  for (const room of rooms) {
    carveRoom(grid, room);
  }

  // Connect rooms in chain order
  for (let i = 0; i < rooms.length - 1; i++) {
    carveCorridor(
      grid,
      rooms[i].centerX, rooms[i].centerY,
      rooms[i + 1].centerX, rooms[i + 1].centerY,
    );
  }

  // Flood fill validation
  if (!isConnected(grid, rooms)) return null;

  return { grid, rooms };
}

export function generate(): DungeonData {
  const minRoomCount = GAME_CONFIG.ROOM_COUNT.min;
  const maxRoomCount = GAME_CONFIG.ROOM_COUNT.max;

  for (let roomCount = maxRoomCount; roomCount >= minRoomCount; roomCount--) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const result = tryGenerate(roomCount);
      if (result !== null) {
        console.log(`[DungeonGenerator] Generated dungeon with ${result.rooms.length} rooms (target: ${roomCount})`);
        return result;
      }
    }
  }

  // Absolute fallback: single room in center
  console.warn('[DungeonGenerator] All retries exhausted, using fallback single room');
  const grid = initGrid(GAME_CONFIG.MAP_WIDTH, GAME_CONFIG.MAP_HEIGHT);
  const fallbackRoom: Room = {
    x: 20, y: 20, width: 10, height: 10,
    centerX: 25, centerY: 25,
    state: RoomState.UNVISITED,
  };
  carveRoom(grid, fallbackRoom);
  return { grid, rooms: [fallbackRoom] };
}
