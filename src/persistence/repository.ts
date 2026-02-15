import type { AccountState } from '../state/game-state'

/**
 * PlayerRepository 介面
 * 定義玩家資料持久化的標準操作
 */
export interface PlayerRepository {
  load(): Promise<AccountState>
  save(account: AccountState): Promise<void>
  clear(): Promise<void>
}
