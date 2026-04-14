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
}

export interface PluginConfig {
  pluginName: string
  beatsPerTC: number
  stages: StageDefinition[]
}

// The state payload broadcast to all clients on every TC state change.
export interface TCStatePayload {
  machineState: string   // 'idle' | 'stageActive' | 'stagePaused' | 'stageSpin' | 'stageSpinPaused' | 'tcComplete' | 'battleEnded'
  round: number
  stages: StageDefinition[]
  currentStageIndex: number
  timerSecondsRemaining: number
  spinSecondsRemaining: number
  backgroundOpsComplete: boolean
  beatsRemaining: number
  totalBeats: number
}

export interface WSMessage {
  type: 'TC_STATE'
  payload: TCStatePayload
}
