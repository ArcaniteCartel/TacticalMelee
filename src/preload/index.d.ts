import { ElectronAPI } from '@electron-toolkit/preload'
import type { TCStatePayload } from '../shared/types'
import type { BattleLedgerPayload } from '../shared/battleTypes'

interface TacticalMeleeAPI {
  startCombat:     () => void
  gmRelease:       () => void
  pass:            () => void
  pause:           () => void
  resume:          () => void
  nextRound:       () => void
  launchHUD:       () => void
  stageReset:      () => void
  tierReset:       () => void
  roundReset:      () => void
  endBattle:       () => void
  resetBattle:     () => void
  onDevLog:        (callback: (message: string) => void) => void
  onGmAlert:       (callback: (message: string) => void) => void
  onStateUpdate:   (callback: (state: TCStatePayload) => void) => void
  offStateUpdate:  () => void
  onLedgerUpdate:  (callback: (ledger: BattleLedgerPayload) => void) => void
  offLedgerUpdate: () => void
  onBattleEnd:     (callback: () => void) => void
  offBattleEnd:    () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: TacticalMeleeAPI
  }
}
