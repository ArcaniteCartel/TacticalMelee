/**
 * StagePlanner
 *
 * Expands the round's stage pipeline by repeating the Action Tier triad
 * (Action → Response → Resolution) as many times as the beat budget allows,
 * then adjusts the last tier's Action/Response beat allocation so the total
 * projected beat consumption equals beatsPerTC exactly.
 *
 * Tier count is determined once at round start (plan()). After every Resolution
 * spin completes, replan() recalculates only the last tier's beat allocation
 * using the actual live beatsRemaining, accounting for drift caused by partial
 * GM Releases or Passes in earlier stages.
 *
 * Calculation sequence:
 *   Each StageDefinition may carry an optional `calculationSequence` DSL string.
 *   If any stage in the pipeline declares one, the first found drives tier-count
 *   and beat-allocation logic (DSL interpreter not yet built — future extension).
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

  /**
   * Original plugin beat and timer values for the triad's adjustable stages.
   * Captured during plan() and used in all subsequent replan() calls to preserve
   * the original Action:Response beat ratio regardless of how many times it is adjusted.
   */
  private originalActionBeats   = 0
  private originalActionTimer   = 0
  private originalResponseBeats = 0
  private originalResponseTimer = 0

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
   *   5. Adjust the last tier's Action/Response beats to fill the remaining beat budget.
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

    // Capture originals for ratio-preserving adjustments throughout the round
    this.originalActionBeats   = actionTemplate.beats
    this.originalActionTimer   = actionTemplate.timerSeconds ?? 0
    this.originalResponseBeats = responseTemplate.beats
    this.originalResponseTimer = responseTemplate.timerSeconds ?? 0

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

    // Adjust last tier: first (tierCount - 1) tiers run at full beats; the last fills the remainder
    const remainder = available - (tierCount - 1) * triadBeats
    this.applyLastTierAdjustment(expanded, tierCount - 1, remainder)

    logger.info(
      { tierCount, beatsPerTC, preambleBeats, triadBeats, lastTierBeats: remainder },
      'StagePlanner: pipeline expanded'
    )

    return expanded
  }

  /**
   * Replan after every Resolution spin completes.
   *
   * Recalculates the last tier's Action/Response allocation using the actual live
   * beatsRemaining, which may differ from the initial projection because of partial
   * GM Releases or Passes in earlier stages.
   *
   * The last tier's allocation is computed as:
   *   lastTierBeats = beatsRemaining − (fullTriadsRemaining × originalTriadBeats)
   *
   * where fullTriadsRemaining = (maxTierIndex − completedTierIndex − 1).
   *
   * Returns an updated copy of the pipeline (does not mutate the input).
   * Tier count is never changed by a replan.
   */
  replan(pipeline: StageDefinition[], beatsRemaining: number, completedTierIndex: number): StageDefinition[] {
    const maxTier = this.findMaxTierIndex(pipeline)
    if (maxTier < 0) return pipeline  // no triad in pipeline — nothing to adjust

    const fullTriadsRemaining = maxTier - completedTierIndex - 1
    const fullTriadBeats      = this.originalActionBeats + this.originalResponseBeats
    const lastTierBeats       = beatsRemaining - fullTriadsRemaining * fullTriadBeats

    if (lastTierBeats < 2) {
      // Extremely unlikely — safety clamp so hard constraints (≥1 beat each) can always be met
      logger.warn(
        { beatsRemaining, fullTriadsRemaining, fullTriadBeats, lastTierBeats },
        'StagePlanner: replan produced near-zero last tier beats — clamping to minimum'
      )
      return this.applyLastTierAdjustmentCopy(pipeline, maxTier, 2)
    }

    const updated = this.applyLastTierAdjustmentCopy(pipeline, maxTier, lastTierBeats)

    logger.debug(
      { beatsRemaining, completedTierIndex, maxTier, fullTriadsRemaining, lastTierBeats },
      'StagePlanner: last tier re-adjusted after resolution'
    )

    return updated
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Returns the highest tierIndex present in the pipeline; -1 if none found. */
  private findMaxTierIndex(pipeline: StageDefinition[]): number {
    let max = -1
    for (const s of pipeline) {
      if (s.tierIndex !== undefined && s.tierIndex > max) max = s.tierIndex
    }
    return max
  }

  /**
   * Mutates the expanded array in-place to apply beat/timer adjustments to
   * the last tier's Action and Response stages.
   * Only called from plan() where the array is freshly constructed.
   */
  private applyLastTierAdjustment(
    expanded: StageDefinition[],
    lastTierIdx: number,
    beatsAvailable: number
  ): void {
    const { adjAction, adjResponse } = this.distributeBeats(beatsAvailable)
    for (let i = 0; i < expanded.length; i++) {
      const s = expanded[i]
      if (s.tierIndex !== lastTierIdx) continue
      if (s.type === 'action') {
        expanded[i] = {
          ...s,
          beats:        adjAction,
          timerSeconds: this.proRateTimer(adjAction, this.originalActionBeats, this.originalActionTimer),
        }
      } else if (s.type === 'response') {
        expanded[i] = {
          ...s,
          beats:        adjResponse,
          timerSeconds: this.proRateTimer(adjResponse, this.originalResponseBeats, this.originalResponseTimer),
        }
      }
    }
  }

  /**
   * Returns an updated pipeline copy with the last tier's Action/Response adjusted.
   * Used by replan() — the live pipeline must not be mutated in place.
   */
  private applyLastTierAdjustmentCopy(
    pipeline: StageDefinition[],
    lastTierIdx: number,
    beatsAvailable: number
  ): StageDefinition[] {
    const { adjAction, adjResponse } = this.distributeBeats(beatsAvailable)
    return pipeline.map(s => {
      if (s.tierIndex !== lastTierIdx) return s
      if (s.type === 'action') {
        return {
          ...s,
          beats:        adjAction,
          timerSeconds: this.proRateTimer(adjAction, this.originalActionBeats, this.originalActionTimer),
        }
      }
      if (s.type === 'response') {
        return {
          ...s,
          beats:        adjResponse,
          timerSeconds: this.proRateTimer(adjResponse, this.originalResponseBeats, this.originalResponseTimer),
        }
      }
      return s
    })
  }

  /**
   * Distributes beatsAvailable across Action and Response, preserving the original ratio.
   *
   * Rules (applied in order):
   *   1. If the proportional split produces exact integers, use them directly.
   *   2. Otherwise round to integers; choose the rounding with the most balanced split
   *      (minimises |adjAction − adjResponse|).
   *   3. For fractional beatsAvailable (replan path), clamp proportional result to [1, total−1].
   *   4. Hard constraint (all paths): neither stage may receive 0 beats or all beats (min 1 each).
   */
  private distributeBeats(beatsAvailable: number): { adjAction: number; adjResponse: number } {
    const a     = this.originalActionBeats
    const r     = this.originalResponseBeats
    const total = a + r

    // Safety: not enough beats to give at least 1 to each
    if (total <= 0 || beatsAvailable < 2) {
      return { adjAction: 1, adjResponse: Math.max(1, beatsAvailable - 1) }
    }

    const propA = beatsAvailable * (a / total)

    if (Number.isInteger(beatsAvailable)) {
      // Initial planning path: beatsAvailable is always an integer here.
      // Prefer exact integer split; fall back to the more balanced rounding.
      if (Number.isInteger(propA)) {
        const adjR = beatsAvailable - propA
        if (propA >= 1 && adjR >= 1) return { adjAction: propA, adjResponse: adjR }
      }

      const floorA = Math.floor(propA)
      const ceilA  = Math.ceil(propA)
      const floorR = beatsAvailable - floorA
      const ceilR  = beatsAvailable - ceilA

      const floorOk = floorA >= 1 && floorR >= 1
      const ceilOk  = ceilA  >= 1 && ceilR  >= 1

      if (floorOk && ceilOk) {
        // Pick whichever split is more balanced (smaller absolute difference)
        return Math.abs(floorA - floorR) <= Math.abs(ceilA - ceilR)
          ? { adjAction: floorA, adjResponse: floorR }
          : { adjAction: ceilA,  adjResponse: ceilR  }
      }
      if (floorOk) return { adjAction: floorA, adjResponse: floorR }
      if (ceilOk)  return { adjAction: ceilA,  adjResponse: ceilR  }
    }

    // Replan path: beatsRemaining is a running float — keep proportional, clamp to constraints.
    // round2() prevents floating-point trailing noise (e.g. 8.096000000000001 → 8.1).
    const adjA = round2(Math.max(1, Math.min(beatsAvailable - 1, propA)))
    const adjR = round2(beatsAvailable - adjA)
    return { adjAction: adjA, adjResponse: adjR }
  }

  /**
   * Pro-rates a timer proportionally to the adjusted beat allocation.
   * Rounds to whole seconds and enforces the plugin-defined minimum floor.
   *
   * Example: originalBeats=6, originalTimer=30s, adjustedBeats=4 → (4/6)×30 = 20s.
   */
  private proRateTimer(adjustedBeats: number, originalBeats: number, originalTimer: number): number {
    if (originalBeats <= 0 || originalTimer <= 0) return this.minTimerSeconds
    const raw = (adjustedBeats / originalBeats) * originalTimer
    return Math.max(this.minTimerSeconds, Math.round(raw))
  }
}
