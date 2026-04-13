/**
 * Round Visibility Utilities
 *
 * Implements the round visibility rules for stage participation:
 *
 *   []       — active every round (default)
 *   A#       — active for that specific round only (only meaningful when an I# is also present)
 *   I#       — inactive from round # onward, unless an A# for that exact round is present
 *
 * A# entries without any I# in the list are redundant (warning, not error).
 * A configuration where the stage is never active is invalid (error).
 */

import type { StageDefinition } from '../../shared/types'
import { logger } from '../logger'

// ── Parsing helpers ──────────────────────────────────────────────────────────

function parseEntry(entry: string): { mode: 'A' | 'I'; round: number } {
  const mode = entry[0] as 'A' | 'I'
  const round = parseInt(entry.slice(1), 10)
  return { mode, round }
}

// ── Core evaluation ──────────────────────────────────────────────────────────

/**
 * Returns true if a stage should participate in the given round number.
 */
export function isStageActiveForRound(stage: StageDefinition, round: number): boolean {
  const list = stage.roundVisibility ?? []

  if (list.length === 0) return true

  const parsed = list.map(parseEntry)
  const iEntries = parsed.filter(e => e.mode === 'I').map(e => e.round)
  const aEntries = parsed.filter(e => e.mode === 'A').map(e => e.round)

  // No I# entries — always active regardless of any A# entries
  if (iEntries.length === 0) return true

  // Find the highest I# that is <= round (the most recent inactivation in effect)
  const applicableI = iEntries.filter(r => r <= round)
  if (applicableI.length === 0) {
    // No I# has taken effect yet — stage is active
    return true
  }

  // An I# is in effect — only active if there is an explicit A# for this exact round
  return aEntries.includes(round)
}

/**
 * Returns only the stages that are active for the given round.
 */
export function filterStagesForRound(
  stages: StageDefinition[],
  round: number
): StageDefinition[] {
  return stages.filter(stage => isStageActiveForRound(stage, round))
}

// ── Validation ───────────────────────────────────────────────────────────────

export interface VisibilityValidationResult {
  errors:   string[]
  warnings: string[]
}

/**
 * Validates the roundVisibility configuration of all stages.
 * Errors: stage is never active (invalid plugin config — must not start combat).
 * Warnings: A# entries with no I# are redundant.
 */
export function validateStagesRoundVisibility(
  stages: StageDefinition[]
): VisibilityValidationResult {
  const errors:   string[] = []
  const warnings: string[] = []

  for (const stage of stages) {
    const list = stage.roundVisibility ?? []
    if (list.length === 0) continue

    const parsed  = list.map(parseEntry)
    const iEntries = parsed.filter(e => e.mode === 'I').map(e => e.round)
    const aEntries = parsed.filter(e => e.mode === 'A').map(e => e.round)

    // Warning: A# with no I# — the A# entries have no effect
    if (iEntries.length === 0 && aEntries.length > 0) {
      const msg = `Stage "${stage.name}" (${stage.id}): roundVisibility [${list.join(', ')}] contains A# entries but no I# entries — the A# entries are redundant and have no effect.`
      warnings.push(msg)
      logger.warn({ stageId: stage.id, roundVisibility: list }, msg)
      continue
    }

    // Error: stage is never active
    // This happens when the smallest I# is 1 AND there are no A# entries.
    // (If smallest I# is 1 and there ARE A# entries, those rounds are valid.)
    // (If smallest I# is > 1, rounds 1..smallestI-1 are always active.)
    const smallestI = Math.min(...iEntries)
    if (smallestI === 1 && aEntries.length === 0) {
      const msg = `Stage "${stage.name}" (${stage.id}): roundVisibility [${list.join(', ')}] results in the stage never being active in any round. This is invalid plugin configuration.`
      errors.push(msg)
      logger.error({ stageId: stage.id, roundVisibility: list }, msg)
    }
  }

  return { errors, warnings }
}
