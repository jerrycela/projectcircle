import type { RoomDefinition } from '../schemas'

export const treasury: RoomDefinition = {
  id: 'treasury',
  name: '寶藏室',
  type: 'treasury',
  effect: {
    type: 'gold_bonus',
    baseValue: 0.5,
    description: '戰鬥勝利後金幣 +50%',
  },
  diminishing: {
    values: [0.5, 0.4, 0.25, 0.15],
  },
  passiveIncomePerBattle: 20,
  description: '提供金幣加成（50%→40%→25%→15%）與每場戰鬥 20 金被動收入',
}
