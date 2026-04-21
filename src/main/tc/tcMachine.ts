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
 *   GM_RELEASE      → stageGMHold: starts player countdown; stageActive: ends early; surplus beats carry forward
 *   PASS            → skips stage; in stageActive charges full beat cost; in stageGMHold costs zero
 *   PAUSE           → pauses any non-gm-release stage (stageActive or stageSpin); NOT stageGMHold
 *   RESUME          → resumes from stagePaused or stageSpinPaused
 *   STAGE_RESET     → stageActive/stageSpin: restarts current stage; restores beats to beatsAtStageEntry
 *   TIER_RESET      → stageActive/stageSpin (tier stages only): restarts entire tier; restores beats to beatsAtTierEntry
 *   NEXT_ROUND       → tcComplete → stageActive (round increments, new filtered stages)
 *   UPDATE_PIPELINE  → any mid-combat state → replaces stages[] with carry-forward-adjusted copy from StagePlanner
 *   END_BATTLE       → any active state → battleEnded
 *   RESET            → any state → idle (full reset)
 *
 * Beat semantics:
 *   GM Release (early end) — beats consumed proportionally to elapsed timer time;
 *                            unelapsed beats carry forward to the next beat-consuming stage
 *   GM Pass               — full stage beat cost charged in all contexts (stageActive or stageGMHold);
 *                            no carry-forward; keeps burndown consistent with remaining tier totals
 *   Natural expiry         — full stage beats consumed
 *   Stage Reset            — beat clock restored to beatsAtStageEntry; stage repeats from GM hold
 *   Tier Reset             — beat clock restored to beatsAtTierEntry; entire tier repeats from GM hold
 */

import { createMachine, assign } from 'xstate'
import type { StageDefinition } from '../../shared/types'
import { isTimedStageType } from '../../shared/types'

/**
 * Snapshot of the three tier-stage beat allocations taken at the moment we enter
 * the tier's Action stageGMHold. Used by STAGE_RESET and TIER_RESET to restore the
 * pipeline to its entry-time values, undoing any intra-tier carry-forward that may
 * have been applied to subsequent stages (e.g. Action early-release surplus → Response).
 *
 * Captured before any intra-tier carry has occurred, so it always represents base
 * (or pre-tier carry-forward) allocations for each stage in the tier.
 */
export interface TierStageSnapshot {
  actionIndex: number
  actionBeats: number
  actionTimerSeconds: number
  responseIndex: number
  responseBeats: number
  responseTimerSeconds: number
}

export interface TCContext {
  round: number
  stages: StageDefinition[]
  currentStageIndex: number
  timerSecondsRemaining: number
  spinSecondsRemaining: number
  backgroundOpsComplete: boolean   // true when stage background operations are done
  beatsRemaining: number
  /**
   * beatsRemaining at the moment the current stage was entered (set in checkAdvance).
   *
   * INVARIANT: Must never be mutated mid-stage. It is the fixed reference point for:
   *   - Surplus carry-forward: surplusBeats = beatsRemaining − (beatsAtStageEntry − stage.beats)
   *   - Stage Reset beat restoration: machine restores beatsRemaining to this value
   *   - PASS beat charging: beatsRemaining = max(0, beatsAtStageEntry − stage.beats)
   *
   * If beatsAtStageEntry were changed mid-stage (e.g. by a difficulty adjustment), the surplus
   * formula would produce an incorrect carry-forward, charging beats that were already consumed
   * or crediting beats that were never in the budget. Treat as read-only after stage entry.
   */
  beatsAtStageEntry: number
  beatsAtTierEntry: number         // beatsRemaining at the moment the current tier's Action stage was entered; used by TIER_RESET
  totalBeats: number               // beatsPerTC from the plugin (e.g. 60)
  /**
   * Beat/timer allocations of the current tier's Action and Response stages, snapshotted
   * when we first enter the tier (checkAdvance → stageGMHold for Action). Null outside
   * of an active tier. Used by STAGE_RESET (to restore stages after the current one within
   * the tier) and TIER_RESET (to restore all tier stages) — preventing double-counting when
   * carry-forward has already been applied to later stages.
   */
  tierStageSnapshot: TierStageSnapshot | null
}

