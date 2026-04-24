// ── TacticalMelee — Main Process Entry Point ──────────────────────────────────
//
// This file is the central coordinator of the entire application. It owns:
//   - The XState machine actor (tcActor) — the single source of truth for all game state
//   - The subscription that reacts to every state transition (hook dispatch, beat math, broadcast)
//   - All IPC handlers that receive GM actions from the renderer (GM Dashboard)
//   - BattleLedger management for beat log history and Memento-based reset rollback
//   - StagePlanner invocations for pipeline expansion and carry-forward redistribution
//   - Broadcasting state to both surfaces: IPC → GM Dashboard, WebSocket → Group HUD
//
// ── Data flow overview ────────────────────────────────────────────────────────
//
//   GM action (button click in renderer)
//     → window.api.* (preload/index.ts: contextBridge)
//     → ipcRenderer.send('tc:...')
//     → ipcMain.on('tc:...') handler in this file
//     → tcActor.send({ type: 'EVENT' })
//     → XState machine transition (tcMachine.ts)
//     → tcActor.subscribe fires synchronously
//     → hook dispatch (StageRegistry), beat math, BattleLedger, StagePlanner carry-forward
//     → broadcast: ipcMain → renderer ('tc:state-update') AND lanServer.broadcast (WebSocket)
//     → GM Dashboard (renderer/src/App.tsx via onStateUpdate IPC listener)
//     → Group HUD (hud/HudApp.tsx via WebSocket TC_STATE/LEDGER_STATE messages)
//
// ── Surface architecture ──────────────────────────────────────────────────────
//
//   GM Dashboard  — Electron renderer window, has IPC access via preload/index.ts.
//                   Sends commands, receives TC_STATE and LEDGER_STATE via IPC.
//   Group HUD     — Second BrowserWindow, NO preload (no IPC access by design).
//                   Read-only: receives TC_STATE and LEDGER_STATE via WebSocket (port 3001).
//                   Can be opened on a separate screen / separate LAN device.
//   Player HUDs   — Future: same WebSocket pattern as Group HUD, per-player state filtering.
//
// ── Key subsystems ────────────────────────────────────────────────────────────
//
//   tcMachine.ts          — XState machine: all states, transitions, beat math, guards, actions
//   stagePlanner.ts       — Pipeline expansion (triad repeat) and carry-forward redistribution
//   BattleLedger.ts       — Memento stack for beat log + rollback on Stage/Tier/Round Reset
//   roundVisibilityUtils  — DSL evaluator: which stages are active for a given round number
//   StageRegistry         — Plugin hook dispatch (onEnter / onTick / onExit per stage type)
//   lanServer.ts          — WebSocket + HTTP server for Group HUD and future player clients
//   ActivePlugin.ts       — Hardcoded Standard plugin config (beat budget, stage definitions)

import { app, shell, BrowserWindow, session, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createActor } from 'xstate'
import { tcMachine } from './tc/tcMachine'
import { ActivePlugin } from './plugins/ActivePlugin'
import { createLanServer, LAN_PORT } from './server/lanServer'
import { StageRegistry } from './stages/registry'
import { StagePlanner } from './stages/stagePlanner'
import { filterStagesForRound, validateStagesRoundVisibility } from './stages/roundVisibilityUtils'
import { BattleLedger } from './battle/BattleLedger'
import { logger } from './logger'
import type { TCStatePayload } from '../shared/types'
import { isTimedStageType } from '../shared/types'

// ── Singletons ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let hudWindow:  BrowserWindow | null = null

const activePlugin  = new ActivePlugin()
const tcActor       = createActor(tcMachine)
const lanServer     = createLanServer()
// StagePlanner expands the Action Tier triad to fill the round's beat budget.
// Constructed once from the plugin's minimum timer floor so the floor is consistent
// for the lifetime of the app (plugin config does not change at runtime).
const stagePlanner  = new StagePlanner(activePlugin.getConfig().minAdjustedTimerSeconds)

// BattleLedger tracks beat log history with a Memento snapshot stack so that
// Stage Reset and Tier Reset can roll the log back consistently with the machine.
const battleLedger = new BattleLedger()

let tickInterval:     ReturnType<typeof setInterval> | null = null
let spinTickInterval: ReturnType<typeof setInterval> | null = null

// Tracks previous subscription state to detect enter/exit/tick transitions
let prevMachineState: string | null = null
let prevStageIndex: number = -1

