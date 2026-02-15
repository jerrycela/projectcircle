import type { HeroDefinition } from '../schemas'

export const paladin: HeroDefinition = {
  id: 'paladin',
  name: '聖騎士',
  stats: {
    hp: 180,
    attack: 22,
    attackInterval: 2.5,
    moveSpeed: 60,
    attackRange: 30,
  },
  goldReward: 30,
  xpReward: 25,
  aiType: 'melee_tank',
  description: '精英近戰英雄，高 HP 高攻擊，移動緩慢但威脅極大',
}
