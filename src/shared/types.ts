// Shared types used by both the main process and renderer/HUD.

/**
 * Round visibility entry for a stage.
 *
 * A#  — stage is active and visible for that specific round only (overrides an active I#)
 * I#  — stage becomes inactive and hidden from round # onward, unless overridden by A#
 *
 * Default (empty list): active every round.
 * A# entries with no I# present are redundant (warning logged, not an error).
 * A configuration that results in the stage never being active is invalid (error).
 */
export type RoundVisibilityEntry = `A${number}` | `I${number}`

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
   * Undefined for preamble stages (non-triad stages that precede the Action Tier).
   * Used by the StagePlanner to identify and adjust the last tier during replan.
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
  /** Total beats in one TC (beatsPerTC from the plugin, e.g. 72). Used to compute the burndown fraction. */
  totalBeats: number
}

/** WebSocket message envelope used by the LAN server to broadcast TC state to connected HUD clients. */
export interface WSMessage {
  type: 'TC_STATE'
  payload: TCStatePayload
}
