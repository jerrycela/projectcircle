import type { RoomDefinition } from '../schemas'

export const trainingGround: RoomDefinition = {
  id: 'training_ground',
  name: '訓練場',
  type: 'training_ground',
  effect: {
    type: 'attack_speed',
    baseValue: 0.15,
    description: '我方怪物攻速 +15%',
  },
  diminishing: {
    values: [0.15, 0.12, 0.08, 0.05],
    maxBonus: 0.4,
  },
  description: '提供攻速加成（15%→12%→8%→5%），上限 +40%',
}