export type TCEvent =
  | { type: 'START_COMBAT'; stages: StageDefinition[]; beatsPerTC: number }
  | { type: 'TICK' }
  | { type: 'SPIN_TICK' }
  | { type: 'SPIN_COMPLETE' }
  | { type: 'SPIN_EXCEPTION' }
  | { type: 'GM_RELEASE' }
  /**
   * Skips the current stage with full beat cost in all contexts.
   * stageActive:  full stage beat cost charged from beatsAtStageEntry (characters did nothing)
   * stageGMHold:  full stage beat cost charged (the window existed regardless of timer state)
   * Neither path produces carry-forward — no surplus to redistribute.
   */
  | { type: 'PASS' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  /**
   * Restarts the current stage from its beginning.
   * Beat clock restored to beatsAtStageEntry. Any carry-forward already applied to this
   * stage's beat allocation is preserved. Machine returns to stageGMHold.
   * Available in stageActive, stagePaused, stageSpin, and stageSpinPaused.
   */
  | { type: 'STAGE_RESET' }
  /**
   * Restarts the entire current Action Tier from its opening Action stage.
   * Beat clock restored to beatsAtTierEntry. Machine returns to stageGMHold for the
   * tier's Action stage. Available for tier stages in stageActive, stagePaused,
   * stageSpin, stageSpinPaused, and stageGMHold (when not the first stage of the tier).
   */
  | { type: 'TIER_RESET' }
  /**
   * Restarts the entire current round from stage 0.
   * Beat clock restored to totalBeats; stage pipeline rebuilt from scratch for this round.
   * Available in stageGMHold when currentStageIndex > 0 (i.e., not the very first stage).
   */
  | { type: 'ROUND_RESET'; stages: StageDefinition[] }
  | { type: 'NEXT_ROUND'; stages: StageDefinition[] }
  | { type: 'END_BATTLE' }
  | { type: 'RESET' }
  /**
   * Sent by the StagePlanner after a GM Release to apply carry-forward surplus beats
   * to the next beat-consuming stage in the pipeline. Also received during stageGMHold
   * (most common case — timer has not started yet so updated timerSeconds is picked up
   * fresh on GM Release).
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
  beatsAtTierEntry: 0,
  totalBeats: 0,
  tierStageSnapshot: null,
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
 * GM Pass skips the stage entirely (zero beats, no spin) from hold; full cost from stageActive.
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

// ── Beat consumption at spin/advance entry ────────────────────────────────
//
// Three distinct beat accounting paths, each producing a different beatsRemaining:
//
//   Scenario          Function                  beatsRemaining formula
//   ─────────────────────────────────────────────────────────────────────────────────
//   Natural expiry    spinEntryAssign           beatsAtStageEntry − stage.beats
//   (or 0-beat auto)  (full charge)             (full stage cost consumed)
//
//   GM Release        spinEntryAssignRelease    context.beatsRemaining (live value)
//   (early end)       (partial charge)          (already decremented by TICK events;
//                                                surplus = live − (entry − stage.beats))
//
//   GM Pass           spinEntryAssignPass       beatsAtStageEntry − stage.beats
//   (skip from        (full charge)             (full cost even though timer never ran;
//   stageActive)                                 the window existed in the timeline)
//
// Note: GM Pass from stageGMHold (not stageActive) costs the same full beat amount but
// is applied inline in the PASS handler there (not via spinEntryAssignPass) because
// GM Pass from hold does NOT enter spin — it goes directly to checkAdvance.

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
 * The caller (index.ts subscription) detects the surplus and sends UPDATE_PIPELINE
 * to carry unconsumed beats forward to the next beat-consuming stage.
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
 * Assigns context for entering stageSpin via GM Pass (skip) during stageActive.
 * Charges the full stage beat cost — characters did nothing during this window.
 * Contrast with GM Pass from stageGMHold, which costs zero (timer never started).
 */
function spinEntryAssignPass(context: TCContext): Partial<TCContext> {
  const stage = context.stages[context.currentStageIndex]
  return {
    timerSecondsRemaining: 0,
    spinSecondsRemaining: getSpinTime(stage),
    backgroundOpsComplete: true,
    beatsRemaining: Math.max(0, context.beatsAtStageEntry - (stage?.beats ?? 0)),
  }
}

/**
 * Finds the index of the Action stage belonging to the given tierIndex.
 * Returns -1 if not found (should not happen in a well-formed pipeline).
 */
function findTierActionIndex(stages: StageDefinition[], tierIndex: number): number {
  return stages.findIndex(s => s.tierIndex === tierIndex && s.type === 'action')
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
    beatsAtTierEntry: 0,
    totalBeats: 0,
    tierStageSnapshot: null,
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
            beatsAtTierEntry: 0,
            totalBeats: event.beatsPerTC,
            tierStageSnapshot: null,
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

        // GM Release: ends stage early. Beats consumed = elapsed timer proportion (partial for timed).
        // Surplus (unconsumed) beats are detected by index.ts and sent back as UPDATE_PIPELINE
        // to extend the next beat-consuming stage. Applies to gm-release type AND timed stages.
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

        // GM Pass: skips stage with FULL beat cost charged (characters did nothing).
        // beatsRemaining = beatsAtStageEntry - stage.beats (no carry-forward).
        // Contrast with stageGMHold Pass, which costs zero (timer never started).
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
              beatsRemaining: Math.max(0, context.beatsAtStageEntry - (context.stages[context.currentStageIndex]?.beats ?? 0)),
            })),
            target: 'checkAdvance',
          },
        ],

        // Pause allowed for all timed stages; excluded for gm-release (no meaningful timer to freeze).
        // stageGMHold is also excluded by design — it has no PAUSE handler at all (see state comment).
        // IMPORTANT: this guard must stay in sync with the canPause boolean in GmControls.tsx.
        PAUSE: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.type !== 'gm-release'
          },
          target: 'stagePaused',
        },

        // Stage Reset: restarts the current stage from the beginning.
        // Beat clock restored to beatsAtStageEntry. If resetting the Action stage, also
        // restores the Response stage's beats/timer from the tier snapshot — undoing any
        // intra-tier carry-forward (Action early-release surplus → Response) already applied.
        STAGE_RESET: {
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const currentStage = context.stages[context.currentStageIndex]
            const snap = context.tierStageSnapshot
            // Only restore Response when resetting Action; other stages carry their own state.
            const stages = snap && currentStage?.type === 'action'
              ? context.stages.map((s, i) => {
                  if (i !== snap.responseIndex) return s
                  return {
                    ...s,
                    beats: snap.responseBeats,
                    ...(snap.responseTimerSeconds > 0 ? { timerSeconds: snap.responseTimerSeconds } : {}),
                  }
                })
              : context.stages
            return { timerSecondsRemaining: 0, spinSecondsRemaining: 0, beatsRemaining: context.beatsAtStageEntry, stages }
          }),
        },

        // Tier Reset: restarts the entire Action Tier from its opening Action stage.
        // Beat clock restored to beatsAtTierEntry; currentStageIndex set to tier's Action stage.
        // Both Action and Response beats/timers are restored from the tier snapshot, undoing
        // any intra-tier carry-forward or pipeline mutations within this tier.
        TIER_RESET: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.tierIndex !== undefined
          },
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            const actionIndex = findTierActionIndex(context.stages, stage.tierIndex!)
            const snap = context.tierStageSnapshot
            const stages = snap
              ? context.stages.map((s, i) => {
                  if (i === snap.actionIndex) {
                    return { ...s, beats: snap.actionBeats, ...(snap.actionTimerSeconds > 0 ? { timerSeconds: snap.actionTimerSeconds } : {}) }
                  }
                  if (i === snap.responseIndex) {
                    return { ...s, beats: snap.responseBeats, ...(snap.responseTimerSeconds > 0 ? { timerSeconds: snap.responseTimerSeconds } : {}) }
                  }
                  return s
                })
              : context.stages
            return {
              currentStageIndex: actionIndex >= 0 ? actionIndex : context.currentStageIndex,
              timerSecondsRemaining: 0,
              spinSecondsRemaining: 0,
              beatsRemaining: context.beatsAtTierEntry,
              beatsAtStageEntry: context.beatsAtTierEntry,
              stages,
            }
          }),
        },

        // StagePlanner carry-forward: replace pipeline with carry-forward-adjusted copy.
        // Beat math is unaffected — beatsAtStageEntry and beatsRemaining are not touched.
        UPDATE_PIPELINE: { actions: assign({ stages: ({ event }) => event.stages }) },

        END_BATTLE: { target: 'battleEnded' },
        RESET:      { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    // ── checkAdvance — Transient routing state ────────────────────────────────
    //
    // XState v5 resolves 'always' transitions synchronously and immediately — checkAdvance
    // is never truly "resting" in this state; it passes through in the same microtask.
    // The subscriber in index.ts MUST skip checkAdvance explicitly (it checks for it by name)
    // to prevent hook dispatch, ledger writes, and broadcast from firing on the transient
    // intermediate state before XState settles on the real target (stageGMHold, stageActive,
    // or tcComplete). Without the skip, prevMachineState would be contaminated with
    // 'checkAdvance' rather than the actual prior stable state, breaking all downstream
    // transition detection logic.
    //
    // beatsRemaining is NOT recomputed here — it is already correct from the previous stage's
    // exit assignment (natural expiry → full beats charged; GM Release → partial; GM Pass → full cost).
    // action/response stages enter stageGMHold first (GM prep phase before timer starts).
    // When entering the Action stage of an Action Tier, beatsAtTierEntry and tierStageSnapshot
    // are captured here (see tier-entry assign block below).
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
            const nextStage = context.stages[nextIndex]
            // Capture tier entry beats and stage allocations when entering a new tier's Action.
            // beatsAtTierEntry feeds TIER_RESET's beat-clock restore.
            // tierStageSnapshot feeds STAGE_RESET/TIER_RESET's pipeline-stage restore,
            // undoing any intra-tier carry-forward that may have modified later stages.
            const isTierEntry = nextStage.type === 'action' && nextStage.tierIndex !== undefined
            if (!isTierEntry) {
              return {
                currentStageIndex: nextIndex,
                timerSecondsRemaining: 0,
                spinSecondsRemaining: 0,
                beatsAtStageEntry: context.beatsRemaining,
              }
            }
            // Locate the Response stage for this tier (same tierIndex, comes after Action)
            const responseIdx = context.stages.findIndex(
              (s, i) => i > nextIndex &&
                s.tierIndex === nextStage.tierIndex &&
                s.type === 'response'
            )
            const tierStageSnapshot: TierStageSnapshot | null = responseIdx >= 0 ? {
              actionIndex:         nextIndex,
              actionBeats:         nextStage.beats,
              actionTimerSeconds:  nextStage.timerSeconds ?? 0,
              responseIndex:       responseIdx,
              responseBeats:       context.stages[responseIdx].beats,
              responseTimerSeconds: context.stages[responseIdx].timerSeconds ?? 0,
            } : null
            return {
              currentStageIndex: nextIndex,
              timerSecondsRemaining: 0,
              spinSecondsRemaining: 0,
              beatsAtStageEntry:   context.beatsRemaining,
              beatsAtTierEntry:    context.beatsRemaining,
              tierStageSnapshot,
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
     * GM Hold state — GM prep phase before the player countdown begins.
     *
     * Design rationale:
     *   TacticalMelee requires all players AND all NPCs to act simultaneously within a shared
     *   countdown window. Players can see the timer and react in real time. The GM, however,
     *   controls multiple NPCs with complex interactions and cannot realistically plan all NPC
     *   actions in the same compressed window that players have. Without a dedicated prep phase,
     *   the GM would constantly be asking for more time, defeating the purpose of the countdown.
     *
     *   stageGMHold gives the GM unlimited prep time before the player clock opens. The HUD
     *   displays "GM is preparing" so players know to wait. When the GM is ready, GM Release
     *   starts the countdown for everyone simultaneously.
     *
     * Mechanics:
     *   - Entered from checkAdvance for action and response stage types (isGMHoldStageType guard).
     *   - Timer is frozen (timerSecondsRemaining = 0); beats do not tick; burndown does not move.
     *   - Pause is not available in this state — there is no running timer to pause.
     *   - Only action and response stages enter GM Hold; all other types skip directly to stageActive.
     *
     * Transitions:
     *   GM Release → stageActive  (sets timerSecondsRemaining; starts player countdown + beat burn)
     *   GM Pass    → checkAdvance (skips the stage; full beat cost charged; no spin)
     *   TIER_RESET → stageGMHold  (Response hold only; backs up to Action hold; restores tier beats)
     *   ROUND_RESET → checkAdvance → stageActive/stageGMHold at index 0 (rebuilds from round start)
     *
     * Note on pause in stageGMHold: explicitly omitted by design. With no timer running, pausing
     * has no mechanical effect. This is enforced in GmControls.tsx (canPause excludes isGMHold)
     * and the machine simply has no PAUSE handler in this state.
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

        // GM Pass from hold: full beat cost charged — the stage window existed in the timeline
        // regardless of whether the timer ever started. This keeps the burndown consistent
        // with the remaining tier totals; free passes would leave beats the pipeline can't absorb.
        PASS: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.canPass === true
          },
          actions: assign(({ context }) => ({
            beatsRemaining: Math.max(0, context.beatsAtStageEntry - (context.stages[context.currentStageIndex]?.beats ?? 0)),
          })),
          target: 'checkAdvance',
        },

        // StagePlanner carry-forward arriving while in GM hold.
        // The timer has not started yet; timerSeconds will be read fresh on GM Release.
        //
        // Also refreshes tierStageSnapshot with the updated allocations so that
        // Stage Reset and Tier Reset restore to the carry-inclusive entry values,
        // not the pre-carry base. This handles deferred cross-tier carry (Response →
        // next tier's Action) which is applied in the same subscription cycle that
        // transitions into stageGMHold — arriving here before the GM touches anything.
        UPDATE_PIPELINE: {
          actions: assign(({ context, event }) => {
            const newStages = event.stages
            const snap = context.tierStageSnapshot
            if (!snap) return { stages: newStages }
            // Refresh only Action and Response entries in the snapshot from the new stages.
            // "Current snapshot value" = the tier-entry base captured when we first entered
            // the tier in checkAdvance — before any intra-tier carry (Action surplus → Response)
            // has been applied. At tier entry (the typical case for arriving here) no intra-tier
            // carry has occurred yet, so newStages[responseIdx].beats is still the base value
            // and the snapshot update is a no-op for Response. This handles deferred cross-tier
            // carry (from a previous tier's Resolution spin completing), which may update Action
            // but not Response — we still want the snapshot to reflect the new Action allocation.
            const updatedSnap: TierStageSnapshot = {
              ...snap,
              actionBeats:         newStages[snap.actionIndex]?.beats         ?? snap.actionBeats,
              actionTimerSeconds:  newStages[snap.actionIndex]?.timerSeconds  ?? snap.actionTimerSeconds,
              responseBeats:       newStages[snap.responseIndex]?.beats       ?? snap.responseBeats,
              responseTimerSeconds: newStages[snap.responseIndex]?.timerSeconds ?? snap.responseTimerSeconds,
            }
            return { stages: newStages, tierStageSnapshot: updatedSnap }
          }),
        },

        // Tier Reset from Response stageGMHold: back up to the tier's Action stage.
        // Guard: stage must be a tier stage AND not the first stage in the tier (action).
        // Only Response qualifies in the standard pipeline — Action's GM hold is the entry point.
        TIER_RESET: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.tierIndex !== undefined && stage.type !== 'action'
          },
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            const actionIndex = findTierActionIndex(context.stages, stage.tierIndex!)
            const snap = context.tierStageSnapshot
            const stages = snap
              ? context.stages.map((s, i) => {
                  if (i === snap.actionIndex) {
                    return { ...s, beats: snap.actionBeats, ...(snap.actionTimerSeconds > 0 ? { timerSeconds: snap.actionTimerSeconds } : {}) }
                  }
                  if (i === snap.responseIndex) {
                    return { ...s, beats: snap.responseBeats, ...(snap.responseTimerSeconds > 0 ? { timerSeconds: snap.responseTimerSeconds } : {}) }
                  }
                  return s
                })
              : context.stages
            return {
              currentStageIndex: actionIndex >= 0 ? actionIndex : context.currentStageIndex,
              timerSecondsRemaining: 0,
              spinSecondsRemaining: 0,
              beatsRemaining: context.beatsAtTierEntry,
              beatsAtStageEntry: context.beatsAtTierEntry,
              stages,
            }
          }),
        },

        // Round Reset: restarts the entire round from stage 0.
        // Beat clock restored to totalBeats; fresh pipeline provided via event.
        // Guard: not the very first stage of the round (currentStageIndex > 0).
        // Targets checkAdvance with currentStageIndex = -1 so checkAdvance advances to 0,
        // routing to stageGMHold or stageActive depending on stage 0's type.
        ROUND_RESET: {
          guard: ({ context }) => context.currentStageIndex > 0,
          target: 'checkAdvance',
          actions: assign(({ context, event }) => ({
            stages: event.stages,
            currentStageIndex: -1,
            timerSecondsRemaining: 0,
            spinSecondsRemaining: 0,
            backgroundOpsComplete: true,
            beatsRemaining: context.totalBeats,
            beatsAtStageEntry: context.totalBeats,
            beatsAtTierEntry: 0,
            tierStageSnapshot: null,
          })),
        },

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

        // Stage Reset during spin: cancel spin, restart current stage from GM hold.
        // If resetting the Action stage, restores Response beats/timer from tier snapshot to
        // undo intra-tier carry-forward that was applied when Action exited to this spin.
        STAGE_RESET: {
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const currentStage = context.stages[context.currentStageIndex]
            const snap = context.tierStageSnapshot
            const stages = snap && currentStage?.type === 'action'
              ? context.stages.map((s, i) => {
                  if (i !== snap.responseIndex) return s
                  return {
                    ...s,
                    beats: snap.responseBeats,
                    ...(snap.responseTimerSeconds > 0 ? { timerSeconds: snap.responseTimerSeconds } : {}),
                  }
                })
              : context.stages
            return { timerSecondsRemaining: 0, spinSecondsRemaining: 0, beatsRemaining: context.beatsAtStageEntry, stages }
          }),
        },

        // Tier Reset during spin: cancel spin, restart entire tier from its Action stage.
        // Restores both Action and Response from snapshot to undo all intra-tier mutations.
        TIER_RESET: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.tierIndex !== undefined
          },
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            const actionIndex = findTierActionIndex(context.stages, stage.tierIndex!)
            const snap = context.tierStageSnapshot
            const stages = snap
              ? context.stages.map((s, i) => {
                  if (i === snap.actionIndex) {
                    return { ...s, beats: snap.actionBeats, ...(snap.actionTimerSeconds > 0 ? { timerSeconds: snap.actionTimerSeconds } : {}) }
                  }
                  if (i === snap.responseIndex) {
                    return { ...s, beats: snap.responseBeats, ...(snap.responseTimerSeconds > 0 ? { timerSeconds: snap.responseTimerSeconds } : {}) }
                  }
                  return s
                })
              : context.stages
            return {
              currentStageIndex: actionIndex >= 0 ? actionIndex : context.currentStageIndex,
              timerSecondsRemaining: 0,
              spinSecondsRemaining: 0,
              beatsRemaining: context.beatsAtTierEntry,
              beatsAtStageEntry: context.beatsAtTierEntry,
              stages,
            }
          }),
        },

        // StagePlanner carry-forward can arrive during spin (carry-forward was detected on
        // stage exit and the UPDATE_PIPELINE event may arrive before spin completes).
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

        STAGE_RESET: {
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const currentStage = context.stages[context.currentStageIndex]
            const snap = context.tierStageSnapshot
            const stages = snap && currentStage?.type === 'action'
              ? context.stages.map((s, i) => {
                  if (i !== snap.responseIndex) return s
                  return {
                    ...s,
                    beats: snap.responseBeats,
                    ...(snap.responseTimerSeconds > 0 ? { timerSeconds: snap.responseTimerSeconds } : {}),
                  }
                })
              : context.stages
            return { timerSecondsRemaining: 0, spinSecondsRemaining: 0, beatsRemaining: context.beatsAtStageEntry, stages }
          }),
        },

        TIER_RESET: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.tierIndex !== undefined
          },
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            const actionIndex = findTierActionIndex(context.stages, stage.tierIndex!)
            const snap = context.tierStageSnapshot
            const stages = snap
              ? context.stages.map((s, i) => {
                  if (i === snap.actionIndex) {
                    return { ...s, beats: snap.actionBeats, ...(snap.actionTimerSeconds > 0 ? { timerSeconds: snap.actionTimerSeconds } : {}) }
                  }
                  if (i === snap.responseIndex) {
                    return { ...s, beats: snap.responseBeats, ...(snap.responseTimerSeconds > 0 ? { timerSeconds: snap.responseTimerSeconds } : {}) }
                  }
                  return s
                })
              : context.stages
            return {
              currentStageIndex: actionIndex >= 0 ? actionIndex : context.currentStageIndex,
              timerSecondsRemaining: 0,
              spinSecondsRemaining: 0,
              beatsRemaining: context.beatsAtTierEntry,
              beatsAtStageEntry: context.beatsAtTierEntry,
              stages,
            }
          }),
        },

        UPDATE_PIPELINE: { actions: assign({ stages: ({ event }) => event.stages }) },
        END_BATTLE:      { target: 'battleEnded' },
        RESET:           { target: 'idle', actions: assign(RESET_CONTEXT) },
      },
    },

    /**
     * Active-stage paused state: the countdown timer is frozen at its current value.
     * The external TICK interval is stopped while this state is active.
     * Resumes back into stageActive (timer continues from where it was frozen).
     * STAGE_RESET and TIER_RESET are available here (same logic as stageActive).
     * PAUSE arrives from stageActive on any timed stage (gm-release and stageGMHold excluded).
     */
    stagePaused: {
      on: {
        RESUME:          { target: 'stageActive' },

        STAGE_RESET: {
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const currentStage = context.stages[context.currentStageIndex]
            const snap = context.tierStageSnapshot
            const stages = snap && currentStage?.type === 'action'
              ? context.stages.map((s, i) => {
                  if (i !== snap.responseIndex) return s
                  return {
                    ...s,
                    beats: snap.responseBeats,
                    ...(snap.responseTimerSeconds > 0 ? { timerSeconds: snap.responseTimerSeconds } : {}),
                  }
                })
              : context.stages
            return { timerSecondsRemaining: 0, spinSecondsRemaining: 0, beatsRemaining: context.beatsAtStageEntry, stages }
          }),
        },

        TIER_RESET: {
          guard: ({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            return !!stage && stage.tierIndex !== undefined
          },
          target: 'stageGMHold',
          actions: assign(({ context }) => {
            const stage = context.stages[context.currentStageIndex]
            const actionIndex = findTierActionIndex(context.stages, stage.tierIndex!)
            const snap = context.tierStageSnapshot
            const stages = snap
              ? context.stages.map((s, i) => {
                  if (i === snap.actionIndex) {
                    return { ...s, beats: snap.actionBeats, ...(snap.actionTimerSeconds > 0 ? { timerSeconds: snap.actionTimerSeconds } : {}) }
                  }
                  if (i === snap.responseIndex) {
                    return { ...s, beats: snap.responseBeats, ...(snap.responseTimerSeconds > 0 ? { timerSeconds: snap.responseTimerSeconds } : {}) }
                  }
                  return s
                })
              : context.stages
            return {
              currentStageIndex: actionIndex >= 0 ? actionIndex : context.currentStageIndex,
              timerSecondsRemaining: 0,
              spinSecondsRemaining: 0,
              beatsRemaining: context.beatsAtTierEntry,
              beatsAtStageEntry: context.beatsAtTierEntry,
              stages,
            }
          }),
        },

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
            beatsAtTierEntry: 0,
            tierStageSnapshot: null,
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
