// Shared types used by both the main process and renderer/HUD.

/**
 * Round visibility entry for a stage.
 *
 * Controls which rounds a stage participates in. Evaluated by roundVisibilityUtils.ts.
 *
 * Semantics:
 *   A#  — active for that specific round only. Only has effect when an I# is also present
 *         to suppress other rounds; without an I#, the A# is redundant (warning logged).
 *   I#  — inactive from round # onward (inclusive). A stage with I1 and no A# is never active.
 *         An A# for the exact round re-activates it for that round despite an I# being in effect.
 *   i#  — inactive for exactly round # only. All other rounds are unaffected by i#.
 *         Takes highest priority: overrides A# and I# if they conflict on the same round.
 *
 * Default (empty list): active every round.
 *
 * Evaluation cascade (implemented in isStageActiveForRound):
 *   1. If any i# matches the current round → inactive. Stop.
 *   2. If no I# entries exist → active. Stop.
 *   3. Find the highest I# that is ≤ currentRound. If none, stage is active (I# not yet in effect).
 *   4. An I# is in effect → active only if an explicit A# matches this exact round.
 *
 * Common patterns:
 *   []           — active every round
 *   ['A1','I2']  — round 1 only (I2 suppresses rounds 2+; A1 re-activates round 1)
 *   ['i1']       — round 2+ only (i1 suppresses round 1; all other rounds default-active)
 *
 * Validation errors and warnings (roundVisibilityUtils.validateStagesRoundVisibility):
 *   ERROR:   I1 with no A# entries → stage never active in any round (invalid plugin config)
 *   WARNING: A# entries present but no I# → A# entries are redundant, have no effect
 *   WARNING: A# and i# on the same round → i# wins; A# for that round is misleading
 */
export type RoundVisibilityEntry = `A${number}` | `I${number}` | `i${number}`

export type StageType =
  | 'gm-release'
  | 'timed'
  | 'system-complete'
  | 'surprise-determination'
  | 'initiative-determination'
  | 'action'
  | 'response'
  | 'resolution'

/** Returns true for stage types that use a real-time countdown timer. */
export function isTimedStageType(type: StageType): boolean {
  return type === 'timed' || type === 'action' || type === 'response'
}

export interface StageDefinition {
  id: string
  name: string
  type: StageType
  beats: number                                // in-world beats consumed by this stage
  timerSeconds?: number                        // real-world seconds (timed stages only)
  canPass?: boolean                            // players or GM can pass this stage early
  description: string                          // message shown in the HUD message area
  roundVisibility: RoundVisibilityEntry[]      // which rounds this stage participates in
  spinTime: number                             // seconds to pause (hourglass) after stage completes before advancing
  /**
   * DSL expression string providing a custom StagePlanner calculation sequence.
   * If set, the StagePlanner uses this expression to determine tier count and beat
   * allocation instead of the system default arithmetic.
   * Currently unpopulated — slot reserved for future plugin-driven planning logic.
   */
  calculationSequence?: string
  /**
   * Zero-based tier index assigned by the StagePlanner to generated triad copies.
   * Undefined for preamble stages (non-triad stages before the first Action Tier).
   * Used by the machine to identify whether a stage belongs to a tier (for Tier Reset guards)
   * and by the subscription in index.ts to detect tier boundaries during ledger management.
   * Value matches the loop index in StagePlanner.plan(): tier 1 → tierIndex 0, etc.
   */
  tierIndex?: number
}

export interface PluginConfig {
  pluginName: string
  beatsPerTC: number
  stages: StageDefinition[]
  /**
   * Minimum timer (seconds) the StagePlanner may assign when pro-rating an
   * adjusted Action or Response stage. Prevents a beat-budget adjustment from
   * producing a meaninglessly short countdown. Defined per plugin.
   */
  minAdjustedTimerSeconds: number
}

/**
 * State payload broadcast to all clients (renderer and HUD) on every TC state change.
 * Sent via IPC (tc:state-update) to the GM Dashboard and via WebSocket to the Group HUD.
 */
export interface TCStatePayload {
  /** Current XState machine state: 'idle' | 'stageGMHold' | 'stageActive' | 'stagePaused' | 'stageSpin' | 'stageSpinPaused' | 'tcComplete' | 'battleEnded' */
  machineState: string
  /** Current round number. 0 when idle (combat not yet started). */
  round: number
  /** The filtered stage list for the current round (excludes stages inactive for this round). */
  stages: StageDefinition[]
  /** Index into stages[] pointing at the currently active stage. */
  currentStageIndex: number
  /** Seconds remaining on the active stage's player countdown. 0 when not a timed stage or in stageGMHold. */
  timerSecondsRemaining: number
  /** Seconds remaining in the post-stage spin window. 0 outside of stageSpin/stageSpinPaused. */
  spinSecondsRemaining: number
  /** True when the current stage's background computation has finished. Gates GM Release during stageSpin. */
  backgroundOpsComplete: boolean
  /** Live beat ledger: beats remaining in the current TC. Updated every TICK during timed stages. */
  beatsRemaining: number
  /** Total beats in one TC (beatsPerTC from the plugin, e.g. 60 for the Standard plugin). Used to compute the burndown fraction. */
  totalBeats: number
}

import type { BattleLedgerPayload } from './battleTypes'

/** WebSocket message envelope used by the LAN server to broadcast state to connected HUD clients. */
export type WSMessage =
  | { type: 'TC_STATE';     payload: TCStatePayload }
  | { type: 'LEDGER_STATE'; payload: BattleLedgerPayload }
