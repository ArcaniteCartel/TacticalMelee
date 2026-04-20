/**
 * StagePlanner
 *
 * Expands the round's stage pipeline by repeating the Action Tier triad
 * (Action → Response → Resolution) as many times as the beat budget allows.
 * No last-tier beat adjustment is made — all tiers run at the plugin-defined
 * beat cost. Unelapsed beats from early GM Releases carry forward to the next
 * beat-consuming stage via applyCarryForward().
 *
 * Tier count is determined once at round start (plan()). Carry-forward is
 * applied inline in index.ts after each GM Release: the surplus beats
 * (stage.beats − beats_consumed) are added to the next beat-consuming stage
 * in the pipeline and its timer is extended proportionally.
 *
 * Beat carry-forward routing:
 *   Pre-Encounter early release → surplus added to first Action stage (Tier 1)
 *   Action early release        → surplus added to Response (same tier)
 *   Response early release      → surplus added to Action (next tier)
 *   Final Response early release → no next stage; surplus logged and discarded
 *
 * "Next beat-consuming stage" is the first stage after the source with beats > 0.
 * 0-beat system stages (Resolution, Surprise Determination, etc.) are naturally
 * skipped by this rule.
 *
 * Calculation sequence:
 *   Each StageDefinition may carry an optional `calculationSequence` DSL string.
 *   If any stage in the pipeline declares one, the first found is logged as a
 *   warning (DSL interpreter not yet built — future extension).
 *   If no stage declares a sequence, the system default arithmetic is used.
 *
 * ID collision avoidance:
 *   Plugin definitions use simple IDs (e.g. 'action'). Duplicate triads would
 *   share these IDs, breaking React keys and hook dispatch. The StagePlanner
 *   stamps every generated copy with a scoped ID: `{originalId}-t{tierNumber}`
 *   (e.g. 'action-t1', 'response-t2'). Stage type is unchanged — all registry
 *   dispatch uses type, not id.
 */

import type { StageDefinition } from '../../shared/types'
import { logger } from '../logger'

/** Stage types that form the Action Tier triad. */
const TRIAD_TYPES = new Set<StageDefinition['type']>(['action', 'response', 'resolution'])

function isTriadType(type: StageDefinition['type']): boolean {
  return TRIAD_TYPES.has(type)
}

