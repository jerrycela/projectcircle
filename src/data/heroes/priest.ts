import type { HeroDefinition } from '../schemas'

export const priest: HeroDefinition = {
  id: 'priest',
  name: '牧師',
  stats: {
    hp: 50,
    attack: 6,
    attackInterval: 2.0,
    moveSpeed: 70,
    attackRange: 25,
  },
  goldReward: 25,
  xpReward: 20,
  aiType: 'support',
  description: '治療附近受傷英雄，每 2 秒恢復 15 HP（不自療）',
}
