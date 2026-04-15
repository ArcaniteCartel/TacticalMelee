/**
 * Tactical Cycle State Machine (XState v5)
 *
 * Models one full TC (round) progressing through an ordered list of stages.
 * The machine owns the state model only — timers and broadcasts are handled
 * externally in the main process by subscribing to this actor.
 *
 * States:
 *   idle            → waiting for combat to start
 *   stageGMHold     → action/response: GM prep phase before player countdown starts (no timer)
 *   stageActive     → a stage is currently running
 *   checkAdvance    → transient: decides next stage or TC complete
 *   stagePaused     → a stage is paused by GM (resumes to stageActive)
 *   stageSpin       → stage completed; hourglass pause before advancing (spinTime > 0)
 *   stageSpinPaused → spin is paused by GM (resumes to stageSpin)
 *   tcComplete      → all stages done; waiting for GM to start next round
 *   battleEnded     → GM explicitly ended the battle out-of-band
 *
 * Events:
 *   START_COMBAT    → idle → stageActive
 *   TICK            → decrements timer on timed stages
 *   SPIN_TICK       → decrements spin timer in stageSpin
 *   SPIN_COMPLETE   → background ops finished; advance if spin timer also done
 *   SPIN_EXCEPTION  → background ops failed; advance immediately (GM alerted externally)
 *   GM_RELEASE      → stageGMHold: starts player countdown; stageActive: ends early (partial beats); spin: ends early
 *   PASS            → skips stage entirely (zero beats consumed); any stage with canPass:true
 *   PAUSE           → pauses any non-gm-release stage (stageActive or stageSpin); NOT stageGMHold
 *   RESUME          → resumes from stagePaused or stageSpinPaused
 *   NEXT_ROUND       → tcComplete → stageActive (round increments, new filtered stages)
 *   UPDATE_PIPELINE  → any mid-combat state → replaces stages[] with StagePlanner replan output
 *   END_BATTLE       → any active state → battleEnded
 *   RESET            → any state → idle (full reset)
 *
 * Beat semantics:
 *   GM Release (early end) — beats consumed proportionally to elapsed timer time
 *   GM Pass    (skip)      — zero beats consumed; beatsRemaining restored to stage-entry value
 *   Natural expiry         — full stage beats consumed
 */

import { createMachine, assign } from 'xstate'
import type { StageDefinition } from '../../shared/types'
import { isTimedStageType } from '../../shared/types'

export interface TCContext {
  round: number
  stages: StageDefinition[]
  currentStageIndex: number
  timerSecondsRemaining: number
  spinSecondsRemaining: number
  backgroundOpsComplete: boolean   // true when stage background operations are done
  beatsRemaining: number
  beatsAtStageEntry: number        // beatsRemaining captured when the current stage was entered
  totalBeats: number               // beatsPerTC from the plugin (e.g. 72)
}

