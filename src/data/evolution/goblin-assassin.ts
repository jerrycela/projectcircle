import type { EvolutionDefinition } from '../schemas'

export const goblinAssassin: EvolutionDefinition = {
  id: 'goblin_assassin',
  fromMonsterId: 'goblin',
  path: {
    route: 'A',
    name: '刺客',
  },
  evolvedStats: {
    hp: 55,
    attack: 18,
    attackInterval: 0.8,
    moveSpeed: 169,  // 130 * 1.3
    launchType: 'bounce',
  },
  specialAbility: {
    type: 'speed_boost',
    description: '移動速度 +30%',
    params: {
      moveSpeedBonus: 0.3,
    },
  },
}
