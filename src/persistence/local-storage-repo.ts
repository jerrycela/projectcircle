import type { AccountState } from '../state/game-state'
import { createInitialAccountState } from '../state/game-state'
import type { PlayerRepository } from './repository'

interface SaveData {
  readonly version: number
  readonly data: AccountState
  readonly timestamp: number
}

/**
 * LocalStorage 實作的玩家資料倉庫
 * 使用雙寫策略：主存檔 + 備份存檔
 */
export class LocalStorageRepository implements PlayerRepository {
  private readonly MAIN_KEY = 'projectcircle_save_main'
  private readonly BACKUP_KEY = 'projectcircle_save_backup'
  private readonly CURRENT_VERSION = 1

  async load(): Promise<AccountState> {
    try {
      const mainData = this.loadFromKey(this.MAIN_KEY)
      if (mainData) {
        return this.migrate(mainData)
      }
    } catch (error) {
      console.warn('[LocalStorageRepo] Main save failed, trying backup', error)
    }

    try {
      const backupData = this.loadFromKey(this.BACKUP_KEY)
      if (backupData) {
        return this.migrate(backupData)
      }
    } catch (error) {
      console.warn('[LocalStorageRepo] Backup save also failed', error)
    }

    return createInitialAccountState()
  }

  async save(account: AccountState): Promise<void> {
    const saveData: SaveData = {
      version: this.CURRENT_VERSION,
      data: account,
      timestamp: Date.now(),
    }

    const serialized = JSON.stringify(saveData)

    try {
      localStorage.setItem(this.MAIN_KEY, serialized)
      localStorage.setItem(this.BACKUP_KEY, serialized)
    } catch (error) {
      console.error('[LocalStorageRepo] Failed to save', error)
      throw new Error('Failed to save game data')
    }
  }

  async clear(): Promise<void> {
    localStorage.removeItem(this.MAIN_KEY)
    localStorage.removeItem(this.BACKUP_KEY)
  }

  private loadFromKey(key: string): SaveData | null {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return null
    }

    try {
      return JSON.parse(raw) as SaveData
    } catch {
      console.error(`[LocalStorageRepo] Failed to parse ${key}`)
      return null
    }
  }

  private migrate(saveData: SaveData): AccountState {
    let data = saveData.data
    let version = saveData.version

    if (version < 1) {
      // Migration v0 → v1 預埋
      version = 1
    }

    return data
  }
}
