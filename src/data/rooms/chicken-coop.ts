import type { RoomDefinition } from '../schemas'

export const chickenCoop: RoomDefinition = {
  id: 'chicken_coop',
  name: '養雞場',
  type: 'chicken_coop',
  effect: {
    type: 'spawn_minions',
    baseValue: 2,
    description: '戰鬥開始自動生成 2 隻小雞',
  },
  diminishing: {
    values: [2, 2, 1, 0],
  },
  minionSpawn: {
    type: 'chicken',
    count: 2,
  },
  description: '生成小雞肉盾（2→2→1→0 隻），全場上限 5 隻，不計入我方單位上限',
}
