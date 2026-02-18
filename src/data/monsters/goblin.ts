import type { MonsterDefinition } from '../schemas'

export const goblin: MonsterDefinition = {
  id: 'goblin',
  name: '哥布林',
  rarity: 'common',
  stats: {
    hp: 60,
    attack: 10,
    attackInterval: 1.0,
    moveSpeed: 130,
    attackRange: 30,
    launchType: 'bounce',
  },
  aiType: 'melee_aggressive',
  deployCooldown: 1000,
  description: '靈活走位的近戰輸出，攻擊最弱敵人',
  tags: ['melee', 'dps', 'starter'],
  collisionReaction: {
    type: 'dodge',
    knockbackDistance: 60,
    invincibleDuration: 500,
    cooldown: 3000,
  },
}
