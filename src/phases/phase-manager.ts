import Phaser from 'phaser'
import { ExplorePhase } from './explore-phase'
import { BattlePhase } from './battle-phase'
import { ResultPhase } from './result-phase'

export enum PhaseType {
  EXPLORE = 'EXPLORE',
  BATTLE = 'BATTLE',
  RESULT = 'RESULT'
}

export interface Phase {
  enter(): void
  update(time: number, delta: number): void
  exit(): void
}

export class PhaseManager {
  private currentPhase: Phase | null = null
  private currentPhaseType: PhaseType | null = null
  private readonly phases: Map<PhaseType, Phase>

  constructor(scene: Phaser.Scene) {
    this.phases = new Map<PhaseType, Phase>()
    this.phases.set(PhaseType.EXPLORE, new ExplorePhase(scene))
    this.phases.set(PhaseType.BATTLE, new BattlePhase(scene))
    this.phases.set(PhaseType.RESULT, new ResultPhase(scene))
  }

  changePhase(newPhaseType: PhaseType): void {
    if (this.currentPhase) {
      this.currentPhase.exit()
    }

    const newPhase = this.phases.get(newPhaseType)
    if (!newPhase) {
      throw new Error(`Phase ${newPhaseType} not found`)
    }

    this.currentPhase = newPhase
    this.currentPhaseType = newPhaseType
    this.currentPhase.enter()
  }

  update(time: number, delta: number): void {
    if (this.currentPhase) {
      this.currentPhase.update(time, delta)
    }
  }

  getCurrentPhaseType(): PhaseType | null {
    return this.currentPhaseType
  }
}
