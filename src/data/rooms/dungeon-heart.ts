import type { RoomDefinition } from '../schemas'

export const dungeonHeart: RoomDefinition = {
  id: 'dungeon_heart',
  name: '地心',
  type: 'dungeon_heart',
  effect: {
    type: 'none',
    baseValue: 0,
    description: '起始房間，無特殊效果',
  },
  diminishing: {
    values: [0, 0, 0, 0],
  },
  description: '地下城的核心房間，你的起點',
}