export type TCEvent =
  | { type: 'START_COMBAT'; stages: StageDefinition[]; beatsPerTC: number }
  | { type: 'TICK' }
  | { type: 'SPIN_TICK' }
  | { type: 'SPIN_COMPLETE' }
  | { type: 'SPIN_EXCEPTION' }
  | { type: 'GM_RELEASE' }
  | { type: 'PASS' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NEXT_ROUND'; stages: StageDefinition[] }
  | { type: 'END_BATTLE' }
  | { type: 'RESET' }
  /**
   * Sent by the StagePlanner after every Resolution spin completes.
   * Replaces stages[] in context with a re-adjusted pipeline (last tier beat
   * allocations recalculated from actual live beatsRemaining). Tier count is
   * never changed by this event — only the last tier's beats/timers update.
   */
  | { type: 'UPDATE_PIPELINE'; stages: StageDefinition[] }

const RESET_CONTEXT: Partial<TCContext> = {
  round: 0,
  stages: [],
  currentStageIndex: 0,
  timerSecondsRemaining: 0,
  spinSecondsRemaining: 0,
  backgroundOpsComplete: true,
  beatsRemaining: 0,
  beatsAtStageEntry: 0,
  totalBeats: 0,
}

function getTimerSeconds(stage: StageDefinition): number {
  return isTimedStageType(stage.type) && stage.timerSeconds ? stage.timerSeconds : 0
}

function getSpinTime(stage: StageDefinition): number {
  return stage.spinTime ?? 0
}

/**
 * Returns true for stage types that enter a GM hold phase before the player countdown starts.
 * In this phase the timer does not run and beats do not tick. GM Release starts the timer;
 * GM Pass skips the stage entirely (zero beats, no spin).
 */
function isGMHoldStageType(stage: StageDefinition): boolean {
  return stage.type === 'action' || stage.type === 'response'
}

/**
 * Returns true for system-computation stages that auto-advance to spin on entering stageActive.
 * All non-timed, non-gm-release stages qualify — including passable ones.
 * canPass on a system stage means the GM can end the spin early, not that the stage skips spin.
 */
function isAutoAdvanceSystemStage(stage: StageDefinition): boolean {
  return !isTimedStageType(stage.type) && stage.type !== 'gm-release'
}

/**
 * Computes live beats remaining during a timed stage.
 * Uses beatsAtStageEntry as the base so partial consumption from prior GM Releases is preserved.
 */
function computeBeatsRemaining(
  beatsAtStageEntry: number,
  stage: StageDefinition,
  timerSecondsRemaining: number
): number {
  if (!isTimedStageType(stage.type) || !stage.timerSeconds) return beatsAtStageEntry
  const elapsed = stage.timerSeconds - timerSecondsRemaining
  const consumed = (elapsed / stage.timerSeconds) * stage.beats
  return Math.max(0, beatsAtStageEntry - consumed)
}

/**
 * Computes beats remaining after the current stage has fully and naturally completed.
 * Uses beatsAtStageEntry as the base — preserves partial consumption from earlier stages.
 */
function beatsAfterStageComplete(context: TCContext): number {
  const stage = context.stages[context.currentStageIndex]
  return Math.max(0, context.beatsAtStageEntry - (stage?.beats ?? 0))
}

/**
 * Assigns context for entering stageSpin from the current stage (natural or auto-advance).
 * Charges full stage beats (timer ran to completion or stage had 0 beats).
 */
function spinEntryAssign(context: TCContext): Partial<TCContext> {
  const stage = context.stages[context.currentStageIndex]
  return {
    timerSecondsRemaining: 0,
    spinSecondsRemaining: getSpinTime(stage),
    backgroundOpsComplete: true,
    beatsRemaining: beatsAfterStageComplete(context),
  }
}

/**
 * Assigns context for entering stageSpin via GM Release (early end).
 * Preserves current live beatsRemaining (partial consumption for timed stages).
 */
function spinEntryAssignRelease(context: TCContext): Partial<TCContext> {
  const stage = context.stages[context.currentStageIndex]
  return {
    timerSecondsRemaining: 0,
    spinSecondsRemaining: getSpinTime(stage),
    backgroundOpsComplete: true,
    beatsRemaining: context.beatsRemaining,  // partial beats for timed; unchanged for 0-beat stages
  }
}

/**
 * Assigns context for entering stageSpin via GM Pass (skip).
 * Restores beatsRemaining to stage-entry value — zero beats consumed.
 */
function spinEntryAssignPass(context: TCContext): Partial<TCContext> {
  const stage = context.stages[context.currentStageIndex]
  return {
    timerSecondsRemaining: 0,
    spinSecondsRemaining: getSpinTime(stage),
    backgroundOpsComplete: true,
    beatsRemaining: context.beatsAtStageEntry,
  }
}

export const tcMachine = createMachine({
  id: 'tacticalCycle',
  types: {} as { context: TCContext; events: TCEvent },
  initial: 'idle',
  context: {
    round: 0,
    stages: [],
    currentStageIndex: 0,
    timerSecondsRemaining: 0,
    spinSecondsRemaining: 0,
    backgroundOpsComplete: true,
    beatsRemaining: 0,
    beatsAtStageEntry: 0,
    totalBeats: 0,
  },

  states: {
    idle: {
      on: {
        START_COMBAT: {
          target: 'stageActive',
          actions: assign(({ event }) => ({
            round: 1,
            stages: event.stages,
            currentStageIndex: 0,
            timerSecondsRemaining: getTimerSeconds(event.stages[0]),
            spinSecondsRemaining: 0,
            backgroundOpsComplete: true,
            beatsRemaining: event.beatsPerTC,
            beatsAtStageEntry: event.beatsPerTC,
            totalBeats: event.beatsPerTC,
          })),
        },
      },
    },

    stageActive: {
      // Auto-advance: non-passable system stages enter spin immediately (no timer, no manual trigger).
      // onEnter hook fires before this resolves; spin represents the background computation window.
      always: [
        {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && isAutoAdvanceSystemStage(stage) && getSpinTime(stage) > 0
          },
          actions: assign(({ context }) => spinEntryAssign(context)),
          target: 'stageSpin',
        },
        {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && isAutoAdvanceSystemStage(stage) && getSpinTime(stage) === 0
          },
          target: 'checkAdvance',
        },
      ],

      on: {
        TICK: [
          {
            // Timed stage — timer expired — has spin
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && isTimedStageType(stage.type) &&
                context.timerSecondsRemaining <= 1 && getSpinTime(stage) > 0
            },
            actions: assign(({ context }) => spinEntryAssign(context)),
            target: 'stageSpin',
          },
          {
            // Timed stage — timer expired — no spin
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && isTimedStageType(stage.type) &&
                context.timerSecondsRemaining <= 1 && getSpinTime(stage) === 0
            },
            actions: assign(({ context }) => ({
              timerSecondsRemaining: 0,
              beatsRemaining: beatsAfterStageComplete(context),
            })),
            target: 'checkAdvance',
          },
          {
            // Timed stage — still running: decrement
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && isTimedStageType(stage.type) && context.timerSecondsRemaining > 1
            },
            actions: assign(({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              const newTimer = context.timerSecondsRemaining - 1
              return {
                timerSecondsRemaining: newTimer,
                beatsRemaining: computeBeatsRemaining(
                  context.beatsAtStageEntry,
                  stage,
                  newTimer,
                ),
              }
            }),
          },
        ],

        // GM Release: ends stage early. Beats consumed = elapsed timer proportion (partial for timed;
        // unchanged for 0-beat stages). Applies to gm-release type AND timed-like stages.
        GM_RELEASE: [
          {
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && (stage.type === 'gm-release' || isTimedStageType(stage.type)) &&
                getSpinTime(stage) > 0
            },
            actions: assign(({ context }) => spinEntryAssignRelease(context)),
            target: 'stageSpin',
          },
          {
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && (stage.type === 'gm-release' || isTimedStageType(stage.type))
            },
            actions: assign(({ context }) => ({
              timerSecondsRemaining: 0,
              beatsRemaining: context.beatsRemaining,
            })),
            target: 'checkAdvance',
          },
        ],

        // GM Pass: skips stage entirely. Zero beats consumed — beatsRemaining restored to entry value.
        PASS: [
          {
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && stage.canPass === true && getSpinTime(stage) > 0
            },
            actions: assign(({ context }) => spinEntryAssignPass(context)),
            target: 'stageSpin',
          },
          {
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && stage.canPass === true
            },
            actions: assign(({ context }) => ({
              beatsRemaining: context.beatsAtStageEntry,
            })),
            target: 'checkAdvance',
          },
        ],

        // Pause allowed for all stages except gm-release type.
        PAUSE: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.type !== 'gm-release'
          },
          target: 'stagePaused',
        },

        // StagePlanner replan: replace pipeline with last-tier-adjusted copy.
        // Beat math is unaffected — beatsAtStageEntry and beatsRemaining are not touched.
        UPDATE_PIPELINE: { actions: assign({ stages: ({ event }) => event.stages }) },

        END_BATTLE: { target: 'battleEnded' },
        RESET:      { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    // Transient: immediately decides whether to advance to next stage or end TC.
    // beatsRemaining is NOT recomputed here — it is already correct from the previous stage's
    // exit assignment (natural expiry → full beats charged; GM Release → partial; GM Pass → zero).
    // Recomputing from stage.beats would overwrite partial consumption with the full stage total.
    // action/response stages enter stageGMHold first (GM prep phase before timer starts).
    checkAdvance: {
      always: [
        {
          // action/response: enter GM hold phase — timer has not started yet
          guard: ({ context }) => {
            const nextIndex = context.currentStageIndex + 1
            if (nextIndex >= context.stages.length) return false
            return isGMHoldStageType(context.stages[nextIndex])
          },
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const nextIndex = context.currentStageIndex + 1
            return {
              currentStageIndex: nextIndex,
              timerSecondsRemaining: 0,   // timer has not started; set when GM releases
              spinSecondsRemaining: 0,
              beatsAtStageEntry: context.beatsRemaining,
            }
          }),
        },
        {
          guard: ({ context }) => context.currentStageIndex + 1 < context.stages.length,
          target: 'stageActive',
          actions: assign(({ context }) => {
            const nextIndex = context.currentStageIndex + 1
            const nextStage = context.stages[nextIndex]
            return {
              currentStageIndex: nextIndex,
              timerSecondsRemaining: getTimerSeconds(nextStage),
              spinSecondsRemaining: 0,
              beatsAtStageEntry: context.beatsRemaining,
            }
          }),
        },
        {
          target: 'tcComplete',
        },
      ],
    },

    /**
     * GM Hold state: action/response stages enter here before the player countdown starts.
     * The GM uses this window to plan NPC actions/responses before opening the player timer.
     * Timer does not run; beats do not tick. No pause allowed (serves no purpose with no timer).
     *
     * GM Release → stageActive  (starts the player countdown and beat burndown)
     * GM Pass    → checkAdvance (skips stage entirely; zero beats; no spin)
     */
    stageGMHold: {
      on: {
        // GM Release: start the player countdown — set the timer, transition to stageActive
        GM_RELEASE: {
          target: 'stageActive',
          actions: assign(({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return {
              timerSecondsRemaining: getTimerSeconds(stage),
            }
          }),
        },

        // GM Pass: skip stage entirely — zero beats, bypass spin (nothing ran, nothing to compute)
        PASS: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.canPass === true
          },
          actions: assign(({ context }) => ({
            beatsRemaining: context.beatsAtStageEntry,
          })),
          target: 'checkAdvance',
        },

        // StagePlanner replan arriving while in GM hold (most common case).
        // The timer has not started yet; timerSeconds will be read fresh on GM Release.
        UPDATE_PIPELINE: { actions: assign({ stages: ({ event }) => event.stages }) },

        END_BATTLE: { target: 'battleEnded' },
        RESET:      { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    /**
     * Spin state: stage has completed but a post-completion pause is in effect.
     * Shows an hourglass on the HUD. Consumes no beats.
     * Advances when: spin timer reaches 0 AND backgroundOpsComplete is true.
     * GM Release ends spin early if backgroundOpsComplete is true.
     * SPIN_EXCEPTION ends spin immediately (GM is alerted externally).
     * GM can pause spin (→ stageSpinPaused); all non-gm-release stages support this.
     */
    stageSpin: {
      on: {
        SPIN_TICK: [
          {
            // Spin timer expired and ops complete — advance
            guard: ({ context }) => context.spinSecondsRemaining <= 1 && context.backgroundOpsComplete,
            actions: assign({ spinSecondsRemaining: 0 }),
            target: 'checkAdvance',
          },
          {
            // Spin timer expired but ops not done — extended spin, stay
            guard: ({ context }) => context.spinSecondsRemaining <= 1 && !context.backgroundOpsComplete,
            actions: assign({ spinSecondsRemaining: 0 }),
          },
          {
            // Spin timer still counting down
            actions: assign(({ context }) => ({
              spinSecondsRemaining: context.spinSecondsRemaining - 1,
            })),
          },
        ],

        SPIN_COMPLETE: [
          {
            // Ops finished and spin timer already done — advance immediately
            guard: ({ context }) => context.spinSecondsRemaining <= 0,
            actions: assign({ backgroundOpsComplete: true }),
            target: 'checkAdvance',
          },
          {
            // Ops finished but spin timer still running — mark complete, keep waiting
            actions: assign({ backgroundOpsComplete: true }),
          },
        ],

        // Ops threw an exception — advance immediately (GM alerted externally)
        SPIN_EXCEPTION: { target: 'checkAdvance' },

        // GM can end spin early, but only if background ops are complete
        GM_RELEASE: {
          guard: ({ context }) => context.backgroundOpsComplete,
          target: 'checkAdvance',
        },

        PAUSE: { target: 'stageSpinPaused' },

        // StagePlanner replan can arrive during spin (e.g. if a prior resolution triggered it
        // while a subsequent resolution is still in its spin window — edge case).
        UPDATE_PIPELINE: { actions: assign({ stages: ({ event }) => event.stages }) },

        END_BATTLE: { target: 'battleEnded' },
        RESET:      { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    /**
     * Spin-paused state: spin timer is frozen. Resumes back into stageSpin.
     * The spin ticker (external interval) stops when this state is active.
     */
    stageSpinPaused: {
      on: {
        RESUME:          { target: 'stageSpin' },
        UPDATE_PIPELINE: { actions: assign({ stages: ({ event }) => event.stages }) },
        END_BATTLE:      { target: 'battleEnded' },
        RESET:           { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    stagePaused: {
      on: {
        RESUME:          { target: 'stageActive' },
        UPDATE_PIPELINE: { actions: assign({ stages: ({ event }) => event.stages }) },
        END_BATTLE:      { target: 'battleEnded' },
        RESET:           { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    tcComplete: {
      on: {
        NEXT_ROUND: {
          target: 'stageActive',
          actions: assign(({ event, context }) => ({
            round: context.round + 1,
            stages: event.stages,
            currentStageIndex: 0,
            timerSecondsRemaining: getTimerSeconds(event.stages[0]),
            spinSecondsRemaining: 0,
            backgroundOpsComplete: true,
            beatsRemaining: context.totalBeats,
            beatsAtStageEntry: context.totalBeats,
          })),
        },
        END_BATTLE: { target: 'battleEnded' },
        RESET:      { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    battleEnded: {
      on: {
        RESET: { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },
  },
})
