import Phaser from 'phaser'
import { ExplorePhase } from './explore-phase'
import { BattlePhase } from './battle-phase'
import { ResultPhase } from './result-phase'

export enum PhaseType {
  EXPLORE = 'EXPLORE',
  BATTLE = 'BATTLE',
  RESULT = 'RESULT'
}

export interface PhaseExitOptions {
  preserveRoom?: boolean
}

export interface Phase {
  enter(): void
  update(time: number, delta: number): void
  exit(options?: PhaseExitOptions): void
}

export interface ChangePhaseOptions {
  skipCameraFade?: boolean
  exitOptions?: PhaseExitOptions
}

export class PhaseManager {
  private currentPhase: Phase | null = null
  private currentPhaseType: PhaseType | null = null
  private readonly phases: Map<PhaseType, Phase>
  private readonly scene: Phaser.Scene
  private transitioning: boolean = false

  constructor(scene: Phaser.Scene) {
    this.scene = scene
    this.phases = new Map<PhaseType, Phase>()
    this.phases.set(PhaseType.EXPLORE, new ExplorePhase(scene))
    this.phases.set(PhaseType.BATTLE, new BattlePhase(scene))
    this.phases.set(PhaseType.RESULT, new ResultPhase(scene))
  }

  changePhase(newPhaseType: PhaseType, options?: ChangePhaseOptions): void {
    if (this.transitioning) return

    const newPhase = this.phases.get(newPhaseType)
    if (!newPhase) {
      throw new Error(`Phase ${newPhaseType} not found`)
    }

    // 首次進入（無舊 phase）直接跳過過渡
    if (!this.currentPhase) {
      this.currentPhase = newPhase
      this.currentPhaseType = newPhaseType
      this.currentPhase.enter()
      return
    }

    const skipFade = options?.skipCameraFade ?? false
    const exitOptions = options?.exitOptions

    if (skipFade) {
      // 直接切換，不做 camera fade
      this.currentPhase.exit(exitOptions)
      this.currentPhase = newPhase
      this.currentPhaseType = newPhaseType
      this.currentPhase.enter()
      return
    }

    // 相機淡出 → 切換 → 淡入
    this.transitioning = true
    const cam = this.scene.cameras.main
    cam.fadeOut(150, 0, 0, 0)

    cam.once('camerafadeoutcomplete', () => {
      this.currentPhase!.exit(exitOptions)
      this.currentPhase = newPhase
      this.currentPhaseType = newPhaseType
      this.currentPhase.enter()
      cam.fadeIn(200, 0, 0, 0)
      cam.once('camerafadeincomplete', () => {
        this.transitioning = false
      })
    })
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