// Set to 'pass' in the tc:pass IPC handler before sending the PASS event.
// The subscription reads this flag to avoid logging a duplicate exit entry when
// a PASS from stageActive causes a stageActive → stageSpin transition (which the
// subscription would otherwise log as 'time-expired'). Cleared after tcActor.send().
// lastIpcOp — synchronous IPC→subscription coordination flag.
//
// XState v5 processes events synchronously: the subscription fires (and completes) inside
// tcActor.send() before send() returns. This means a flag set immediately before send() is
// visible to the subscription during that same call stack, and cleared after send() returns.
//
// This property is exploited in two places:
//   'pass'        — tells the subscription not to log a duplicate exit entry when PASS causes
//                   stageActive → stageSpin (the IPC handler already logged the gm-pass entry)
//   'round-reset' — tells the subscription that a stageGMHold → stageGMHold (lower index)
//                   transition was caused by ROUND_RESET (IPC restored the ledger), not by
//                   TIER_RESET from Response hold (which needs subscription-side restore)
//
// FRAGILITY NOTE: This pattern relies on XState v5 synchronous observable semantics.
// If the codebase is ever upgraded to an async XState version, this flag becomes a race
// condition. The safe alternative is to carry the metadata in the event itself
// (e.g. { type: 'PASS', _source: 'ipc' }) but that would require adding fields to TCEvent.
//
// DECISION GUIDE — when adding a new IPC op, does it need a lastIpcOp flag?
//   YES, if: the subscription would independently re-do something the IPC handler already did
//            (e.g., restoring ledger state), or would misidentify the transition as a different
//            event type (e.g., reset vs normal advance).
//   NO,  if: the subscription's side-effects are correct regardless of which IPC op triggered
//            the transition (e.g., a simple 'start' that just changes machine state normally).
let lastIpcOp: 'pass' | 'round-reset' | null = null

// Holds a Response stage's surplus beats that should carry forward to the next tier's
// Action, but are deferred until the current tier's Resolution spin completes.
//
// Carry-forward timing windows — three zones with different rules:
//
//   Zone 1 — Intra-tier (Action/Pre-Encounter → Response/Action-Tier1):
//     Applied IMMEDIATELY in the subscription when the source stage exits.
//     Safe: no reset can undo a stage that is already complete.
//
//   Zone 2 — Cross-tier carry (Response → next Action), PENDING phase:
//     Response exits early → surplus stored in pendingCrossTierCarry.
//     ↓ Resolution stageSpin is active here.
//     DANGER ZONE: Tier Reset is still available (from stageSpin/stageSpinPaused).
//     Applying carry now + Tier Reset = double-counting. Do NOT apply yet.
//
//   Zone 3 — Cross-tier carry, SAFE to apply:
//     Resolution spin completes → machine advances to next tier's stageGMHold.
//     Tier Reset for the completed tier is now impossible (machine is past it).
//     pendingCrossTierCarry is consumed and UPDATE_PIPELINE is sent.
//
//   Zone 4 — Reset fired during Zone 2:
//     Tier/Stage Reset detected → pendingCrossTierCarry is discarded.
//     The tier replays from scratch; the surplus never existed for the new run.
//
// Cleared when: Stage Reset detected, Tier Reset detected, Round Reset (in IPC handler).
let pendingCrossTierCarry: { fromStageIndex: number; surplusBeats: number } | null = null


// ── Timer management ─────────────────────────────────────────────────────────

function startSpinTicker(): void {
  if (spinTickInterval) return
  spinTickInterval = setInterval(() => tcActor.send({ type: 'SPIN_TICK' }), 1000)
}

function stopSpinTicker(): void {
  if (spinTickInterval) {
    clearInterval(spinTickInterval)
    spinTickInterval = null
  }
}

// ── Dev log bridge ───────────────────────────────────────────────────────────
// Forwards stage hook log lines to the renderer DevTools console (dev only).
// Eliminates the need to watch both the terminal and DevTools during development.
function devLog(message: string): void {
  if (is.dev) {
    mainWindow?.webContents.send('tm:dev-log', message)
  }
}

// ── Battle Ledger broadcast ───────────────────────────────────────────────
// Sends the current ledger payload to both the GM Dashboard (IPC) and the
// Group HUD (WebSocket), keeping both surfaces in sync with every update.
function broadcastLedger(): void {
  const data = battleLedger.getData()
  mainWindow?.webContents.send('ledger:update', data)
  lanServer.broadcast({ type: 'LEDGER_STATE', payload: data })
}

// ── GM Alert ────────────────────────────────────────────────────────────────
// Surfaces critical errors to the GM's console UI, the pino log, and stderr.
// Used for plugin configuration errors detected at startup (e.g. a stage that
// is always inactive). The renderer shows these as a dismissable red banner.
function gmAlert(message: string): void {
  mainWindow?.webContents.send('tm:gm-alert', message)
  logger.error({ alert: message }, 'GM Alert')
  console.error(`[GM ALERT] ${message}`)
}

// ── Timer management ────────────────────────────────────────────────────────

function startTicker(): void {
  if (tickInterval) return
  tickInterval = setInterval(() => tcActor.send({ type: 'TICK' }), 1000)
}

