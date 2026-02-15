/**
 * ProjectCircle - 資料查詢中心
 * 統一管理所有遊戲資料的查詢 API
 */

import type {
  MonsterDefinition,
  EvolutionDefinition,
  RoomDefinition,
  HeroDefinition,
  AffixDefinition,
  AffixType,
  ConsumableDefinition,
  BattleWaveConfig,
  MonsterRarity,
} from './schemas'

// 怪物資料
import { goblin } from './monsters/goblin'
import { skeleton } from './monsters/skeleton'
import { ogre } from './monsters/ogre'

// 英雄資料
import { adventurer } from './heroes/adventurer'
import { paladin } from './heroes/paladin'

// 房間資料
import { dungeonHeart } from './rooms/dungeon-heart'
import { treasury } from './rooms/treasury'
import { trainingGround } from './rooms/training-ground'
import { chickenCoop } from './rooms/chicken-coop'

// 進化資料
import { goblinAssassin } from './evolution/goblin-assassin'
import { goblinCaptain } from './evolution/goblin-captain'
import { skeletonArcher } from './evolution/skeleton-archer'
import { skeletonMage } from './evolution/skeleton-mage'
import { ironcladOgre } from './evolution/ironclad-ogre'
import { berserkerOgre } from './evolution/berserker-ogre'

export class DataRegistry {
  // ============ 怪物查詢 ============

  private static readonly monsters: readonly MonsterDefinition[] = [
    goblin,
    skeleton,
    ogre,
  ]

  static getAllMonsters(): readonly MonsterDefinition[] {
    return this.monsters
  }

  static getMonsterById(id: string): MonsterDefinition | undefined {
    return this.monsters.find(m => m.id === id)
  }

  static getMonstersByRarity(rarity: MonsterRarity): readonly MonsterDefinition[] {
    return this.monsters.filter(m => m.rarity === rarity)
  }

  static getMonstersByTag(tag: string): readonly MonsterDefinition[] {
    return this.monsters.filter(m => m.tags?.includes(tag) ?? false)
  }

  // ============ 英雄查詢 ============

  private static readonly heroes: readonly HeroDefinition[] = [
    adventurer,
    paladin,
  ]

  static getAllHeroes(): readonly HeroDefinition[] {
    return this.heroes
  }

  static getHeroById(id: string): HeroDefinition | undefined {
    return this.heroes.find(h => h.id === id)
  }

  // ============ 房間查詢 ============

  private static readonly rooms: readonly RoomDefinition[] = [
    dungeonHeart,
    treasury,
    trainingGround,
    chickenCoop,
  ]

  static getAllRooms(): readonly RoomDefinition[] {
    return this.rooms
  }

  static getRoomById(id: string): RoomDefinition | undefined {
    return this.rooms.find(r => r.id === id)
  }

  // ============ 進化查詢 ============

  private static readonly evolutions: readonly EvolutionDefinition[] = [
    goblinAssassin,
    goblinCaptain,
    skeletonArcher,
    skeletonMage,
    ironcladOgre,
    berserkerOgre,
  ]

  static getAllEvolutions(): readonly EvolutionDefinition[] {
    return this.evolutions
  }

  static getEvolutionById(id: string): EvolutionDefinition | undefined {
    return this.evolutions.find(e => e.id === id)
  }

  static getEvolutionPaths(monsterId: string): readonly EvolutionDefinition[] {
    return this.evolutions.filter(e => e.fromMonsterId === monsterId)
  }

  static getEvolutionByPath(
    monsterId: string,
    route: 'A' | 'B'
  ): EvolutionDefinition | undefined {
    return this.evolutions.find(
      e => e.fromMonsterId === monsterId && e.path.route === route
    )
  }

  // ============ 詞綴查詢 ============

  private static readonly affixes: readonly AffixDefinition[] = [
    {
      id: 'dark_room',
      name: '暗室',
      modifier: {
        visionMultiplier: 0.5,
        allyAttackMultiplier: 1.2,
      },
      description: '視野縮小 50%，我方攻擊 +20%',
    },
    {
      id: 'narrow_path',
      name: '窄道',
      modifier: {
        deploySlotChange: -1,
        maxSimultaneousEnemies: 2,
      },
      description: '部署槽位 -1，敵人同時只能進 2 個',
    },
    {
      id: 'treasure_guard',
      name: '寶物守衛',
      modifier: {
        extraWaves: 1,
        goldMultiplier: 2.0,
      },
      description: '多 1 波敵人，金幣 x2',
    },
    {
      id: 'sanctuary',
      name: '聖域',
      modifier: {
        allyHpRegen: 0.02,
      },
      description: '我方怪物每秒回 2% HP',
    },
    {
      id: 'trap_field',
      name: '陷阱密布',
      modifier: {
        freeTraps: 2,
      },
      description: '自動放置 2 個免費陷阱',
    },
    {
      id: 'frenzy',
      name: '狂熱',
      modifier: {
        allAttackSpeedMultiplier: 1.3,
        allHpMultiplier: 0.85,
      },
      description: '全場單位（敵我）攻速 +30%，HP -15%',
    },
  ]

