import { ElectronAPI } from '@electron-toolkit/preload'
import type { TCStatePayload } from '../shared/types'

interface TacticalMeleeAPI {
  startCombat:    () => void
  gmRelease:      () => void
  pass:           () => void
  pause:          () => void
  resume:         () => void
  nextRound:      () => void
  launchHUD:      () => void
  endBattle:      () => void
  resetBattle:    () => void
  onStateUpdate:  (callback: (state: TCStatePayload) => void) => void
  offStateUpdate: () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: TacticalMeleeAPI
  }
}