function stopTicker(): void {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

// ── XState subscription ─────────────────────────────────────────────────────
//
// This is the heart of the main process. It fires synchronously on every state
// transition and performs ALL side-effects in a fixed order:
//
//   1. Guard: skip transient checkAdvance (see comment below)
//   2. Hook dispatch  — onEnter / onTick / onExit via StageRegistry
//   3. BattleLedger   — push stage/tier snapshot on entry; log beat events; restore on reset
//   4. StagePlanner   — detect GM Release surplus; apply carry-forward via UPDATE_PIPELINE
//   5. Reset detection — clear pendingCrossTierCarry; detect Tier/Stage/Round Reset paths
//   6. Deferred carry — apply cross-tier carry when Resolution spin advances forward
//   7. Ledger discard — remove stale snapshots on normal forward completion
//   8. Tier push      — snapshot new tier on entering Action stageGMHold
//   9. Stack cleanup  — discard on TC complete or battle end
//  10. Timer mgmt     — start/stop TICK and SPIN_TICK intervals based on new state
//  11. Broadcast      — send TCStatePayload via IPC (GM Dashboard) + WebSocket (Group HUD)
//
// Steps 3–8 are interleaved with state-transition detection using prevMachineState /
// prevStageIndex shadows updated at step 11 (end of subscription body).
// Steps 1–11 complete entirely before tcActor.send() returns (XState v5 is synchronous).

tcActor.subscribe((snapshot) => {
  const state = String(snapshot.value)

  // Skip the transient checkAdvance pseudo-state.
  //
  // checkAdvance uses XState `always` transitions — it resolves to the next stable state
  // in the same synchronous microtask. XState v5 fires the subscription for every state,
  // including transient ones, so without this guard the subscription would fire twice:
  // once with state='checkAdvance' and once with the real target state.
  //
  // The critical problem is prevMachineState: if we processed checkAdvance, prevMachineState
  // would be set to 'checkAdvance' before the real state arrives. Every downstream comparison
  // (e.g. `prevMachineState === 'stageActive'` for reset detection) would then fail because
  // the last recorded state was 'checkAdvance', not the real prior state.
  //
  // By returning early here, prevMachineState always reflects the last *stable* state,
  // keeping all transition comparisons in the subscription logically correct.
  if (state === 'checkAdvance') return

  const { stages, currentStageIndex } = snapshot.context

  const currentStage = stages[currentStageIndex]

  // ── Stage Registry hook dispatch ─────────────────────────────────────────
  //
  // Detect lifecycle transitions by comparing against previous snapshot state.
  //
  // "In stage" = stageActive OR stageGMHold (both represent an active stage).
  // entering: just entered an in-stage state for a new stage index
  //           stageGMHold → stageActive on the SAME stage does NOT re-fire onEnter
  // exiting:  was in-stage and is now leaving (or advancing to next stage)
  // ticking:  staying in stageActive, same index (a TICK just fired)

  const isInStage  = state === 'stageActive' || state === 'stageGMHold'
  const wasInStage = prevMachineState === 'stageActive' || prevMachineState === 'stageGMHold'

  const entering = isInStage && (!wasInStage || prevStageIndex !== currentStageIndex)
  const exiting  = wasInStage && (!isInStage || prevStageIndex !== currentStageIndex)

  const ticking = state === 'stageActive' &&
    prevMachineState === 'stageActive' &&
    prevStageIndex === currentStageIndex

  // Error contract: hook handlers (onEnter/onTick/onExit) are currently all stubs that
  // return void synchronously. If a future handler throws, the exception propagates up
  // through the subscription and would crash the main process. When non-trivial handler
  // logic is introduced, wrap with try/catch and send a 'tm:gm-alert' to surface errors
  // without bringing down the machine loop. For now, no wrapping needed — stubs cannot throw.
  if (exiting && prevStageIndex >= 0) {
    const prevStage = stages[prevStageIndex]
    if (prevStage) {
      const handler = StageRegistry[prevStage.type]
      // Missing handler: silently skipped. This is intentional — stub handlers return
      // no-ops but are always registered. If a new stage type is added to the plugin
      // without a corresponding registry entry, the miss is silent. Add a logger.warn
      // here if you need to surface misconfiguration during development.
      if (handler) {
        devLog(`[Stage:${prevStage.type}] onExit — "${prevStage.name}" (round ${snapshot.context.round})`)
        handler.onExit(prevStage, snapshot.context)
      }
    }
  }

  if (entering && currentStage) {
    const handler = StageRegistry[currentStage.type]
    if (handler) {
      devLog(`[Stage:${currentStage.type}] onEnter — "${currentStage.name}" (round ${snapshot.context.round})`)
      handler.onEnter(currentStage, snapshot.context)
    }
  }

  if (ticking && currentStage) {
    const handler = StageRegistry[currentStage.type]
    if (handler) {
      devLog(`[Stage:${currentStage.type}] onTick — "${currentStage.name}" (round ${snapshot.context.round}, ${snapshot.context.timerSecondsRemaining}s remaining)`)
      handler.onTick(currentStage, snapshot.context)
    }
  }

  // ── BattleLedger — entering stageActive ───────────────────────────────────
  //
  // Push stage snapshot and log stage-start for every stageActive entry.
  // 0-beat stages: snapshot IS pushed (for reset consistency) but stage-start is NOT logged.
  //
  // Why 0-beat stages are excluded from the beat log:
  //   The beat log is a timeline of in-world time consumption — it answers "when did this
  //   happen in the tactical cycle?" 0-beat system stages (Surprise, Initiative, Resolution)
  //   consume no in-world time; they are computation windows outside of time. Logging them
  //   would produce misleading "0.0 beats consumed" entries that pollute the timeline.
  //   The snapshot is still pushed so that Stage Reset from a system stage works correctly
  //   (the machine returns to stageGMHold and the ledger restores consistently).
  //   If you add a stage type that is 0-beat but meaningful to log, add an explicit
  //   override here rather than relaxing the beats > 0 rule globally.
  //
  // Two entry paths:
  //   entering = true  → new stage index (preamble, system, or first entry from idle)
  //   releasingFromHold → stageGMHold → stageActive on the SAME stage index
  //                       (GM Release from hold for Action/Response).
  //                       The 'entering' flag is false here since both stageGMHold
  //                       and stageActive are "in-stage" at the same index, but this
  //                       IS the moment the countdown timer starts.

  const releasingFromHold = state === 'stageActive' &&
    prevMachineState === 'stageGMHold' &&
    currentStageIndex === prevStageIndex

  // stagePaused → stageActive is a resume, not a new entry — wasInStage is false
  // for stagePaused so entering=true fires incorrectly; exclude it explicitly.
  const resumingFromPause = state === 'stageActive' && prevMachineState === 'stagePaused'

  if (((entering && state === 'stageActive') || releasingFromHold) && !resumingFromPause) {
    battleLedger.push('stage')
    if (currentStage && currentStage.beats > 0) {
      battleLedger.logEntry({
        round: snapshot.context.round,
        tierIndex: currentStage.tierIndex,
        stageId: currentStage.id,
        stageName: currentStage.name,
        operation: 'stage-start',
        beatsConsumed: snapshot.context.totalBeats - snapshot.context.beatsRemaining,
      })
    }
  }

  // ── StagePlanner — Carry-forward detection ────────────────────────────────
  //
  // When a timed stage exits via GM Release (early end), the machine preserves
  // beatsRemaining at the partial value. Surplus beats = the portion of the stage's
  // beat allocation that was not consumed. These are forwarded to the next beat-
  // consuming stage in the pipeline to extend its allocation.
  //
  // Detection: stageActive → stageSpin for beat-consuming stages (spinTime > 0).
  // snapshot.context.beatsAtStageEntry still reflects the exiting stage's entry value.
  //
  // surplusBeats = beatsRemaining − (beatsAtStageEntry − stage.beats)
  //   > 0  → GM Release left unconsumed beats → carry forward
  //   = 0  → natural expiry or GM Pass (full cost charged) → no carry forward
  //
  // Routing:
  //   Response stage → cross-tier carry (Response → next tier's Action).
  //     DEFERRED: stored in pendingCrossTierCarry and applied only when the current
  //     tier's Resolution spin completes. This makes Tier Reset and cross-tier carry
  //     mutually exclusive — the reset window closes before the carry is applied.
  //   All other timed stages (Action, Pre-Encounter, Morale) → intra-tier or
  //     same-round carry. Applied IMMEDIATELY via UPDATE_PIPELINE.
  //
  // Why Response carry-forward is deferred (double-counting problem):
  //
  //   Scenario without deferral:
  //     1. Response releases early → surplusBeats = 2 → UPDATE_PIPELINE applied immediately,
  //        inflating next-tier Action from 4b to 6b.
  //     2. GM triggers Tier Reset from Resolution spin.
  //     3. Machine restores beatsAtTierEntry (e.g. 40b) as the beat clock.
  //     4. BUT the pipeline still has Action at 6b (the carry was already applied).
  //     5. On the next real advance, another carry detection fires against the 6b allocation,
  //        potentially carrying surplus from the now-inflated allocation → double-count.
  //
  //   Solution: defer until Resolution spin completes. After Resolution spin → next tier's
  //   Action stageGMHold, Tier Reset is no longer possible for the completed tier (the window
  //   has closed). The carry is then applied atomically to a pipeline that cannot be rolled back.
  //   The carry and the Tier Reset window are made mutually exclusive in time.

  if ((prevMachineState === 'stageActive' || prevMachineState === 'stagePaused') && state === 'stageSpin') {
    const prevStage = stages[prevStageIndex]

    // BattleLedger: log stage end and discard the stage snapshot.
    // Covers stageActive → stageSpin (normal end or early release) and
    // stagePaused → stageSpin (PASS while paused).
    //
    // Skip the exit log when lastIpcOp === 'pass' — the IPC handler already
    // logged a 'gm-pass' entry before sending the event; logging here too
    // would produce a duplicate entry.
    if (prevStage && prevStage.beats > 0 && lastIpcOp !== 'pass') {
      // Determine whether the stage ended early (GM Release with surplus beats)
      // or ran to full time (natural expiry, no surplus).
      const fullCostRemaining = snapshot.context.beatsAtStageEntry - prevStage.beats
      const surplusForLog = snapshot.context.beatsRemaining - fullCostRemaining
      battleLedger.logEntry({
        round: snapshot.context.round,
        tierIndex: prevStage.tierIndex,
        stageId: prevStage.id,
        stageName: prevStage.name,
        operation: surplusForLog > 0.05 ? 'gm-release' : 'time-expired',
        beatsConsumed: snapshot.context.totalBeats - snapshot.context.beatsRemaining,
      })
    }
    battleLedger.discard('stage')

    if (prevStage && prevStage.beats > 0 && isTimedStageType(prevStage.type)) {
      const fullCostRemaining = snapshot.context.beatsAtStageEntry - prevStage.beats
      const surplusBeats = snapshot.context.beatsRemaining - fullCostRemaining

      if (surplusBeats > 0.05) {
        if (prevStage.type === 'response') {
          // Cross-tier carry: defer until this tier's Resolution spin completes.
          // Tier Reset is no longer available after Resolution, so the carry can be
          // safely applied then without risk of double-counting on reset.
          pendingCrossTierCarry = { fromStageIndex: prevStageIndex, surplusBeats }
        } else {
          // Intra-tier or pre-preamble carry (Action → Response, Pre-Encounter → Tier 1 Action, etc.)
          // Apply immediately — no reset can undo a stage that has already completed.
          const updatedStages = stagePlanner.applyCarryForward(stages, prevStageIndex, surplusBeats)
          if (updatedStages !== stages) {
            tcActor.send({ type: 'UPDATE_PIPELINE', stages: updatedStages })
          }
        }
      }
    }
  }

  // ── Reset detection — clear pending cross-tier carry ─────────────────────
  //
  // Reset truth table — (prevState, currState, index direction, lastIpcOp) → type:
  //
  //   prevState          currState    index vs prev   lastIpcOp    → event type
  //   ─────────────────  ──────────── ─────────────── ──────────── ────────────────────────
  //   stageActive        stageGMHold  same            —            Stage Reset
  //   stageActive        stageGMHold  lower           —            Tier Reset
  //   stagePaused        stageGMHold  same            —            Stage Reset (paused → hold)
  //   stagePaused        stageGMHold  lower           —            Tier Reset  (paused → hold)
  //   stageSpin          stageGMHold  same            —            Stage Reset from spin
  //   stageSpin          stageGMHold  lower           —            Tier Reset  from spin
  //   stageSpinPaused    stageGMHold  same            —            Stage Reset from spin-paused
  //   stageSpinPaused    stageGMHold  lower           —            Tier Reset  from spin-paused
  //   stageGMHold        stageGMHold  lower           —            Tier Reset  from Response hold
  //   stageGMHold        checkAdvance lower           'round-reset' Round Reset (IPC handled ledger)
  //   stageActive        stageActive  lower           'round-reset' Round Reset from active stage
  //   stageActive        stageGMHold  lower/same      'round-reset' Round Reset (plugin: action-first)
  //   stageSpin          stageActive  lower           'round-reset' Round Reset from spin
  //   stageSpin          stageGMHold  lower/same      'round-reset' Round Reset (plugin: action-first)
  //   stagePaused        stageActive  lower           'round-reset' Round Reset from paused stage
  //   stageSpinPaused    stageActive  lower           'round-reset' Round Reset from spin-paused
  //
  //   stageSpin          stageGMHold  HIGHER          —            NORMAL forward advance (not reset!)
  //   any                any          same or higher  —            Normal transition — not a reset
  //
  // Round Reset: pendingCrossTierCarry was already cleared in the IPC handler. The ledger
  // was restored there before tcActor.send(), using lastIpcOp = 'round-reset' to distinguish
  // it from a Tier Reset from Response hold (which shares the stageGMHold→stageGMHold shape).
  // The restore blocks below also check lastIpcOp !== 'round-reset' to prevent a double-restore
  // when ROUND_RESET routes through stageActive/stageSpin → stageGMHold (action-first plugin).
  //
  // Pending carry discard: if a reset fires while pendingCrossTierCarry is set (Response
  // released early, then Tier Reset from Resolution spin), the carry is forfeited — the
  // tier will re-run from scratch and the surplus never existed as far as the new run is concerned.

  if (
    state === 'stageGMHold' &&
    (prevMachineState === 'stageActive' ||
      prevMachineState === 'stagePaused' ||
      (prevMachineState === 'stageGMHold' && currentStageIndex < prevStageIndex && lastIpcOp !== 'round-reset') ||
      ((prevMachineState === 'stageSpin' || prevMachineState === 'stageSpinPaused') && currentStageIndex <= prevStageIndex))
  ) {
    pendingCrossTierCarry = null
  }

  // ── Deferred cross-tier carry — apply when Resolution spin completes ──────
  //
  // Fires when the tier's Resolution spin finishes and the machine advances normally
  // into the next tier's Action stageGMHold (forward index, not a reset).
  // At this point the Tier Reset window for the completed tier is permanently closed,
  // so applying the carry cannot cause double-counting.

  else if (
    prevMachineState === 'stageSpin' &&
    stages[prevStageIndex]?.type === 'resolution' &&
    state === 'stageGMHold' &&
    currentStageIndex > prevStageIndex &&
    pendingCrossTierCarry !== null
  ) {
    const { fromStageIndex, surplusBeats } = pendingCrossTierCarry
    pendingCrossTierCarry = null
    const updatedStages = stagePlanner.applyCarryForward(stages, fromStageIndex, surplusBeats)
    if (updatedStages !== stages) {
      tcActor.send({ type: 'UPDATE_PIPELINE', stages: updatedStages })
    }
  }

  // ── BattleLedger — snapshot restore/discard on Stage Reset / Tier Reset ──
  //
  // stageActive → stageGMHold: three cases by index direction.
  //   Same index  → Stage Reset: restore stage snapshot.
  //   Lower index → Tier Reset: restore tier snapshot (which also discards stage above it).
  //   Higher index → Forward: gm-release stage (e.g. GM Narrative) completed with no spin;
  //                           discard its stage snapshot as normal completion.
  //
  // stagePaused → stageGMHold: same semantics as stageActive → stageGMHold.
  //
  // stageSpin / stageSpinPaused → stageGMHold backward/same: reset from spin.
  //   Same index  → Stage Reset from spin.
  //   Lower index → Tier Reset from spin.
  //
  // stageGMHold → stageGMHold (lower index, not round-reset): Tier Reset from Response hold.
  //   Round Reset is excluded: IPC handler already restored the ledger before send().

  // Round Reset is excluded from all restore blocks: the IPC handler already called
  // battleLedger.restore('round') before send(), so a subscription-side restore here
  // would double-pop the stack and corrupt the ledger state.
  if ((prevMachineState === 'stageActive' || prevMachineState === 'stagePaused') && state === 'stageGMHold' && lastIpcOp !== 'round-reset') {
    if (currentStageIndex < prevStageIndex) {
      battleLedger.restore('tier')
      battleLedger.push('tier')
    } else if (currentStageIndex === prevStageIndex) {
      battleLedger.restore('stage')
    } else {
      // Forward transition: a gm-release stage (e.g. GM Narrative) completed with no spin
      // window and advanced directly to the next stageGMHold. Discard its stage snapshot
      // as normal completion — this is not a reset path.
      battleLedger.discard('stage')
    }
  }

  if ((prevMachineState === 'stageSpin' || prevMachineState === 'stageSpinPaused') && state === 'stageGMHold' && currentStageIndex <= prevStageIndex && lastIpcOp !== 'round-reset') {
    if (currentStageIndex < prevStageIndex) {
      battleLedger.restore('tier')
      battleLedger.push('tier')
    } else {
      battleLedger.restore('stage')
    }
  }

  if (prevMachineState === 'stageGMHold' && state === 'stageGMHold' && currentStageIndex < prevStageIndex && lastIpcOp !== 'round-reset') {
    battleLedger.restore('tier')
    battleLedger.push('tier')
  }

  // ── BattleLedger — snapshot discard on normal forward advance from spin ───
  //
  // Resolution spin → next tier: discard tier snapshot (tier completed normally).
  // Any other spin → next stage: discard stage snapshot (stage completed normally).

  if (prevMachineState === 'stageSpin' && state === 'stageGMHold' && currentStageIndex > prevStageIndex) {
    if (stages[prevStageIndex]?.type === 'resolution') {
      battleLedger.discard('tier')
    } else {
      battleLedger.discard('stage')
    }
  }

  // ── BattleLedger — entering stageGMHold (tier push) ──────────────────────
  //
  // Push a tier snapshot when entering Action stageGMHold for a new tier.
  //
  // ORDERING INVARIANT: This push is placed AFTER the discard block.
  //
  // The collision scenario that forces this order:
  //   Resolution spin completes → machine advances to next tier's Action stageGMHold.
  //   In the subscription, this transition simultaneously satisfies BOTH:
  //     a) "stageSpin → stageGMHold forward" → DISCARD old tier snapshot
  //     b) "entering stageGMHold, type=action" → PUSH new tier snapshot
  //
  //   If push ran FIRST:
  //     Stack before: [round, tier_old]
  //     After push:   [round, tier_old, tier_new]   ← tier_new on top
  //     After discard('tier'): removes the TOP 'tier' entry → removes tier_new (just pushed!)
  //     Result: stack [round, tier_old] — new tier has no snapshot; Stage/Tier Reset would
  //             restore to old tier's beat values. Silent corruption.
  //
  //   With discard FIRST:
  //     Stack before: [round, tier_old]
  //     After discard('tier'): [round]              ← tier_old removed
  //     After push('tier'):    [round, tier_new]    ← correct
  //
  // Reset reentry detection (isResetReentry) prevents pushing a duplicate snapshot when
  // returning to Action stageGMHold via Stage Reset, Tier Reset, or Round Reset — in those
  // cases the restore block above has already handled the ledger state.
  // The stageActive/stagePaused arms require currentStageIndex <= prevStageIndex so that a
  // forward transition (GM Narrative → Action, higher index) is NOT mistaken for a reset.

  if (entering && state === 'stageGMHold' && currentStage?.type === 'action') {
    // isResetReentry: we're returning to Action's GM Hold due to a reset, not advancing fresh.
    // In all these cases the restore blocks above already handled the snapshot — no new push needed.
    // stageActive/stagePaused arms: excluded by index direction (forward = higher index = not a reset).
    // stageGMHold arm: Round Reset excluded via lastIpcOp — IPC handler already handled the ledger.
    const isResetReentry =
      (prevMachineState === 'stageActive' && currentStageIndex <= prevStageIndex) ||
      (prevMachineState === 'stagePaused' && currentStageIndex <= prevStageIndex) ||
      (prevMachineState === 'stageGMHold' && currentStageIndex <= prevStageIndex && lastIpcOp !== 'round-reset') ||
      ((prevMachineState === 'stageSpin' || prevMachineState === 'stageSpinPaused') && currentStageIndex <= prevStageIndex)
    if (!isResetReentry) {
      battleLedger.push('tier')
    }
  }

  // ── BattleLedger — stack cleanup on TC end / battle end ───────────────────
  // Discard any lingering tier (and stage above it) when the round finishes or
  // the GM ends the battle. The round snapshot is retained for the log history.

  if (state === 'tcComplete' || state === 'battleEnded') {
    battleLedger.discard('tier')
  }

  // ── Residual beat logging at TC end ──────────────────────────────────────
  //
  // If the final Resolution spin completes and the TC ends with beatsRemaining > 0,
  // log the residual for algorithm analysis. Residual beats have no mechanical effect —
  // the next round starts fresh from totalBeats.
  {
    const prevStage = stages[prevStageIndex]
    if (
      prevMachineState === 'stageSpin' &&
      prevStage?.type === 'resolution' &&
      state === 'tcComplete' &&
      snapshot.context.beatsRemaining > 0.05
    ) {
      logger.info(
        { residualBeats: snapshot.context.beatsRemaining, round: snapshot.context.round },
        'StagePlanner: residual beats at TC end'
      )
    }
  }

  prevMachineState = state
  prevStageIndex   = currentStageIndex

  // ── Timer management ─────────────────────────────────────────────────────
  if (state === 'stageActive' && currentStage && isTimedStageType(currentStage.type)) {
    startTicker()
  } else {
    stopTicker()
  }

  if (state === 'stageSpin') {
    startSpinTicker()
  } else {
    stopSpinTicker()  // also stops when entering stageSpinPaused
  }

  // ── Broadcast ────────────────────────────────────────────────────────────
  const payload: TCStatePayload = {
    machineState:          state,
    round:                 snapshot.context.round,
    stages:                snapshot.context.stages,
    currentStageIndex:     snapshot.context.currentStageIndex,
    timerSecondsRemaining: snapshot.context.timerSecondsRemaining,
    spinSecondsRemaining:  snapshot.context.spinSecondsRemaining,
    backgroundOpsComplete: snapshot.context.backgroundOpsComplete,
    beatsRemaining:        snapshot.context.beatsRemaining,
    totalBeats:            snapshot.context.totalBeats,
  }

  mainWindow?.webContents.send('tc:state-update', payload)
  lanServer.broadcast({ type: 'TC_STATE', payload })
  broadcastLedger()

  logger.debug(
    { machineState: state, round: snapshot.context.round, stageIndex: currentStageIndex },
    'TC state broadcast'
  )
})

tcActor.start()

// ── IPC handlers ────────────────────────────────────────────────────────────
// All handlers are fire-and-forget (one-way from renderer to main).
// The renderer sends these via window.api.* (see preload/index.ts).
// Responses travel back via tc:state-update broadcasts from tcActor.subscribe.

// Filter stages for round 1, expand the pipeline via StagePlanner, then start the machine.
// beatsPerTC initialises the beat ledger (beatsRemaining = beatsAtStageEntry = beatsPerTC).
ipcMain.on('tc:start-combat', () => {
  const allStages  = activePlugin.getStages()
  const beatsPerTC = activePlugin.getBeatsPerTC()
  const filtered   = filterStagesForRound(allStages, 1)
  const stages     = stagePlanner.plan(filtered, beatsPerTC)
  battleLedger.reset()
  battleLedger.push('round')
  tcActor.send({ type: 'START_COMBAT', stages, beatsPerTC })
})

// In stageGMHold: starts the player countdown. In stageActive: ends stage early;
// surplus beats carry forward to the next beat-consuming stage via UPDATE_PIPELINE.
// In stageSpin: ends spin early (only when backgroundOpsComplete is true).
ipcMain.on('tc:gm-release', () => tcActor.send({ type: 'GM_RELEASE' }))

// Skips the current stage. Full beat cost charged in all contexts.
// Beat log entry written here (before the event fires) using the known post-pass formula:
//   beatsRemaining after pass = max(0, beatsAtStageEntry − stage.beats)
// Only logged for beat-consuming stages (beats > 0).
ipcMain.on('tc:pass', () => {
  const snap     = tcActor.getSnapshot()
  const machState = String(snap.value)
  if (machState === 'stageGMHold' || machState === 'stageActive' || machState === 'stagePaused') {
    const ctx   = snap.context
    const stage = ctx.stages[ctx.currentStageIndex]
    if (stage && stage.beats > 0) {
      const beatsRemainingAfter   = Math.max(0, ctx.beatsAtStageEntry - stage.beats)
      const beatsConsumedAfter    = ctx.totalBeats - beatsRemainingAfter
      battleLedger.logEntry({
        round:         ctx.round,
        tierIndex:     stage.tierIndex,
        stageId:       stage.id,
        stageName:     stage.name,
        operation:     'gm-pass',
        beatsConsumed: beatsConsumedAfter,
      })
    }
  }
  // Flag tells the subscription not to log a duplicate exit entry for the
  // stageActive → stageSpin transition that this PASS event may produce.
  // XState v5 processes the event synchronously, so the subscription fires
  // inside send() while the flag is still set.
  lastIpcOp = 'pass'
  tcActor.send({ type: 'PASS' })
  lastIpcOp = null
})

// Freezes the active timer (stageActive → stagePaused, stageSpin → stageSpinPaused).
ipcMain.on('tc:pause',      () => tcActor.send({ type: 'PAUSE' }))

// Resumes from either paused state back to its respective active state.
ipcMain.on('tc:resume',     () => tcActor.send({ type: 'RESUME' }))

// Restarts the current stage from its beginning.
// Beat clock restored to beatsAtStageEntry; machine returns to stageGMHold.
// Available in stageActive and stageSpin only.
ipcMain.on('tc:stage-reset', () => tcActor.send({ type: 'STAGE_RESET' }))

// Restarts the entire current Action Tier from its opening Action stage.
// Beat clock restored to beatsAtTierEntry; machine returns to stageGMHold for the tier's Action.
// Only fires when the current stage has a tierIndex (tier stages only).
ipcMain.on('tc:tier-reset',  () => tcActor.send({ type: 'TIER_RESET' }))

// Restarts the entire current round from stage 0.
// Beat clock restored to totalBeats; stage pipeline rebuilt fresh for this round.
// Available in stageGMHold, stageActive, stagePaused, stageSpin, and stageSpinPaused
// when currentStageIndex > 0 (not the very first stage of the round).
// BattleLedger restoration is done here (before send) so the subscription sees the clean
// state and the restore blocks skip themselves via lastIpcOp === 'round-reset'.
ipcMain.on('tc:round-reset', () => {
  pendingCrossTierCarry = null
  battleLedger.restore('round')
  battleLedger.push('round')
  const snap    = tcActor.getSnapshot()
  const round   = snap.context.round
  const filtered = filterStagesForRound(activePlugin.getStages(), round)
  const stages   = stagePlanner.plan(filtered, activePlugin.getBeatsPerTC())
  lastIpcOp = 'round-reset'
  tcActor.send({ type: 'ROUND_RESET', stages })
  lastIpcOp = null
})

// Increments round, reloads round-filtered + StagePlanner-expanded stage list,
// resets beat ledger to totalBeats.
ipcMain.on('tc:next-round', () => {
  const nextRound = tcActor.getSnapshot().context.round + 1
  const filtered  = filterStagesForRound(activePlugin.getStages(), nextRound)
  const stages    = stagePlanner.plan(filtered, activePlugin.getBeatsPerTC())
  battleLedger.push('round')
  tcActor.send({ type: 'NEXT_ROUND', stages })
})

// Transitions to battleEnded — all timers stop, HUD shows end screen.
ipcMain.on('tc:end-battle', () => tcActor.send({ type: 'END_BATTLE' }))

// Full reset to idle — clears all context including round, stages, and beat ledger.
ipcMain.on('tc:reset', () => {
  battleLedger.reset()
  tcActor.send({ type: 'RESET' })
})

// Opens the Group HUD window (1920×1080, no preload — read-only WebSocket client).
// If already open, focuses it rather than creating a second instance.
ipcMain.on('tc:launch-hud', () => {
  if (hudWindow) {
    hudWindow.focus()
    return
  }

  hudWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: 'TacticalMelee — Group HUD',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // No preload: the HUD connects via WebSocket (port 3001), not IPC.
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    hudWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/hud.html`)
  } else {
    hudWindow.loadFile(join(__dirname, '../renderer/hud.html'))
  }

  hudWindow.on('closed', () => {
    hudWindow = null
  })
})

// ── Window creation ─────────────────────────────────────────────────────────

/** Creates the GM Dashboard window. Hidden until ready-to-show to avoid a white flash. */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'TacticalMelee — GM Dashboard',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tacticalmelee.app')

  // Content Security Policy injected on every response.
  // Dev relaxes script-src (unsafe-inline/eval for Vite HMR) and connect-src
  // (ws/http localhost for the dev server and LAN WebSocket).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = is.dev
      ? `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data:; font-src 'self' data:`
      : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Validate plugin configuration after window is ready so alerts can reach the GM console
  mainWindow?.once('ready-to-show', () => {
    const { errors, warnings } = validateStagesRoundVisibility(activePlugin.getStages())
    warnings.forEach(w => logger.warn({ warning: w }, 'Plugin config warning'))
    errors.forEach(e => gmAlert(`Plugin configuration error: ${e}`))
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopTicker()
  stopSpinTicker()
  lanServer.close()
  if (process.platform !== 'darwin') app.quit()
})
