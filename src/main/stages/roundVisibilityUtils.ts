/**
 * Round Visibility Utilities
 *
 * Implements the round visibility rules for stage participation:
 *
 *   []       — active every round (default)
 *   A#       — active for that specific round only (only meaningful when an I# is also present)
 *   I#       — inactive from round # onward, unless an A# for that exact round is present
 *   i#       — inactive in exactly round # only; all other rounds are unaffected
 *              i# takes priority over A#/I# when they conflict on the same round
 *
 * Common patterns:
 *   ['A1', 'I2']  — round 1 only (I2 inactivates from round 2; A1 re-activates round 1)
 *   ['i1']        — round 2 and later only (round 1 suppressed; all other rounds active)
 *
 * A# entries without any I# in the list are redundant (warning, not error).
 * A# and i# on the same round conflict (i# wins; A# is redundant — warning).
 * A configuration where the stage is never active is invalid (error).
 */

import type { StageDefinition } from '../../shared/types'
import { logger } from '../logger'

// ── Parsing helpers ──────────────────────────────────────────────────────────

function parseEntry(entry: string): { mode: 'A' | 'I' | 'i'; round: number } {
  const mode = entry[0] as 'A' | 'I' | 'i'
  const round = parseInt(entry.slice(1), 10)
  return { mode, round }
}

// ── Core evaluation ──────────────────────────────────────────────────────────

/**
 * Returns true if a stage should participate in the given round number.
 *
 * Evaluation order:
 *   1. i# entries are checked first — if the current round matches any i#, the stage
 *      is inactive for this round regardless of any A# or I# entries.
 *   2. If no i# matches, the existing I#/A# machinery applies.
 */
export function isStageActiveForRound(stage: StageDefinition, round: number): boolean {
  const list = stage.roundVisibility ?? []

  if (list.length === 0) return true

  const parsed       = list.map(parseEntry)
  const iLower       = parsed.filter(e => e.mode === 'i').map(e => e.round)
  const iUpperEntries = parsed.filter(e => e.mode === 'I').map(e => e.round)
  const aEntries     = parsed.filter(e => e.mode === 'A').map(e => e.round)

  // i# takes priority: explicitly inactive in this exact round, overrides A#/I#
  if (iLower.includes(round)) return false

  // No I# entries — always active (for rounds not suppressed by i#)
  if (iUpperEntries.length === 0) return true

  // Find the highest I# that is <= round (the most recent inactivation in effect)
  const applicableI = iUpperEntries.filter(r => r <= round)
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
 *
 * Errors:
 *   - Stage is never active (e.g. I1 with no A# entries).
 *
 * Warnings:
 *   - A# entries with no I# are redundant (A# only matters when I# is also present).
 *   - A# and i# on the same round conflict; i# wins but the A# is misleading.
 */
export function validateStagesRoundVisibility(
  stages: StageDefinition[]
): VisibilityValidationResult {
  const errors:   string[] = []
  const warnings: string[] = []

  for (const stage of stages) {
    const list = stage.roundVisibility ?? []
    if (list.length === 0) continue

    const parsed       = list.map(parseEntry)
    const iLower       = parsed.filter(e => e.mode === 'i').map(e => e.round)
    const iUpperEntries = parsed.filter(e => e.mode === 'I').map(e => e.round)
    const aEntries     = parsed.filter(e => e.mode === 'A').map(e => e.round)

    // Warning: A# with no I# — the A# entries have no effect
    if (iUpperEntries.length === 0 && aEntries.length > 0) {
      const msg = `Stage "${stage.name}" (${stage.id}): roundVisibility [${list.join(', ')}] contains A# entries but no I# entries — the A# entries are redundant and have no effect.`
      warnings.push(msg)
      logger.warn({ stageId: stage.id, roundVisibility: list }, msg)
    }

    // Warning: A# and i# on the same round — i# wins, A# is misleading
    const conflictRounds = aEntries.filter(r => iLower.includes(r))
    if (conflictRounds.length > 0) {
      const msg = `Stage "${stage.name}" (${stage.id}): roundVisibility [${list.join(', ')}] has A# and i# entries for the same round(s) [${conflictRounds.join(', ')}] — i# takes priority; the A# entries for those rounds have no effect.`
      warnings.push(msg)
      logger.warn({ stageId: stage.id, roundVisibility: list, conflictRounds }, msg)
    }

    // Error: stage is never active.
    // Occurs when the smallest I# is 1 AND there are no A# entries that could activate it.
    // i# entries alone do not make a stage "never active" — unlisted rounds remain active.
    if (iUpperEntries.length > 0) {
      const smallestI = Math.min(...iUpperEntries)
      if (smallestI === 1 && aEntries.length === 0) {
        const msg = `Stage "${stage.name}" (${stage.id}): roundVisibility [${list.join(', ')}] results in the stage never being active in any round. This is invalid plugin configuration.`
        errors.push(msg)
        logger.error({ stageId: stage.id, roundVisibility: list }, msg)
      }
    }
  }

  return { errors, warnings }
}
