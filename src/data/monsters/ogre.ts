import type { MonsterDefinition } from '../schemas'

export const ogre: MonsterDefinition = {
  id: 'ogre',
  name: '食人魔',
  rarity: 'common',
  stats: {
    hp: 120,
    attack: 12,
    attackInterval: 2.0,
    moveSpeed: 80,
    attackRange: 30,
    launchType: 'bounce',
  },
  aiType: 'melee_tank',
  deployCooldown: 3000,
  description: '高 HP 的前排肉盾，衝向最近敵人吸引火力',
  tags: ['melee', 'tank'],
}
