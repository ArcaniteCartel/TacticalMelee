// Shared types used by both the main process and renderer/HUD.

export interface StageDefinition {
  id: string
  name: string
  type: 'gm-release' | 'timed' | 'system-complete'
  beats: number           // in-world beats consumed by this stage
  timerSeconds?: number   // real-world seconds (timed stages only)
  canPass?: boolean       // players or GM can pass this stage early
  description: string     // message shown in the HUD message area
}

export interface PluginConfig {
  pluginName: string
  beatsPerTC: number
  stages: StageDefinition[]
}

// The state payload broadcast to all clients on every TC state change.
export interface TCStatePayload {
  machineState: string   // 'idle' | 'stageActive' | 'stagePaused' | 'tcComplete'
  round: number
  stages: StageDefinition[]
  currentStageIndex: number
  timerSecondsRemaining: number
  beatsRemaining: number
  totalBeats: number
}

export interface WSMessage {
  type: 'TC_STATE'
  payload: TCStatePayload
}
