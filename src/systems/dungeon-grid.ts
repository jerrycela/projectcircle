/**
 * DungeonGrid - 地城網格資料結構
 * 2D 陣列，管理房間位置和鄰接關係
 */

export interface GridPosition {
  readonly x: number
  readonly y: number
}

export interface GridCell {
  readonly position: GridPosition
  readonly roomId: string | null     // null = 未征服
  readonly roomType: string | null
  readonly distance: number          // 離起點距離
}

export type Direction = 'up' | 'down' | 'left' | 'right'

const DIRECTION_OFFSETS: Record<Direction, GridPosition> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

export class DungeonGrid {
  private readonly cells: Map<string, GridCell> = new Map()

  private static posKey(pos: GridPosition): string {
    return `${pos.x},${pos.y}`
  }

  constructor() {
    // 起始房間在 (0, 0)
    this.setCell({
      position: { x: 0, y: 0 },
      roomId: 'dungeon_heart',
      roomType: 'dungeon_heart',
      distance: 0,
    })
  }

  getCell(pos: GridPosition): GridCell | undefined {
    return this.cells.get(DungeonGrid.posKey(pos))
  }

  setCell(cell: GridCell): void {
    this.cells.set(DungeonGrid.posKey(cell.position), cell)
  }

  /**
   * 取得相鄰位置
   */
  getNeighborPosition(pos: GridPosition, direction: Direction): GridPosition {
    const offset = DIRECTION_OFFSETS[direction]
    return { x: pos.x + offset.x, y: pos.y + offset.y }
  }

  /**
   * 取得可破牆方向（鄰接空 cell 的方向）
   * 起始房間底部固定為牆壁（不可破）
   */
  getAvailableDirections(pos: GridPosition): Direction[] {
    const directions: Direction[] = ['up', 'left', 'right']

    // 非起始房間也可以往下
    if (pos.x !== 0 || pos.y !== 0) {
      directions.push('down')
    }

    return directions.filter(dir => {
      const neighborPos = this.getNeighborPosition(pos, dir)
      const neighbor = this.getCell(neighborPos)
      return !neighbor // 只有空 cell 才能破牆
    })
  }

  /**
   * 征服新房間
   */
  conquerRoom(pos: GridPosition, roomType: string): GridCell {
    const cell: GridCell = {
      position: pos,
      roomId: `room_${pos.x}_${pos.y}`,
      roomType,
      distance: Math.abs(pos.x) + Math.abs(pos.y),
    }
    this.setCell(cell)
    return cell
  }

  /**
   * 取得所有已征服的房間
   */
  getConqueredRooms(): GridCell[] {
    return Array.from(this.cells.values()).filter(c => c.roomId !== null)
  }

  /**
   * 已征服房間數
   */
  getConqueredCount(): number {
    return this.getConqueredRooms().length
  }
}