/** Rounds a beat value to at most 2 decimal places, avoiding floating-point trailing noise. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export class StagePlanner {
  /** Minimum timer (seconds) for any StagePlanner-adjusted stage. Plugin-defined. */
  private readonly minTimerSeconds: number

  constructor(minTimerSeconds: number) {
    this.minTimerSeconds = minTimerSeconds
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Initial pipeline expansion. Called at START_COMBAT and NEXT_ROUND.
   *
   * Algorithm:
   *   1. Separate preamble stages (everything before the first triad stage) from the template.
   *   2. Compute available beats = beatsPerTC − preamble beats.
   *   3. Greedy floor: tierCount = ⌊available / triadBeats⌋.
   *   4. Build expanded pipeline: preamble + tierCount copies of the triad, each with a
   *      scoped ID (action-t1, response-t1, ...) and a tierIndex.
   *
   * No last-tier beat adjustment is made. Tiers run at their plugin-defined beat cost.
   * Carry-forward from early releases handles beat redistribution organically.
   *
   * If the pipeline contains no triad stages, it is returned unchanged.
   * If a calculationSequence DSL is found on any stage, the first one wins (stub — not yet executed).
   */
  plan(pipeline: StageDefinition[], beatsPerTC: number): StageDefinition[] {
    // Check for plugin-declared calculation sequence (DSL — future extension)
    const dslStage = pipeline.find(s => s.calculationSequence)
    if (dslStage) {
      logger.warn(
        { stageId: dslStage.id, calculationSequence: dslStage.calculationSequence },
        'StagePlanner: calculationSequence DSL found but interpreter not yet built — using default'
      )
    }

    const actionTemplate     = pipeline.find(s => s.type === 'action')
    const responseTemplate   = pipeline.find(s => s.type === 'response')
    const resolutionTemplate = pipeline.find(s => s.type === 'resolution')

    if (!actionTemplate || !responseTemplate || !resolutionTemplate) {
      logger.debug('StagePlanner: no triad found — pipeline unchanged')
      return [...pipeline]
    }

    // Preamble = all stages before the first triad stage; their beats are a fixed cost
    const triadStartIndex = pipeline.findIndex(s => isTriadType(s.type))
    const preamble        = pipeline.slice(0, triadStartIndex)
    const preambleBeats   = preamble.reduce((sum, s) => sum + s.beats, 0)

    // Beats available for triads after the preamble has been accounted for
    const triadBeats = actionTemplate.beats + responseTemplate.beats  // resolution = 0b always
    const available  = beatsPerTC - preambleBeats

    if (triadBeats <= 0 || available <= 0) {
      logger.warn({ triadBeats, available }, 'StagePlanner: cannot fit any tiers — pipeline unchanged')
      return [...pipeline]
    }

    const tierCount = Math.floor(available / triadBeats)
    if (tierCount === 0) {
      logger.warn({ available, triadBeats }, 'StagePlanner: beat budget too small for one full tier')
      return [...pipeline]
    }

    // Build the expanded pipeline: preamble followed by tierCount triad copies
    const expanded: StageDefinition[] = [...preamble]
    for (let t = 0; t < tierCount; t++) {
      const tierNum = t + 1
      expanded.push(
        { ...actionTemplate,     id: `action-t${tierNum}`,     tierIndex: t },
        { ...responseTemplate,   id: `response-t${tierNum}`,   tierIndex: t },
        { ...resolutionTemplate, id: `resolution-t${tierNum}`, tierIndex: t },
      )
    }

    logger.info(
      { tierCount, beatsPerTC, preambleBeats, triadBeats },
      'StagePlanner: pipeline expanded'
    )

    return expanded
  }

  /**
   * Applies carry-forward surplus beats to the next beat-consuming stage after the source.
   *
   * Called by index.ts after detecting that a GM Release left surplus beats
   * (surplusBeats = stage.beats − beatsConsumed > 0). The surplus is added to the
   * next stage in the pipeline whose beats > 0. Its timer is extended proportionally
   * using the current beats-per-second ratio (preserving pace, subject to minTimerSeconds).
   *
   * Returns an updated pipeline copy. If no target stage is found (e.g. last Response
   * of the final tier), the pipeline is returned unchanged and the surplus is logged
   * as discarded.
   *
   * Note: carry-forward additions to the target stage persist through Stage Reset and
   * Tier Reset — only the beat clock is restored, not the pipeline stage beats.
   */
  applyCarryForward(
    pipeline: StageDefinition[],
    fromStageIndex: number,
    surplusBeats: number
  ): StageDefinition[] {
    if (surplusBeats <= 0.05) return pipeline  // below threshold — nothing meaningful to carry

    // Find the next beat-consuming stage after the source
    const targetIndex = pipeline.findIndex((s, i) => i > fromStageIndex && s.beats > 0)

    if (targetIndex === -1) {
      // No next beat-consuming stage — last Response of the final tier.
      // Surplus is forfeited and will be logged as residual at TC completion.
      logger.debug(
        { fromStageIndex, surplusBeats },
        'StagePlanner: carry-forward has no target — surplus forfeited'
      )
      return pipeline
    }

    const target    = pipeline[targetIndex]
    const newBeats  = round2(target.beats + surplusBeats)

    // Extend the timer proportionally to the new beat allocation.
    // Uses the current beats/timer ratio so the pace (seconds per beat) is preserved.
    const newTimer  = target.timerSeconds
      ? this.proRateTimer(newBeats, target.beats, target.timerSeconds)
      : undefined

    logger.debug(
      { fromStageIndex, targetIndex, targetId: target.id, surplusBeats, newBeats, newTimer },
      'StagePlanner: carry-forward applied'
    )

    return pipeline.map((s, i) => {
      if (i !== targetIndex) return s
      return {
        ...s,
        beats: newBeats,
        ...(newTimer !== undefined ? { timerSeconds: newTimer } : {}),
      }
    })
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Pro-rates a timer proportionally to the adjusted beat allocation.
   * Rounds to whole seconds and enforces the plugin-defined minimum floor.
   *
   * Example: originalBeats=4, originalTimer=30s, adjustedBeats=6 → (6/4)×30 = 45s.
   */
  private proRateTimer(adjustedBeats: number, originalBeats: number, originalTimer: number): number {
    if (originalBeats <= 0 || originalTimer <= 0) return this.minTimerSeconds
    const raw = (adjustedBeats / originalBeats) * originalTimer
    return Math.max(this.minTimerSeconds, Math.round(raw))
  }
}
