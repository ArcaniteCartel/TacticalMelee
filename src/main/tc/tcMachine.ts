/**
 * Tactical Cycle State Machine (XState v5)
 *
 * Models one full TC (round) progressing through an ordered list of stages.
 * The machine owns the state model only — timers and broadcasts are handled
 * externally in the main process by subscribing to this actor.
 *
 * States:
 *   idle         → waiting for combat to start
 *   stageActive  → a stage is currently running
 *   checkAdvance → transient: decides next stage or TC complete
 *   stagePaused  → a timed stage is paused by GM
 *   stageSpin    → stage completed; hourglass pause before advancing (spinTime > 0)
 *   tcComplete   → all stages done; waiting for GM to start next round
 *   battleEnded  → GM explicitly ended the battle out-of-band
 *
 * Events:
 *   START_COMBAT    → idle → stageActive
 *   TICK            → decrements timer on timed stages
 *   SPIN_TICK       → decrements spin timer in stageSpin
 *   SPIN_COMPLETE   → background ops finished; advance if spin timer also done
 *   SPIN_EXCEPTION  → background ops failed; advance immediately (GM alerted externally)
 *   GM_RELEASE      → advances gm-release stages; ends spin early if ops complete
 *   PASS            → advances any stage with canPass:true
 *   PAUSE           → pauses timed stage
 *   RESUME          → resumes paused stage
 *   NEXT_ROUND      → tcComplete → stageActive (round increments, new filtered stages)
 *   END_BATTLE      → any active state → battleEnded
 *   RESET           → any state → idle (full reset)
 */

import { createMachine, assign } from 'xstate'
import type { StageDefinition } from '../../shared/types'

export interface TCContext {
  round: number
  stages: StageDefinition[]
  currentStageIndex: number
  timerSecondsRemaining: number
  spinSecondsRemaining: number
  backgroundOpsComplete: boolean   // true when stage background operations are done
  beatsRemaining: number
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

const RESET_CONTEXT: Partial<TCContext> = {
  round: 0,
  stages: [],
  currentStageIndex: 0,
  timerSecondsRemaining: 0,
  spinSecondsRemaining: 0,
  backgroundOpsComplete: true,
  beatsRemaining: 0,
  totalBeats: 0,
}

function getTimerSeconds(stage: StageDefinition): number {
  return stage.type === 'timed' && stage.timerSeconds ? stage.timerSeconds : 0
}

function getSpinTime(stage: StageDefinition): number {
  return stage.spinTime ?? 0
}

/**
 * Computes beats remaining in the full TC.
 * totalBeats = beatsPerTC (e.g. 72)
 * Tracks consumption from completed stages + fraction of current timed stage.
 */
function computeBeatsRemaining(
  stages: StageDefinition[],
  currentStageIndex: number,
  timerSecondsRemaining: number,
  totalBeats: number
): number {
  const completedBeats = stages
    .slice(0, currentStageIndex)
    .reduce((sum, s) => sum + s.beats, 0)

  const currentStage = stages[currentStageIndex]
  let currentConsumed = 0
  if (currentStage?.type === 'timed' && currentStage.timerSeconds) {
    const elapsed = currentStage.timerSeconds - timerSecondsRemaining
    currentConsumed = (elapsed / currentStage.timerSeconds) * currentStage.beats
  }

  return Math.max(0, totalBeats - completedBeats - currentConsumed)
}

/**
 * Computes beats remaining after the current stage has fully completed.
 */
function beatsAfterStageComplete(context: TCContext): number {
  const completedBeats = context.stages
    .slice(0, context.currentStageIndex + 1)
    .reduce((sum, s) => sum + s.beats, 0)
  return Math.max(0, context.totalBeats - completedBeats)
}

/**
 * Assigns context for entering stageSpin from the current stage.
 * Freezes beats at stage-complete value. Spin timer defaults to backgroundOpsComplete=true
 * since no real background ops exist yet — the spin is purely a timed pause.
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
            totalBeats: event.beatsPerTC,
          })),
        },
      },
    },

    stageActive: {
      on: {
        TICK: [
          {
            // Timed stage — timer expired — has spin
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && stage.type === 'timed' &&
                context.timerSecondsRemaining <= 1 && getSpinTime(stage) > 0
            },
            actions: assign(({ context }) => spinEntryAssign(context)),
            target: 'stageSpin',
          },
          {
            // Timed stage — timer expired — no spin
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && stage.type === 'timed' &&
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
              return !!stage && stage.type === 'timed' && context.timerSecondsRemaining > 1
            },
            actions: assign(({ context }) => {
              const newTimer = context.timerSecondsRemaining - 1
              return {
                timerSecondsRemaining: newTimer,
                beatsRemaining: computeBeatsRemaining(
                  context.stages,
                  context.currentStageIndex,
                  newTimer,
                  context.totalBeats
                ),
              }
            }),
          },
        ],

        GM_RELEASE: [
          {
            // GM-release stage — has spin
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && stage.type === 'gm-release' && getSpinTime(stage) > 0
            },
            actions: assign(({ context }) => spinEntryAssign(context)),
            target: 'stageSpin',
          },
          {
            // GM-release stage — no spin
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && stage.type === 'gm-release'
            },
            target: 'checkAdvance',
          },
        ],

        PASS: [
          {
            // Passable stage — has spin
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && stage.canPass === true && getSpinTime(stage) > 0
            },
            actions: assign(({ context }) => spinEntryAssign(context)),
            target: 'stageSpin',
          },
          {
            // Passable stage — no spin
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && stage.canPass === true
            },
            target: 'checkAdvance',
          },
        ],

        PAUSE: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.type === 'timed'
          },
          target: 'stagePaused',
        },

        END_BATTLE: { target: 'battleEnded' },
        RESET:      { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    // Transient: immediately decides whether to advance to next stage or end TC
    checkAdvance: {
      always: [
        {
          guard: ({ context }) => context.currentStageIndex + 1 < context.stages.length,
          target: 'stageActive',
          actions: assign(({ context }) => {
            const nextIndex = context.currentStageIndex + 1
            const nextStage = context.stages[nextIndex]
            const timerSeconds = getTimerSeconds(nextStage)
            return {
              currentStageIndex: nextIndex,
              timerSecondsRemaining: timerSeconds,
              spinSecondsRemaining: 0,
              beatsRemaining: computeBeatsRemaining(
                context.stages, nextIndex, timerSeconds, context.totalBeats
              ),
            }
          }),
        },
        {
          target: 'tcComplete',
          actions: assign(({ context }) => ({
            beatsRemaining: Math.max(
              0,
              context.totalBeats - context.stages.reduce((s, st) => s + st.beats, 0)
            ),
          })),
        },
      ],
    },

    /**
     * Spin state: stage has completed but a post-completion pause is in effect.
     * Shows an hourglass on the HUD. Consumes no beats.
     * Advances when: spin timer reaches 0 AND backgroundOpsComplete is true.
     * GM Release ends spin early if backgroundOpsComplete is true.
     * SPIN_EXCEPTION ends spin immediately (GM is alerted externally).
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

        END_BATTLE: { target: 'battleEnded' },
        RESET:      { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    stagePaused: {
      on: {
        RESUME:     { target: 'stageActive' },
        END_BATTLE: { target: 'battleEnded' },
        RESET:      { target: 'idle', actions: assign(RESET_CONTEXT) },
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
