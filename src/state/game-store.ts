/**
 * ProjectCircle - GameStore 不可變狀態管理
 * 使用 subscribe 機制實現響應式更新
 */

import type { GameState, RunState, AccountState } from './game-state'
import { createInitialGameState, createInitialRunState } from './game-state'

type StateListener = (state: GameState) => void
type Unsubscribe = () => void

/**
 * GameStore - 不可變狀態管理器
 */
export class GameStore {
  private state: GameState
  private listeners: Set<StateListener> = new Set()

  constructor(initialState?: GameState) {
    this.state = initialState ?? createInitialGameState()
  }

  /**
   * 取得當前狀態 (唯讀)
   */
  getState(): Readonly<GameState> {
    return this.state
  }

  /**
   * 更新狀態 (不可變)
   */
  dispatch(updater: (state: GameState) => GameState): void {
    const newState = updater(this.state)

    // 確保產生新物件 (不可變性檢查)
    if (newState === this.state) {
      console.warn('GameStore: updater returned same reference, state not updated')
      return
    }

    this.state = newState
    this.notifyListeners()
  }

  /**
   * 更新局內狀態 (helper)
   */
  dispatchRunState(updater: (runState: RunState) => RunState): void {
    this.dispatch(state => ({
      ...state,
      run: updater(state.run),
    }))
  }

  /**
   * 更新帳號狀態 (helper)
   */
  dispatchAccountState(updater: (accountState: AccountState) => AccountState): void {
    this.dispatch(state => ({
      ...state,
      account: updater(state.account),
    }))
  }

  /**
   * 訂閱狀態變更
   */
  subscribe(listener: StateListener): Unsubscribe {
    this.listeners.add(listener)

    // 返回取消訂閱函式
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * 重置局內狀態 (開始新局)
   */
  reset(): void {
    this.dispatch(state => ({
      ...state,
      run: createInitialRunState(),
    }))
  }

  /**
   * 完全重置 (包含帳號狀態) - 謹慎使用
   */
  resetAll(): void {
    this.state = createInitialGameState()
    this.notifyListeners()
  }

  /**
   * 通知所有訂閱者
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.state))
  }

  /**
   * 清理所有訂閱者
   */
  clearListeners(): void {
    this.listeners.clear()
  }

  /**
   * 序列化狀態 (用於存檔)
   */
  serialize(): string {
    return JSON.stringify(this.state)
  }

  /**
   * 反序列化狀態 (用於讀檔)
   */
  deserialize(json: string): void {
    try {
      const state = JSON.parse(json) as GameState
      this.state = state
      this.notifyListeners()
    } catch (error) {
      console.error('GameStore: Failed to deserialize state', error)
      throw new Error('Invalid save data')
    }
  }
}

// 全域 GameStore 實例 (Singleton)
export const gameStore = new GameStore()
