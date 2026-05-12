// Editor-specific types used only by the renderer (Plugin Profile Editor window).
// Imported with relative paths — avoids the @shared alias for renderer-only concerns.

import type { StageType } from '@shared/types'

// A node in the arbitrary extra-fields tree.
// Leaf: children.length === 0 and value holds the string representation.
// Branch: children.length > 0 and value is ignored (structure lives in children).
export interface ExtraNode {
  id: string            // random key for React reconciliation — not persisted to YAML
  key: string
  value: string         // leaf value (empty string for branch nodes)
  children: ExtraNode[]
}

// One stage definition as held inside the editor. Mirrors StageDefinition but
// replaces unknown extra fields with an explicit extras tree and strips tierIndex
// (runtime field assigned by StagePlanner, not stored in YAML).
export interface EditorStage {
  id: string
  name: string
  type: StageType
  beats: number
  timerSeconds?: number
  canPass?: boolean
  description: string
  roundVisibility: string[]
  spinTime: number
  calculationSequence?: string
  extras: ExtraNode[]
}

// The full plugin config as held in the editor (and in localForage).
export interface EditorConfig {
  pluginName: string
  beatsPerTC: number
  minAdjustedTimerSeconds: number
  stages: EditorStage[]
  topLevelExtras: ExtraNode[]
}

// The working copy persisted to localForage across editor sessions.
export interface EditorWorkingCopy {
  version: 1
  isDirty: boolean      // true when editor has changes not yet submitted to disk
  syncedAt: string      // ISO timestamp of last sync from main process
  config: EditorConfig
}

// Registered stage types — must stay in sync with src/main/stages/registry.ts.
export const REGISTERED_STAGE_TYPES: StageType[] = [
  'gm-release',
  'timed',
  'surprise-determination',
  'initiative-determination',
  'action',
  'response',
  'resolution',
]

// Per-type default values used when the editor creates a new stage.
export const STAGE_TYPE_DEFAULTS: Record<StageType, Partial<EditorStage>> = {
  'gm-release':               { beats: 0, spinTime: 0,  canPass: true },
  'timed':                    { beats: 4, timerSeconds: 30, spinTime: 3, canPass: true },
  'surprise-determination':   { beats: 0, spinTime: 3,  canPass: true },
  'initiative-determination': { beats: 0, spinTime: 3,  canPass: true },
  'action':                   { beats: 4, timerSeconds: 30, spinTime: 1, canPass: true },
  'response':                 { beats: 4, timerSeconds: 30, spinTime: 1, canPass: true },
  'resolution':               { beats: 0, spinTime: 3  },
  'system-complete':          { beats: 0, spinTime: 0  },
}
