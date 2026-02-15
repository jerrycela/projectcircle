import type { EvolutionDefinition } from '../schemas'

export const skeletonMage: EvolutionDefinition = {
  id: 'skeleton_mage',
  fromMonsterId: 'skeleton',
  path: {
    route: 'B',
    name: '法師',
  },
  evolvedStats: {
    hp: 40,
    attack: 10,
    attackInterval: 2.5,
  },
  specialAbility: {
    type: 'aoe',
    description: 'AOE 50px 半徑範圍傷害，全額傷害無衰減',
    params: {
      aoeRadius: 50,
    },
  },
}
