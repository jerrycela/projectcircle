import type { EvolutionDefinition } from '../schemas'

export const berserkerOgre: EvolutionDefinition = {
  id: 'berserker_ogre',
  fromMonsterId: 'ogre',
  path: {
    route: 'B',
    name: '狂暴',
  },
  evolvedStats: {
    hp: 140,
    attack: 12,
    attackInterval: 1.8,
    launchType: 'bounce',
  },
  specialAbility: {
    type: 'damage_scaling',
    description: 'HP 越低攻擊越高，上限基礎 ATK x3.0 = 36',
    params: {
      damageScaling: 0.5,
      maxMultiplier: 3,
      baseAttack: 12,
    },
  },
}
