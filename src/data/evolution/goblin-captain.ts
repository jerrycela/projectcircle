import type { EvolutionDefinition } from '../schemas'

export const goblinCaptain: EvolutionDefinition = {
  id: 'goblin_captain',
  fromMonsterId: 'goblin',
  path: {
    route: 'B',
    name: '隊長',
  },
  evolvedStats: {
    hp: 72,
    attack: 13,
    attackInterval: 1.0,
  },
  specialAbility: {
    type: 'aura_atk',
    description: '友軍 ATK+3 光環（全場，含自身）',
    params: {
      attackBonus: 3,
    },
  },
  aiType: 'support',
}