  static getAllAffixes(): readonly AffixDefinition[] {
    return this.affixes
  }

  static getAffixById(id: AffixType): AffixDefinition | undefined {
    return this.affixes.find(a => a.id === id)
  }

  // ============ 消耗品查詢 ============

  private static readonly consumables: readonly ConsumableDefinition[] = [
    {
      id: 'spike_trap',
      name: '尖刺陷阱',
      type: 'trap',
      cost: 30,
      description: '一次性定點傷害，對踩到的敵人造成其最大 HP 30% 的傷害',
    },
    {
      id: 'heal',
      name: '怪物治療',
      type: 'heal',
      cost: 30,
      description: '回復 1 隻怪物 60% 最大 HP',
    },
    {
      id: 'reinforcement',
      name: '增援令',
      type: 'reinforcement',
      cost: 50,
      maxPerBattle: 1,
      description: '當場戰鬥我方上限 +1（5→6），每場限用 1 次',
    },
    {
      id: 'crystal',
      name: '強化水晶',
      type: 'crystal',
      cost: 40,
      maxPerBattle: 2,
      description: '1 隻怪物當場 ATK+5（固定值），每場限 2 次（不同怪物）',
    },
  ]

  static getAllConsumables(): readonly ConsumableDefinition[] {
    return this.consumables
  }

  static getConsumableById(id: string): ConsumableDefinition | undefined {
    return this.consumables.find(c => c.id === id)
  }

  static getConsumableByType(type: string): ConsumableDefinition | undefined {
    return this.consumables.find(c => c.type === type)
  }

  // ============ 波次配置 ============

  private static readonly waveConfigs: readonly BattleWaveConfig[] = [
    {
      roomDistance: 1,
      totalWaves: 2,
      waves: [
        { waveNumber: 1, entries: [{ heroId: 'adventurer', count: 2 }] },
        { waveNumber: 2, entries: [{ heroId: 'adventurer', count: 2 }] },
      ],
    },
    {
      roomDistance: 2,
      totalWaves: 2,
      waves: [
        { waveNumber: 1, entries: [{ heroId: 'adventurer', count: 3 }] },
        { waveNumber: 2, entries: [{ heroId: 'adventurer', count: 3 }] },
      ],
    },
    {
      roomDistance: 3,
      totalWaves: 3,
      waves: [
        { waveNumber: 1, entries: [{ heroId: 'adventurer', count: 3 }] },
        { waveNumber: 2, entries: [{ heroId: 'adventurer', count: 2 }, { heroId: 'paladin', count: 1 }] },
        { waveNumber: 3, entries: [{ heroId: 'paladin', count: 1 }] },
      ],
      variant: [
        { waveNumber: 1, entries: [{ heroId: 'adventurer', count: 3 }] },
        { waveNumber: 2, entries: [{ heroId: 'adventurer', count: 3 }] },
        { waveNumber: 3, entries: [{ heroId: 'paladin', count: 1 }, { heroId: 'adventurer', count: 1 }] },
      ],
    },
    {
      roomDistance: 4,
      totalWaves: 3,
      waves: [
        { waveNumber: 1, entries: [{ heroId: 'adventurer', count: 3 }] },
        { waveNumber: 2, entries: [{ heroId: 'adventurer', count: 2 }, { heroId: 'paladin', count: 1 }] },
        { waveNumber: 3, entries: [{ heroId: 'paladin', count: 1 }, { heroId: 'adventurer', count: 2 }] },
      ],
      variant: [
        { waveNumber: 1, entries: [{ heroId: 'adventurer', count: 2 }, { heroId: 'paladin', count: 1 }] },
        { waveNumber: 2, entries: [{ heroId: 'adventurer', count: 2 }, { heroId: 'paladin', count: 1 }] },
        { waveNumber: 3, entries: [{ heroId: 'adventurer', count: 3 }] },
      ],
    },
  ]

  static getWaveConfig(roomDistance: number): BattleWaveConfig | undefined {
    return this.waveConfigs.find(w => w.roomDistance === roomDistance)
  }

  static getAllWaveConfigs(): readonly BattleWaveConfig[] {
    return this.waveConfigs
  }
}
