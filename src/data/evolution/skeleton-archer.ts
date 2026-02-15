import type { EvolutionDefinition } from '../schemas'

export const skeletonArcher: EvolutionDefinition = {
  id: 'skeleton_archer',
  fromMonsterId: 'skeleton',
  path: {
    route: 'A',
    name: '弓手',
  },
  evolvedStats: {
    hp: 45,
    attack: 12,
    attackInterval: 1.5,
    attackRange: 220,
  },
  specialAbility: {
    type: 'range_boost',
    description: '射程 220px（+47%）',
    params: {
      rangeBonus: 70,
    },
  },
}
