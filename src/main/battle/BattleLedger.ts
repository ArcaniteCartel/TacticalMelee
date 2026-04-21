/**
 * BattleLedger — Memento-pattern battle state container.
 *
 * Maintains a labeled snapshot stack so that Stage Reset and Tier Reset can
 * restore the ledger to its pre-stage or pre-tier state, keeping the beat log
 * consistent with the machine's beat-clock restoration.
 *
 * Stack structure:
 *   [round]              — pushed when combat starts or a new round begins
 *   [round, tier]        — pushed when entering a new Action tier
 *   [round, tier, stage] — pushed when a stage enters stageActive
 *
 * Invariant: max 3 entries at any point during combat.
 *
 * Push:
 *   'round'  — on START_COMBAT / NEXT_ROUND (IPC handlers)
 *   'tier'   — on entering Action stageGMHold for a new tier (subscription)
 *   'stage'  — on entering stageActive (subscription)
 *
 * Discard (normal completion — no restore):
 *   'stage'  — on stageActive → stageSpin (stage ended)
 *   'tier'   — on Resolution stageSpin → stageGMHold (tier completed normally)
 *
 * Restore (reset — roll back beat log to pre-entry state):
 *   'stage'  — Stage Reset (stageActive / stageSpin → stageGMHold, same index)
 *   'tier'   — Tier Reset (stageActive / stageSpin → stageGMHold, backward index)
 */

import type { BattleLedgerData, BeatLogEntry } from '../../shared/battleTypes'

interface LabeledSnapshot {
  type: 'round' | 'tier' | 'stage'
  data: BattleLedgerData
}

export class BattleLedger {
  private data: BattleLedgerData = { beatLog: [] }
  private stack: LabeledSnapshot[] = []

  // ── Clone strategy ────────────────────────────────────────────────────────
  // Swap this method out if JSON clone becomes a performance concern.
  cloneData(d: BattleLedgerData): BattleLedgerData {
    return JSON.parse(JSON.stringify(d))
  }

  // ── Stack operations ──────────────────────────────────────────────────────

  /** Save a labeled snapshot of the current data. */
  push(type: 'round' | 'tier' | 'stage'): void {
    this.stack.push({ type, data: this.cloneData(this.data) })
  }

  /**
   * Discard the topmost snapshot of the given type and any entries above it.
   * Does not restore state — used on normal (non-reset) stage/tier completion.
   */
  discard(type: 'round' | 'tier' | 'stage'): void {
    while (this.stack.length > 0 && this.stack[this.stack.length - 1].type !== type) {
      this.stack.pop()
    }
    if (this.stack.length > 0) this.stack.pop()
  }

  /**
   * Restore current data from the topmost snapshot of the given type, discarding
   * any entries above it. Used on Stage Reset and Tier Reset.
   */
  restore(type: 'round' | 'tier' | 'stage'): void {
    while (this.stack.length > 0 && this.stack[this.stack.length - 1].type !== type) {
      this.stack.pop()
    }
    if (this.stack.length > 0) {
      this.data = this.cloneData(this.stack.pop()!.data)
    }
  }

  // ── Data operations ───────────────────────────────────────────────────────

  /** Append a beat log entry to the current ledger data. */
  logEntry(entry: BeatLogEntry): void {
    this.data.beatLog.push(entry)
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Full reset — clears both data and stack. Call on RESET (back to idle). */
  reset(): void {
    this.data = { beatLog: [] }
    this.stack = []
  }

  /** Read the current ledger data for broadcasting. */
  getData(): BattleLedgerData {
    return this.data
  }
}
