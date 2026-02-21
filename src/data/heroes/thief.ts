import type { HeroDefinition } from '../schemas'

export const thief: HeroDefinition = {
  id: 'thief',
  name: '盜賊',
  stats: {
    hp: 40,
    attack: 8,
    attackInterval: 1.0,
    moveSpeed: 150,
    attackRange: 25,
  },
  goldReward: 20,
  xpReward: 15,
  aiType: 'melee_aggressive',
  description: '高速英雄，優先攻擊地城水晶，免疫一次性陷阱',
}
