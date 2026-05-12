// Conversion utilities between the raw plugin config object (from main process / YAML)
// and the EditorConfig / EditorStage / ExtraNode tree used by the editor UI.

import { stringify } from 'yaml'
import type { EditorConfig, EditorStage, ExtraNode } from './editorTypes'

// Fields in the raw stage object that map to known EditorStage properties.
// Any key NOT in this set is treated as an extra field and placed in stage.extras.
const KNOWN_STAGE_FIELDS = new Set([
  'id', 'name', 'type', 'beats', 'timerSeconds', 'canPass', 'description',
  'roundVisibility', 'spinTime', 'calculationSequence',
  // tierIndex is a runtime field added by StagePlanner — never stored in YAML
  'tierIndex',
])

// Fields in the raw top-level object that map to known EditorConfig properties.
const KNOWN_TOP_FIELDS = new Set([
  'pluginName', 'beatsPerTC', 'minAdjustedTimerSeconds', 'stages',
])

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

// Recursively converts an unknown value from the parsed YAML into an ExtraNode.
function valueToExtraNode(key: string, value: unknown): ExtraNode {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const children = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => valueToExtraNode(k, v))
    return { id: genId(), key, value: '', children }
  }
  return { id: genId(), key, value: String(value ?? ''), children: [] }
}

function rawToEditorStage(raw: Record<string, unknown>): EditorStage {
  const extras: ExtraNode[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_STAGE_FIELDS.has(key)) {
      extras.push(valueToExtraNode(key, value))
    }
  }

  return {
    id:                   String(raw.id   ?? ''),
    name:                 String(raw.name ?? ''),
    type:                 (raw.type as EditorStage['type']) ?? 'timed',
    beats:                Number(raw.beats ?? 0),
    timerSeconds:         raw.timerSeconds  !== undefined ? Number(raw.timerSeconds)  : undefined,
    canPass:              raw.canPass       !== undefined ? Boolean(raw.canPass)       : undefined,
    description:          String(raw.description ?? ''),
    roundVisibility:      Array.isArray(raw.roundVisibility)
                            ? (raw.roundVisibility as string[])
                            : [],
    spinTime:             Number(raw.spinTime ?? 0),
    calculationSequence:  raw.calculationSequence !== undefined
                            ? String(raw.calculationSequence)
                            : undefined,
    extras,
  }
}

// Converts the raw config payload from main (including any extra YAML fields)
// into the editor's EditorConfig representation.
export function configToEditorConfig(raw: Record<string, unknown>): EditorConfig {
  const topLevelExtras: ExtraNode[] = []
  for (const [key, value] of Object.entries(raw)) {
    if (!KNOWN_TOP_FIELDS.has(key)) {
      topLevelExtras.push(valueToExtraNode(key, value))
    }
  }

  const rawStages = Array.isArray(raw.stages) ? (raw.stages as Record<string, unknown>[]) : []

  return {
    pluginName:             String(raw.pluginName             ?? ''),
    beatsPerTC:             Number(raw.beatsPerTC             ?? 60),
    minAdjustedTimerSeconds: Number(raw.minAdjustedTimerSeconds ?? 5),
    stages:                 rawStages.map(rawToEditorStage),
    topLevelExtras,
  }
}

// Converts an ExtraNode back to a plain JavaScript value for YAML serialisation.
function extraNodeToValue(node: ExtraNode): unknown {
  if (node.children.length === 0) {
    if (node.value === 'true')  return true
    if (node.value === 'false') return false
    const n = Number(node.value)
    if (node.value.trim() !== '' && !isNaN(n)) return n
    return node.value
  }
  const obj: Record<string, unknown> = {}
  for (const child of node.children) {
    if (child.key.trim()) obj[child.key] = extraNodeToValue(child)
  }
  return obj
}

function editorStageToObj(stage: EditorStage): Record<string, unknown> {
  const obj: Record<string, unknown> = {
    id:              stage.id,
    name:            stage.name,
    type:            stage.type,
    beats:           stage.beats,
    description:     stage.description,
    roundVisibility: stage.roundVisibility,
    spinTime:        stage.spinTime,
  }
  if (stage.timerSeconds        !== undefined) obj.timerSeconds        = stage.timerSeconds
  if (stage.canPass             !== undefined) obj.canPass             = stage.canPass
  if (stage.calculationSequence !== undefined) obj.calculationSequence = stage.calculationSequence

  for (const node of stage.extras) {
    if (node.key.trim()) obj[node.key] = extraNodeToValue(node)
  }
  return obj
}

// Serialises the editor's working config to a YAML string for save / download.
export function editorConfigToYaml(config: EditorConfig): string {
  const obj: Record<string, unknown> = {
    pluginName:              config.pluginName,
    beatsPerTC:              config.beatsPerTC,
    minAdjustedTimerSeconds: config.minAdjustedTimerSeconds,
    stages:                  config.stages.map(editorStageToObj),
  }
  for (const node of config.topLevelExtras) {
    if (node.key.trim()) obj[node.key] = extraNodeToValue(node)
  }
  return stringify(obj, { lineWidth: 0 })
}
