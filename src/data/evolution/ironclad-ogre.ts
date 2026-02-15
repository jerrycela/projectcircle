import type { EvolutionDefinition } from '../schemas'

export const ironcladOgre: EvolutionDefinition = {
  id: 'ironclad_ogre',
  fromMonsterId: 'ogre',
  path: {
    route: 'A',
    name: '鐵甲',
  },
  evolvedStats: {
    hp: 220,
    attack: 10,
    attackInterval: 2.0,
  },
  specialAbility: {
    type: 'knockback',
    description: '碰撞推力 +50%',
    params: {
      knockbackForce: 1.5,
    },
  },
}
