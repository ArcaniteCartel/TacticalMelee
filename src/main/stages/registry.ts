/**
 * Stage Registry
 *
 * Maps stage type strings to their StageHandler implementations.
 * This is the authoritative index of all stage types the system supports.
 *
 * ── Adding a new stage type ──────────────────────────────────────────────────
 *   1. Create a handler module in src/main/stages/ implementing StageHandler
 *   2. Import it here and add one entry to the map
 *   3. Add the type string to the StageType union in src/shared/types.ts
 *   Nothing else needs to change — the registry is the sole registration point.
 *
 * Plugins select from these types by name in their stage definitions. Plugin
 * YAML/config files never contain executable logic; the system owns all handlers.
 *
 * ── Hook dispatch context ────────────────────────────────────────────────────
 * Hooks are dispatched in src/main/index.ts via the tcActor.subscribe callback:
 *
 *   onEnter(stage, context) — fires when a stage is first entered (stageGMHold for
 *     action/response types; stageActive for all others). Does NOT re-fire when
 *     stageGMHold transitions to stageActive for the same stage index.
 *
 *   onTick(stage, context)  — fires every 1-second TICK while in stageActive with
 *     a live timer. Receives the current context including timerSecondsRemaining.
 *
 *   onExit(stage, context)  — fires when leaving a stage (any exit: GM Release,
 *     Pass, time expiry, reset). Does NOT distinguish exit reason — all exits look
 *     the same to the handler. If the handler needs to know why the stage ended
 *     (e.g. to decide whether to commit resolution results), this gap must be
 *     addressed by adding an exitReason parameter to StageHandler.onExit.
 *
 * Context invariants at hook time:
 *   - context.stages is the current pipeline including any carry-forward adjustments
 *   - context.beatsRemaining reflects the live beat clock at the moment of dispatch
 *   - context.currentStageIndex points to the stage being entered/ticked/exited
 *   - For onExit: context still reflects the exiting stage (not the next one yet)
 *
 * All current handlers are stubs. Resolution.onExit must eventually send SPIN_COMPLETE
 * or SPIN_EXCEPTION to the tcActor when async computation finishes.
 */

import type { StageHandler } from './StageHandler'
import { GmReleaseHandler }              from './gmRelease'
import { TimedHandler }                  from './timed'
import { SurpriseDeterminationHandler }  from './surpriseDetermination'
import { InitiativeDeterminationHandler } from './initiativeDetermination'
import { ActionHandler }                 from './action'
import { ResponseHandler }               from './response'
import { ResolutionHandler }             from './resolution'

export const StageRegistry: Record<string, StageHandler> = {
  'gm-release':               GmReleaseHandler,
  'timed':                    TimedHandler,
  'surprise-determination':   SurpriseDeterminationHandler,
  'initiative-determination': InitiativeDeterminationHandler,
  'action':                   ActionHandler,
  'response':                 ResponseHandler,
  'resolution':               ResolutionHandler,
}
