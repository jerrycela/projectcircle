import type { HeroDefinition } from '../schemas'

export const adventurer: HeroDefinition = {
  id: 'adventurer',
  name: '冒險者',
  stats: {
    hp: 60,
    attack: 12,
    attackInterval: 1.5,
    moveSpeed: 90,
    attackRange: 30,
  },
  goldReward: 15,
  xpReward: 10,
  aiType: 'melee_tank',
  description: '普通近戰英雄，攻擊最近的敵人',
}
