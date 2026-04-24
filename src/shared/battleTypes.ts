// Battle ledger types — shared between main process and renderer.

/** The event that caused a beat log entry to be recorded. */
export type BeatLogOperation = 'stage-start' | 'gm-release' | 'time-expired' | 'gm-pass'

/**
 * One entry in the battle beat log.
 *
 * beatsConsumed: total beats consumed in the current round at the moment this event fired.
 * Computed as (totalBeats − beatsRemaining) at the time of logging.
 *
 * Display format: "R:T:B" where R = round, T = tier (0 for preamble stages), B = beatsConsumed (1dp).
 * e.g. "1:2:4.0" = Round 1, Tier 2, 4 beats consumed at this point.
 */
export interface BeatLogEntry {
  round: number
  tierIndex?: number     // undefined for preamble stages; 0-based (tier 1 → 0). Add 1 for display.
  stageId: string
  stageName: string
  operation: BeatLogOperation
  beatsConsumed: number
}

/** All data the BattleLedger tracks about an ongoing battle. */
export interface BattleLedgerData {
  beatLog: BeatLogEntry[]
}

/** Payload sent to the renderer via the ledger:update IPC channel. */
export type BattleLedgerPayload = BattleLedgerData
