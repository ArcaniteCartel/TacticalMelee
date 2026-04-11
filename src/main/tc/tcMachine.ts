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
 *   tcComplete   → all stages done; waiting for GM to start next round
 *   battleEnded  → GM explicitly ended the battle out-of-band
 *
 * Events:
 *   START_COMBAT  → idle → stageActive
 *   TICK          → decrements timer on timed stages
 *   GM_RELEASE    → advances gm-release stages
 *   PASS          → advances any stage with canPass:true
 *   PAUSE         → pauses timed stage
 *   RESUME        → resumes paused stage
 *   NEXT_ROUND    → tcComplete → stageActive (round increments, stages reset)
 *   END_BATTLE    → any active state → battleEnded
 *   RESET         → any state → idle (full reset)
 */

import { createMachine, assign } from 'xstate'
import type { StageDefinition } from '../../shared/types'

export interface TCContext {
  round: number
  stages: StageDefinition[]
  currentStageIndex: number
  timerSecondsRemaining: number
  beatsRemaining: number
  totalBeats: number           // beatsPerTC from the plugin (e.g. 72)
}

export type TCEvent =
  | { type: 'START_COMBAT'; stages: StageDefinition[]; beatsPerTC: number }
  | { type: 'TICK' }
  | { type: 'GM_RELEASE' }
  | { type: 'PASS' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NEXT_ROUND' }
  | { type: 'END_BATTLE' }
  | { type: 'RESET' }

const RESET_CONTEXT: Partial<TCContext> = {
  round: 0,
  stages: [],
  currentStageIndex: 0,
  timerSecondsRemaining: 0,
  beatsRemaining: 0,
  totalBeats: 0,
}

function getTimerSeconds(stage: StageDefinition): number {
  return stage.type === 'timed' && stage.timerSeconds ? stage.timerSeconds : 0
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
  // Beats consumed by all completed (past) stages
  const completedBeats = stages
    .slice(0, currentStageIndex)
    .reduce((sum, s) => sum + s.beats, 0)

  // Beats consumed so far by the current stage
  const currentStage = stages[currentStageIndex]
  let currentConsumed = 0
  if (currentStage?.type === 'timed' && currentStage.timerSeconds) {
    const elapsed = currentStage.timerSeconds - timerSecondsRemaining
    currentConsumed = (elapsed / currentStage.timerSeconds) * currentStage.beats
  }
  // Non-timed stages consume no beats until they complete

  return Math.max(0, totalBeats - completedBeats - currentConsumed)
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
            // Timed stage — timer expired
            guard: ({ context }) => {
              const stage = context.stages[context.currentStageIndex]
              return !!stage && stage.type === 'timed' && context.timerSecondsRemaining <= 1
            },
            actions: assign(({ context }) => {
              const completedBeats = context.stages
                .slice(0, context.currentStageIndex + 1)
                .reduce((sum, s) => sum + s.beats, 0)
              return {
                timerSecondsRemaining: 0,
                beatsRemaining: Math.max(0, context.totalBeats - completedBeats),
              }
            }),
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

        GM_RELEASE: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.type === 'gm-release'
          },
          target: 'checkAdvance',
        },

        PASS: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.canPass === true
          },
          target: 'checkAdvance',
        },

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
          actions: assign(({ context }) => ({
            round: context.round + 1,
            currentStageIndex: 0,
            timerSecondsRemaining: getTimerSeconds(context.stages[0]),
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
