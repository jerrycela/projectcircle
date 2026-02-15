/**
 * ProjectCircle - EventBus 事件匯流排
 * 使用 discriminated union 提供型別安全的事件系統
 */

// 事件型別定義 (Discriminated Union)
export type GameEvent =
  | { type: 'MONSTER_DEPLOYED'; monsterId: string; slotIndex: number }
  | { type: 'MONSTER_EVOLVED'; monsterId: string; evolutionPath: string }
  | { type: 'MONSTER_DIED'; monsterId: string }
  | { type: 'HERO_KILLED'; heroId: string }
  | { type: 'HERO_SPAWNED'; heroId: string; lane: number }
  | { type: 'ROOM_PLACED'; roomId: string }
  | { type: 'COMBO_ACTIVATED'; comboType: string; multiplier: number }
  | { type: 'GOLD_EARNED'; amount: number; source: string }
  | { type: 'GOLD_SPENT'; amount: number; purpose: string }
  | { type: 'BATTLE_WON'; roomIndex: number }
  | { type: 'BATTLE_LOST'; roomIndex: number }
  | { type: 'RUN_COMPLETED'; success: boolean }
  | { type: 'TRAP_TRIGGERED'; trapId: string; damage: number }
  | { type: 'TRAP_PLACED'; trapId: string; position: { x: number; y: number } }
  | { type: 'WALL_BROKEN'; wallId: string }
  | { type: 'EVOLUTION_CHOSEN'; monsterId: string; path: string }
  | { type: 'WAVE_STARTED'; waveNumber: number }
  | { type: 'WAVE_COMPLETED'; waveNumber: number }
  | { type: 'PHASE_CHANGED'; oldPhase: string; newPhase: string }
  | { type: 'CHICKENS_SPAWNED'; count: number }
  | { type: 'ROOM_BONUS_APPLIED'; goldMultiplier: number; attackSpeedMultiplier: number; chickenCount: number; passiveGold: number }

// 事件回呼型別
type EventCallback<T extends GameEvent = GameEvent> = (event: T) => void

/**
 * EventBus - 型別安全的事件匯流排
 */
export class EventBus {
  private listeners: Map<GameEvent['type'], Set<EventCallback>> = new Map()

  /**
   * 註冊事件監聽器
   */
  on<T extends GameEvent['type']>(
    eventType: T,
    callback: EventCallback<Extract<GameEvent, { type: T }>>
  ): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(callback as EventCallback)
  }

  /**
   * 移除事件監聽器
   */
  off<T extends GameEvent['type']>(
    eventType: T,
    callback: EventCallback<Extract<GameEvent, { type: T }>>
  ): void {
    const callbacks = this.listeners.get(eventType)
    if (callbacks) {
      callbacks.delete(callback as EventCallback)
    }
  }

  /**
   * 觸發事件
   */
  emit<T extends GameEvent>(event: T): void {
    const callbacks = this.listeners.get(event.type)
    if (callbacks) {
      callbacks.forEach(callback => callback(event))
    }
  }

  /**
   * 移除所有監聽器 (清理用)
   */
  removeAllListeners(): void {
    this.listeners.clear()
  }

  /**
   * 移除特定事件型別的所有監聽器
   */
  removeAllListenersForEvent(eventType: GameEvent['type']): void {
    this.listeners.delete(eventType)
  }
}

// 全域 EventBus 實例 (Singleton pattern)
export const eventBus = new EventBus()
