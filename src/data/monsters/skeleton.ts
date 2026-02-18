import type { MonsterDefinition } from '../schemas'

export const skeleton: MonsterDefinition = {
  id: 'skeleton',
  name: '骷髏兵',
  rarity: 'common',
  stats: {
    hp: 45,
    attack: 12,
    attackInterval: 1.8,
    moveSpeed: 0,
    attackRange: 150,
    launchType: 'pierce',
  },
  aiType: 'ranged_stationary',
  deployCooldown: 2000,
  description: '站樁射擊的遠程單位，投擲骨頭攻擊',
  tags: ['ranged', 'stationary'],
}
