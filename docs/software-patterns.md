# TacticalMelee — Software Patterns Reference

**Date:** 2026-04-24  
**Version:** as of commit b6d60cc  
**Purpose:** Documents every significant software pattern in use, where it appears, and — critically — what to be careful of when modifying code in or around each pattern. Use this to avoid accidentally breaking something that works correctly for non-obvious reasons.

---

## Table of Contents

1. [State Machine Pattern (XState v5)](#1-state-machine-pattern-xstate-v5)
2. [Transient State Guard](#2-transient-state-guard)
3. [Shadow State (prevMachineState / prevStageIndex)](#3-shadow-state-prevmachinestate--prevstageindex)
4. [Synchronous IPC-to-Subscription Coordination Flag (lastIpcOp)](#4-synchronous-ipc-to-subscription-coordination-flag-lastipcop)
5. [Deferred Side Effect (pendingCrossTierCarry)](#5-deferred-side-effect-pendingcrosstiercarry)
6. [Memento Pattern (BattleLedger)](#6-memento-pattern-battleledger)
7. [Post-Restore Push Invariant](#7-post-restore-push-invariant)
8. [beatsAtStageEntry Invariant](#8-beatsatstageentry-invariant)
9. [tierStageSnapshot](#9-tierstagestagesnapshot)
10. [Cache-One-Per-Type Replay (LAN Server)](#10-cache-one-per-type-replay-lan-server)
11. [One-Way Data Flow (IPC)](#11-one-way-data-flow-ipc)
12. [Command Pattern (window.api)](#12-command-pattern-windowapi)
13. [Dual-Broadcast](#13-dual-broadcast)
14. [WebSocket Auto-Reconnect Loop](#14-websocket-auto-reconnect-loop)
15. [GM Alert Queue](#15-gm-alert-queue)
16. [Registry Pattern (StageRegistry)](#16-registry-pattern-stageregistry)
17. [Strategy Pattern (StageHandler)](#17-strategy-pattern-stagehandler)
18. [CSS Variable Resolver (Theming)](#18-css-variable-resolver-theming)
19. [CSS Custom Property Override (Inactive/Danger Buttons)](#19-css-custom-property-override-inactivedanger-buttons)
20. [Always-Visible Inactive Grid](#20-always-visible-inactive-grid)
21. [Shared/Toggling Slot (UI)](#21-sharedtoggling-slot-ui)
22. [Render Branch Chain (HudApp)](#22-render-branch-chain-hudapp)
23. [Derived State / Flattened Boolean Flags](#23-derived-state--flattened-boolean-flags)
24. [Cascading Priority Rule](#24-cascading-priority-rule)
25. [Tooltip + Disabled-Button Wrapper](#25-tooltip--disabled-button-wrapper)

---

## 1. State Machine Pattern (XState v5)

**What it is:**  
The entire combat lifecycle is modelled as a formal finite-state machine using XState v5. `tcMachine.ts` defines all states, transitions, guards, and context mutations. The machine is instantiated as an actor (`tcActor = createActor(tcMachine)`) and all state changes are driven by sending typed events to it (`tcActor.send({ type: 'TICK' })`).

**Where it is used:**  
`src/main/tc/tcMachine.ts` — machine definition  
`src/main/index.ts` — actor creation, event sends, subscription

**What to be careful of:**

- **XState v5 is synchronous by default.** `tcActor.send()` processes the event, runs all guards/actions/transitions, and fires the subscription — all before `send()` returns. Code that follows a `send()` call is NOT the right place to read the new state; the subscription is. Several patterns in this codebase (the `lastIpcOp` flag, `beatsAtStageEntry`, `pendingCrossTierCarry`) rely on this synchronous guarantee. If the library is ever upgraded to an async execution model, those patterns must be rethought.

- **Context mutations must happen inside machine actions.** Any field on `TCContext` (e.g. `beatsRemaining`, `currentStageIndex`, `timerSecondsRemaining`) is owned by the machine. Mutating it from outside the machine (e.g. directly patching `snapshot.context`) will not persist across the next transition. All bet-math and stage-index updates are done via XState `assign` actions inside the machine.

- **`checkAdvance` is a transient state.** It uses `always` transitions and resolves synchronously in the same microtask. The subscription fires for it — see Pattern 2.

- **Adding a new machine state:** Every part of the codebase that reads `machineState` as a string must be updated. This includes: derived-state flag assignments in `GmControls.tsx`, branch conditions in `HudApp.tsx`, icon/message maps in HUD components, and the `statusColor()` function. A missed branch produces silent wrong behaviour, not an error.

- **Adding a new event type:** The IPC handler sends it via `tcActor.send()`. The subscription must then handle whatever state transitions the new event causes — check whether the new transitions are correctly classified by the `entering`, `exiting`, `ticking` and reset-detection logic in the subscription. Also determine whether a `lastIpcOp` flag is needed (see Pattern 4).

---

## 2. Transient State Guard

**What it is:**  
`checkAdvance` is an XState `always`-transition pseudo-state that evaluates guards to decide the next stable state. Because XState v5 fires the subscriber for every state including transient ones, the subscription begins with an early-return guard:

```typescript
if (state === 'checkAdvance') return
```

**Where it is used:**  
`src/main/index.ts`, top of `tcActor.subscribe()`.

**What to be careful of:**

- **`prevMachineState` depends on this guard.** Without the early return, `prevMachineState` would be set to `'checkAdvance'` on the first subscription call, then the real target state arrives on the second call. Every transition comparison (`prevMachineState === 'stageActive'`, etc.) would then look back at `'checkAdvance'` rather than the genuine prior state, silently breaking all reset-detection and carry-forward logic.

- **The guard must be the very first thing in the subscription.** If any code runs before it (e.g. a log statement), that code executes twice per logical transition — once for `checkAdvance` and once for the real state. This has historically produced duplicate log entries that are confusing and hard to trace.

- **Never remove this guard** unless XState changes how it fires subscribers for always-transitions. The whole subscription depends on it.

- **Only `checkAdvance` is transient.** Do not extend this pattern to skip other states. Every other state should be processed fully by the subscription.

---

## 3. Shadow State (prevMachineState / prevStageIndex)

**What it is:**  
Two module-level variables in `index.ts` record the state and stage index from the PREVIOUS subscription call:

```typescript
let prevMachineState: string | null = null
let prevStageIndex: number = -1
```

They are updated at the very END of each subscription call (step 11, with the broadcast), after all side-effects have run. The gap between "current snapshot" and "prev" variables is the mechanism for detecting transitions.

**Where it is used:**  
`src/main/index.ts` — used throughout the subscription for `entering`, `exiting`, `ticking`, `releasingFromHold`, `resumingFromPause`, and all reset-detection comparisons.

**What to be careful of:**

- **Update order is load-bearing.** The prev variables must be updated AFTER all side-effect code. If you move the update earlier (e.g. to the top of the subscription), every transition comparison would compare current against current — all `entering`/`exiting` flags would be false.

- **`prevMachineState` and `prevStageIndex` are a pair.** They must always be updated together, in the same place, unconditionally. If one is updated in a conditional branch and the other is not, they become desynchronised and subsequent comparisons produce wrong results.

- **The transient state guard (Pattern 2) keeps these clean.** Because `checkAdvance` returns early, `prevMachineState` is never set to `'checkAdvance'`. Any code that skips early return for a new state must check whether that would corrupt the prev variables.

- **The prev variables are process-global.** They survive across rounds. Reset Battle (`RESET` event) drives the machine to `idle`, which IS processed by the subscription, which updates `prevMachineState` to `'idle'`. The -1 and null defaults are only relevant for the very first subscription call at startup.

---

## 4. Synchronous IPC-to-Subscription Coordination Flag (lastIpcOp)

**What it is:**  
A module-level flag set immediately before `tcActor.send()` in certain IPC handlers, and read by the subscription during that same synchronous call stack:

```typescript
let lastIpcOp: 'pass' | 'round-reset' | null = null
```

Because XState v5 processes events synchronously, the subscription fires — and completes — inside `tcActor.send()`. A flag set before `send()` is therefore visible to the subscription, and cleared after `send()` returns.

**Where it is used:**  
`src/main/index.ts`  
- `'pass'` — set in `tc:pass` IPC handler before sending `PASS`. The subscription sees this and skips logging a duplicate exit entry (the IPC handler already logged `gm-pass`).  
- `'round-reset'` — set in `tc:round-reset` IPC handler before sending `ROUND_RESET`. The subscription sees this and skips the tier-restore logic that would otherwise fire for a `stageGMHold → stageGMHold` transition (which also occurs during Tier Reset from Response hold — without the flag, Round Reset and Tier Reset look identical to the subscription).

**What to be careful of:**

- **This pattern breaks if XState ever becomes async.** If event processing is deferred to a microtask or promise, `send()` returns before the subscription fires, and the flag has already been cleared. The comment in `index.ts` documents this fragility explicitly. The safe long-term alternative is to carry the metadata inside the event itself (e.g. `{ type: 'PASS', _source: 'ipc' }`).

- **Always clear the flag after `send()`**, unconditionally. If `send()` throws (which it shouldn't in normal operation, but defensively), the flag could linger and corrupt the next IPC handler's subscription call.

- **Decision guide for new IPC ops:** You need a `lastIpcOp` flag if the subscription would independently re-do something the IPC handler already did, OR would misclassify the transition as a different event type. You do NOT need it if the subscription's side-effects are correct regardless of which IPC op triggered the transition.

- **Extending the union type:** If you add a new flag value, check every place the subscription reads `lastIpcOp` to ensure the new value doesn't fall through to an unintended branch. Consider using `=== 'round-reset'` (positive check) rather than `!== 'pass'` (negative check) so new values are inert unless explicitly handled.

---

## 5. Deferred Side Effect (pendingCrossTierCarry)

**What it is:**  
When a Response stage ends early via GM Release, the surplus beats cannot be forwarded immediately to the next tier's Action stage. Applying the carry-forward immediately would allow a Tier Reset (which is still available during Resolution's spin) to both restore the beat clock AND see the inflated Action allocation — double-counting. The carry is instead stored:

```typescript
let pendingCrossTierCarry: { fromStageIndex: number; surplusBeats: number } | null = null
```

And applied only when the current tier's Resolution spin completes — at which point Tier Reset for that tier is no longer possible.

**Where it is used:**  
`src/main/index.ts` — written in the carry-forward detection block; consumed and cleared in the deferred-carry application block; discarded on any reset detection.

**What to be careful of:**

- **The four zones must be maintained.** The comment in `index.ts` describes Zone 1 (safe, apply immediately), Zone 2 (pending, dangerous to apply), Zone 3 (safe to apply), Zone 4 (reset fired in Zone 2, discard). Any change to when Tier Reset becomes unavailable changes the Zone 2 window and the timing of when it becomes safe to apply.

- **`pendingCrossTierCarry` must be discarded on ALL reset paths.** Stage Reset, Tier Reset, and Round Reset each have code paths that clear it. If you add a new reset operation, you must also clear this variable. Failing to do so means stale carry-forward from a previous run gets applied to the fresh run.

- **Only Response stages produce cross-tier carry.** Action, timed, and other stages apply carry immediately. If you add a new stage type that can end early and its surplus should cross a tier boundary, you must decide whether it too needs the deferred mechanism — assess whether Tier Reset can still fire during the window between the stage's early exit and the next tier beginning.

- **The carry is not persisted through Round Reset.** The IPC handler for `tc:round-reset` explicitly nulls out `pendingCrossTierCarry`. This is correct — the round replays from scratch, so no carry from the previous run should leak in.

---

## 6. Memento Pattern (BattleLedger)

**What it is:**  
`BattleLedger` maintains a labeled snapshot stack so the beat log can be rolled back when a reset occurs. The stack holds up to three entries at any time: `round`, `tier`, and `stage`. Each entry is a deep clone of `BattleLedgerData` at the moment of the push.

Operations:  
- `push(type)` — save a clone of the current data under the given label  
- `restore(type)` — pop and re-hydrate from the named label (discarding higher-level entries first)  
- `discard(type)` — remove the named label without restoring (used on normal completion)

**Where it is used:**  
`src/main/battle/BattleLedger.ts` — class definition  
`src/main/index.ts` — push/discard/restore calls scattered through the subscription and IPC handlers

**What to be careful of:**

- **Hierarchy levels are enforced.** `discard('tier')` will not pop past a `'round'` entry. The level constants (`round=0, tier=1, stage=2`) define this. If you add a new snapshot level, assign it a level number and verify the while-loop conditions in `discard` and `restore` still behave correctly.

- **Restore CONSUMES the snapshot.** After `restore('tier')`, the tier entry is gone from the stack. See Pattern 7 for why this matters and what to do about it.

- **Deep clone is expensive for large logs.** `cloneData` uses `JSON.parse(JSON.stringify(...))`. For a long battle with many stages, the beat log grows. The clone comment explicitly notes "swap this method out if JSON clone becomes a performance concern." If you see performance issues in long battles, replace with a structural clone or a copy-on-write array approach.

- **The stack is NOT synced across process boundaries.** The BattleLedger lives only in the main process. The rendered beat log is broadcast as a flat array in `BattleLedgerPayload`. The snapshot stack itself is never transmitted to the renderer or HUD.

- **`reset()` wipes both data and stack.** It is called by the `RESET` IPC handler (Reset Battle). Calling it at any other time would destroy all snapshots and make any subsequent Stage/Tier Reset a no-op.

---

## 7. Post-Restore Push Invariant

**What it is:**  
After every `restore('tier')` call, the caller IMMEDIATELY calls `push('tier')`. This re-anchors the snapshot at the restored state so that a second Tier Reset on the same re-run can find a valid tier entry.

```typescript
battleLedger.restore('tier')
battleLedger.push('tier')   // invariant: always follows restore('tier')
```

There are three `restore('tier')` call sites in `index.ts`, and each is followed by `push('tier')`.

An `isResetReentry` guard at the subscription's normal tier-push block prevents the subscription from pushing a SECOND tier snapshot when it observes the `stageGMHold` entry that results from the reset — which would otherwise double-push.

**Where it is used:**  
`src/main/index.ts` — three Tier Reset handler sites, plus the `isResetReentry` guard at the tier-push check site.

**What to be careful of:**

- **Never add a `restore('tier')` call without immediately following it with `push('tier')`.** The invariant is not enforced by the BattleLedger class itself — it is a caller contract. Violating it means a second Tier Reset finds no tier snapshot, silently does nothing, and the beat log is not rolled back for the second re-run.

- **The `isResetReentry` guard must be set before the `restore` and cleared after the `push`.** If it is not set, the subscription's normal tier-push block fires for the same event, creating a duplicate snapshot. If it is not cleared, future legitimate tier entries are suppressed.

- **This invariant is specific to tier-level resets.** Stage Reset (`restore('stage')`) does NOT need a matching immediate `push('stage')` because Stage Reset sends the machine back to `stageGMHold` for the same stage, and the subscription then fires `releasingFromHold` on the subsequent `stageGMHold → stageActive` transition, which pushes a fresh stage snapshot at the right moment.

---

## 8. beatsAtStageEntry Invariant

**What it is:**  
`TCContext.beatsAtStageEntry` is set once when a stage is first entered (in `checkAdvance`) and MUST NOT be mutated again until the stage exits. It is the fixed reference point for calculating surplus carry-forward beats:

```
surplusBeats = beatsRemaining − (beatsAtStageEntry − stage.beats)
```

If `beatsAtStageEntry` were mutated mid-stage (e.g. by a TICK accidentally updating it), the surplus calculation would be wrong and carry-forward would over- or under-allocate beats to the next stage.

**Where it is used:**  
`src/main/tc/tcMachine.ts` — set in `checkAdvance` via `assign`, never mutated by TICK, SPIN_TICK, or any event other than the next `checkAdvance`.

**What to be careful of:**

- **Never add an `assign` to `beatsAtStageEntry` in any transition other than `checkAdvance`.** Even if a carry-forward inflates the current stage's `stage.beats` mid-stage (which it shouldn't), `beatsAtStageEntry` must not follow. It is the pre-carry baseline.

- **Stage Reset restores `beatsAtStageEntry`** via the machine's STAGE_RESET event (which resets `beatsRemaining` to the prior value). The value after reset must match what the subscription's ledger restore also rolled back to. Confirm that any new reset logic keeps these two sources in sync.

- **The surplus formula assumes `beatsAtStageEntry >= stage.beats`.** This is guaranteed because the machine only enters a stage after `beatsRemaining` is equal to the prior value, and stages are never entered with more beats allocated than the current remaining budget. If a future plugin assigns a stage a `beats` value greater than what could possibly be remaining, the formula produces a negative surplus — which is treated as zero by the carry-forward code, but may warrant a guard.

---

## 9. tierStageSnapshot

**What it is:**  
When the machine enters Action `stageGMHold` for a new tier, a `TierStageSnapshot` is captured in `TCContext`:

```typescript
interface TierStageSnapshot {
  actionIndex: number; actionBeats: number; actionTimerSeconds: number;
  responseIndex: number; responseBeats: number; responseTimerSeconds: number;
}
```

This snapshot holds the beat allocations for the tier's Action and Response stages at tier-entry time, before any intra-tier carry-forward has been applied. `TIER_RESET` and `STAGE_RESET` restore the pipeline to these values, undoing any intra-tier carry inflation.

**Where it is used:**  
`src/main/tc/tcMachine.ts` — captured in `stageGMHold` entry action, consumed in `TIER_RESET` and `STAGE_RESET` handlers.

**What to be careful of:**

- **Capture must happen at Action `stageGMHold` entry, not at `stageActive` entry.** By the time `stageActive` fires, carry-forward from the previous tier may already have been applied to the Action stage's beat/timer values. Capturing at `stageGMHold` is the one moment when the values are pristine for this tier.

- **The snapshot only covers Action and Response.** If the tier triad is extended to include additional stages (e.g. a post-Action buffer stage), the snapshot must be extended too. Resolution is not included because it is never the target of a carry-forward from within the tier (only from between tiers).

- **Stage Reset uses the same snapshot as Tier Reset.** Both restore Action/Response beat allocations to the tier-entry values. This is correct for Tier Reset (the whole tier replays), and ALSO correct for Stage Reset mid-Response (the carry from Action to Response needs to be undone). If you add a new stage type between Action and Resolution, verify whether Stage Reset should preserve or undo its allocation.

---

## 10. Cache-One-Per-Type Replay (LAN Server)

**What it is:**  
The LAN server's `messageCache` is a `Map<string, string>` keyed by `WSMessage.type`. Every broadcast overwrites the previous value for that type. When a new WebSocket client connects, ALL cache entries are replayed to it immediately.

```typescript
const messageCache = new Map<string, string>()
// On broadcast: messageCache.set(type, JSON.stringify(data))
// On connect: messageCache.forEach(msg => ws.send(msg))
```

**Where it is used:**  
`src/main/server/lanServer.ts`

**What to be careful of:**

- **One entry per type is sufficient because messages are full snapshots, not diffs.** `TC_STATE` always contains the complete `TCStatePayload`. A client that connects mid-combat gets the current full state, not the delta since the last broadcast. If you ever introduce a DIFF-based message type, this cache strategy would be wrong — a new client would only get the last diff, not the full current state. Such a type would require either a separate cache slot holding the full current state, or removing the cache replay for that type entirely.

- **Two types must never overwrite each other.** The cache key is `WSMessage.type` (`'TC_STATE'` and `'LEDGER_STATE'`). A replay client must receive both to have a complete picture. If you add a third message type that should be replayed, it automatically gets its own cache slot — no code change needed. If you add a type that should NOT be replayed (e.g. a one-shot event), do not give it a `type` field, or null-check before calling `messageCache.set`.

- **`readyState === OPEN` check before send.** WebSocket clients can be in a transitional state between the `close` event firing and the client being removed from the `clients` Set. The readyState check prevents `send()` errors. Never remove this check — it is a real race condition in the WebSocket lifecycle.

- **The broadcast is fire-and-forget.** There is no acknowledgement, retry, or ordering guarantee. A very fast burst of events (e.g. rapid TICK + GM Release + stage advance in the same second) can result in a client receiving messages out of order if the underlying socket buffers. This is acceptable because every message is a full snapshot — the last one received is always authoritative.

---

## 11. One-Way Data Flow (IPC)

**What it is:**  
State flows in one direction only: **main process → renderer**. The renderer never sends state TO the main process via a subscription or event listener. Commands travel in the other direction (renderer → main via explicit IPC sends), but those are point-to-point requests, not state subscriptions.

```
Main process (machine) → IPC events → Renderer subscriptions → React state
```

The renderer reads state via `window.api.onStateUpdate(cb)` and `window.api.onLedgerUpdate(cb)`. The renderer sends commands via `window.api.startCombat()`, `window.api.gmRelease()`, etc.

**Where it is used:**  
`src/main/index.ts` — broadcasts  
`src/renderer/src/components/GmControls.tsx` — `onStateUpdate` subscription  
`src/renderer/src/App.tsx` — `onLedgerUpdate` subscription  
`src/preload/index.ts` — IPC bridge definition

**What to be careful of:**

- **Never add state to the renderer that the main process needs.** If the renderer ever needs to communicate game state back to the main process (e.g. "UI is ready"), use a discrete IPC command, not a shared state subscription. The machine is the single source of truth.

- **Cleanup handlers must be called on unmount.** The `window.api.off*` methods remove the listener registered by the corresponding `on*` call. Failing to call `offStateUpdate()` in the `useEffect` cleanup leaves an orphaned listener that fires on every state update even after the component has unmounted. On Vite hot-reload this causes listener accumulation and stale closures.

- **The preload bridge is the only crossing point.** All IPC communication passes through `src/preload/index.ts` via `contextBridge.exposeInMainWorld`. No renderer code has direct access to `ipcRenderer` or Node modules. This is a security boundary — do not add raw `ipcRenderer` calls in renderer code.

---

## 12. Command Pattern (window.api)

**What it is:**  
All GM actions are fire-and-forget method calls on the `window.api` object exposed by the preload script. Each method calls `ipcRenderer.send('tc:...')`, which is handled by a corresponding `ipcMain.on('tc:...')` handler in `index.ts`. The handler sends an event to `tcActor`.

```
window.api.gmRelease() → ipcRenderer.send('tc:gm-release') → ipcMain.on('tc:gm-release') → tcActor.send({ type: 'GM_RELEASE' })
```

**Where it is used:**  
`src/preload/index.ts` — bridge definition  
`src/renderer/src/components/GmControls.tsx` — all button `onClick` handlers  
`src/main/index.ts` — all `ipcMain.on` handlers

**What to be careful of:**

- **Commands are one-shot and have no return value.** `ipcRenderer.send` is asynchronous and non-blocking. There is no confirmation that the machine accepted the event. If you need a response (e.g. validation result), use `ipcRenderer.invoke` / `ipcMain.handle` instead.

- **The machine silently ignores events that are invalid in the current state.** XState guards prevent illegal transitions, but this means a button that incorrectly enables a command in the wrong state will simply do nothing visible. The UI availability logic in `GmControls.tsx` is the only enforcement of "which commands are valid when." If you add a new command, both the machine guard AND the UI guard must be correct, and they must agree.

- **All command methods are on `window.api`.** Adding a new command requires: (1) a new method in the preload bridge, (2) a new `ipcMain.on` handler in `index.ts`, (3) a new event type in the machine, (4) a new button in `GmControls.tsx`. Missing any step silently fails.

---

## 13. Dual-Broadcast

**What it is:**  
Every state change produces two broadcasts: one via IPC to the GM Dashboard renderer, and one via WebSocket to all LAN clients (Group HUD, future player dashboards).

```typescript
function broadcastLedger(): void {
  mainWindow?.webContents.send('ledger:update', data)        // IPC
  lanServer.broadcast({ type: 'LEDGER_STATE', payload: data }) // WebSocket
}
```

The same pattern applies to `TCStatePayload` at the bottom of the subscription.

**Where it is used:**  
`src/main/index.ts` — end of subscription (TC state) and `broadcastLedger()` helper

**What to be careful of:**

- **Both transports must be updated together.** Any new state slice that the renderer or HUD needs must be broadcast on both channels. A common mistake is to add an IPC send but forget the WebSocket broadcast (or vice versa), causing the two surfaces to show different state.

- **WebSocket JSON serialisation is lossy for some types.** Dates become strings, `undefined` becomes `null` or is dropped, BigInts throw. The `TCStatePayload` and `BattleLedgerPayload` types currently use only numbers, strings, booleans, and arrays, so this is not a problem. If you add a field with a non-serialisable type, ensure you serialise it explicitly before broadcast.

- **`mainWindow?.webContents.send` is a no-op if `mainWindow` is null.** The GM Dashboard window can theoretically be closed while combat is running. The IPC broadcast silently does nothing in that case. This is generally acceptable (the GM closed the window intentionally), but be aware that ledger state is only recoverable from the LAN server's cache, not from the main process memory, after a window close.

---

## 14. WebSocket Auto-Reconnect Loop

**What it is:**  
The Group HUD's WebSocket connection is managed by a `useEffect` in `HudApp.tsx`. On `onclose`, a 2-second timer schedules a reconnect. On `onerror`, the socket is force-closed so `onclose` always fires (driving the reconnect loop). The pending timer is cleared in the cleanup function on unmount.

**Where it is used:**  
`src/renderer/src/hud/HudApp.tsx`

**What to be careful of:**

- **The reconnect timer must be captured in a closure variable, not React state.** Using `useState` for the timer ID would cause a re-render on every schedule/clear, which could interfere with the WebSocket lifecycle. The timer ID is a local variable captured by the `onerror`/`onclose` closures.

- **Force-close in `onerror` is intentional.** Without it, an error event without a subsequent `close` event (which is possible in some WebSocket implementations) would leave the component in a broken "error, no retry" state. The force-close ensures `onclose` always fires. Do not remove the `ws.onerror = () => ws.close()` line.

- **Cleanup function cancels the timer AND closes the socket.** Both are necessary. Closing the socket without cancelling the timer allows the reconnect to fire after unmount, creating a new socket against a torn-down React component. Cancelling the timer without closing the socket leaves an open, unmanaged connection.

- **`WS_URL` uses `window.location.hostname`.** This is deliberate for LAN compatibility. Do not change it to `'localhost'` — remote clients connecting over LAN would connect to themselves.

---

## 15. GM Alert Queue

**What it is:**  
GM alerts (non-fatal plugin config errors, validation warnings, SPIN_EXCEPTION events) are delivered to the GM Dashboard as a string queue. The queue appends on receive and shifts (removes index 0) on dismiss. `TopBar` always renders only `gmAlerts[0]`, with a `[N]` count prefix when multiple are queued.

**Where it is used:**  
`src/renderer/src/App.tsx` — queue state, `onGmAlert` subscription, `onDismissAlert` handler  
`src/renderer/src/components/TopBar.tsx` — renders the queue front

**What to be careful of:**

- **Do not replace the queue with a single `useState<string | null>`.** Multiple alerts can fire in rapid succession during Start Combat config validation (each invalid stage definition in the plugin fires one). A single-value store drops all but the last. The queue guarantees every alert is surfaced.

- **The dismiss callback removes by index, not by value.** `onDismissAlert(0)` filters out the item at position 0: `prev.filter((_, j) => j !== 0)`. If you need to allow dismissal of arbitrary queue items (e.g. a "dismiss all" button), you would need to change the filter predicate.

- **Alerts are one-shot push notifications, not live state.** They arrive once and must be acknowledged. Do not use this mechanism for state that needs to stay current (e.g. "machine is in state X") — that belongs in `TCStatePayload`.

---

## 16. Registry Pattern (StageRegistry)

**What it is:**  
`StageRegistry` is a plain object mapping stage type strings to `StageHandler` implementations. It is the single registration point for all stage types the system supports.

```typescript
export const StageRegistry: Record<string, StageHandler> = {
  'gm-release': GmReleaseHandler,
  'timed':      TimedHandler,
  // ...
}
```

**Where it is used:**  
`src/main/stages/registry.ts` — registry definition  
`src/main/index.ts` — hook dispatch via `StageRegistry[stage.type]`

**What to be careful of:**

- **A missing registry entry is silently ignored.** The dispatch code checks `if (handler)` before calling. If a plugin uses a stage type that has no registry entry, `onEnter`/`onTick`/`onExit` simply do not fire. This is intentional for stubs but means a typo in a stage type (e.g. `'gm_release'` vs `'gm-release'`) will silently produce a stage that does nothing.

- **The registry key must exactly match the `StageType` union in `shared/types.ts`.** Adding a new stage type requires updating both the registry and the union. The shared type drives TypeScript safety everywhere else (guards, switch statements, etc.). Updating one without the other causes a type error in some places and silent miss in others.

- **Adding a new stage type:** (1) Create the handler in `src/main/stages/`, (2) import it in `registry.ts`, (3) add the entry to `StageRegistry`, (4) add the type string to `StageType` in `shared/types.ts`. See the comment in `registry.ts` for the full checklist.

---

## 17. Strategy Pattern (StageHandler)

**What it is:**  
Each stage type has a `StageHandler` object with three lifecycle methods: `onEnter(stage, context)`, `onTick(stage, context)`, `onExit(stage, context)`. All current implementations are stubs. The Strategy pattern allows each stage type to have its own behaviour plugged in without modifying the dispatch logic.

**Where it is used:**  
`src/main/stages/StageHandler.ts` — interface  
`src/main/stages/*.ts` — per-type implementations  
`src/main/index.ts` — hook dispatch

**What to be careful of:**

- **`onExit` does not distinguish why the stage ended.** It fires for GM Release, natural expiry, GM Pass, and reset. If a handler needs to know the exit reason (e.g. to decide whether to commit calculation results), there is currently no way to determine this. The `registry.ts` comment documents this as a known gap: "add an `exitReason` parameter to `StageHandler.onExit`." Do not assume the exit was "clean" in an `onExit` handler.

- **`onEnter` fires at the first entry state for each stage type.** For `action` and `response` stages, the first entry state is `stageGMHold`, not `stageActive`. The `entering` flag in the subscription is true when the machine enters any "in-stage" state (`stageGMHold OR stageActive`) at a NEW stage index. The transition from `stageGMHold → stageActive` on the same stage does NOT re-fire `onEnter`. Handlers that need to know when the player countdown actually started must track `releasingFromHold` separately.

- **Handlers must be synchronous.** The subscription runs synchronously in the XState event-processing stack. An async handler (returning a Promise) would start a background task but the subscription would not await it. The async result would arrive at an unknown future point with no context about the current machine state. Resolution's `onExit` is the one case that will eventually need to send `SPIN_COMPLETE` or `SPIN_EXCEPTION` — it must do so asynchronously via a timer or Promise callback that calls `tcActor.send()`, not by returning anything from `onExit`.

---

## 18. CSS Variable Resolver (Theming)

**What it is:**  
Each theme exports a Mantine `CSSVariablesResolver` function that returns `{ variables: { '--tm-*': value, ... } }`. Mantine calls this resolver and injects the returned values as CSS custom properties on `:root` (or the nearest theme boundary). Switching themes calls `setTheme()` from `ThemeContext`, which swaps both the Mantine `createTheme(...)` object AND the resolver simultaneously.

**Where it is used:**  
`src/renderer/src/themes/tactical.ts`, `arcane.ts`, `iron.ts` — definitions  
`src/renderer/src/themes/index.ts` — registry  
`src/renderer/src/context/ThemeContext.tsx` — provider  
Every component that uses `var(--tm-*)` CSS properties

**What to be careful of:**

- **All three themes must define all `--tm-*` variables.** If one theme is missing a variable that another theme defines, components on that theme will fall back to the browser default (usually transparent or black), causing silent layout or colour breakage. After adding a new `--tm-*` variable to one theme, add it to all three immediately.

- **`--tm-*` variables are game-UI-specific.** Mantine's own component variables (`--mantine-color-*`, etc.) are managed separately. Do not use `--mantine-*` variable names in the resolver — they are internal to Mantine and may be overwritten or ignored by Mantine's own theming pipeline. Use `--tm-*` for all custom game UI colours.

- **Theme swaps are immediate.** `setTheme()` triggers a React context re-render across the entire component tree. Every component reading `var(--tm-*)` immediately picks up the new values. If a component caches a `var(--tm-*)` value in a JavaScript variable (not in CSS), it will be stale after a theme swap.

- **The inactive and danger-zone variables** (`--tm-inactive-*`, `--tm-danger-zone-*`) were added later than the original variables. If you create a new theme by copying an existing one, make sure it includes these variables — they are required by `GmControls.tsx` and a missing definition will cause the inactive/danger buttons to render with no background or border.

---

## 19. CSS Custom Property Override (Inactive/Danger Buttons)

**What it is:**  
Mantine v7 Button's disabled appearance is normally controlled by the `[data-disabled]` CSS attribute selector. Inline `style` props CAN override this because inline styles have higher specificity than attribute selectors in CSS. The INACTIVE and DANGER style objects in `GmControls.tsx` use Mantine's internal CSS custom properties (`--button-bg`, `--button-hover`, `--button-color`, `--button-bd`) to take over the button's appearance:

```typescript
const INACTIVE: React.CSSProperties = {
  '--button-bg':    'var(--tm-inactive-bg)',
  '--button-hover': 'var(--tm-inactive-bg)',
  '--button-color': 'var(--tm-inactive-text)',
  '--button-bd':    '1px solid var(--tm-inactive-border)',
  opacity: 1,
} as React.CSSProperties
```

The `as React.CSSProperties` cast is necessary because TypeScript's `React.CSSProperties` type doesn't formally include CSS custom property keys.

**Where it is used:**  
`src/renderer/src/components/GmControls.tsx` — `INACTIVE` and `DANGER` constants, `Slot` component

**What to be careful of:**

- **This relies on Mantine v7 Button's internal CSS variable names.** If Mantine is upgraded and the internal variable names change (e.g. to `--button-background`), the override silently stops working — the button would show Mantine's default disabled appearance instead of the thematic dead colour. After any Mantine upgrade, visually test the inactive buttons.

- **`opacity: 1` is required.** Mantine's `[data-disabled]` rule sets `opacity: 0.4`. Without the explicit `opacity: 1` override in the style object, the button would show at 0.4 opacity on top of the dead colour, making it even harder to read. The custom-property overrides change the colour, but the opacity is a separate declaration — both must be in the style object.

- **`pointerEvents: 'none'` must be on the Button, not the wrapper Box.** The Box wrapper needs to capture hover events so that the Tooltip renders. If `pointerEvents: 'none'` were on the Box, the Tooltip would never fire. If it were absent from the Button, the click handler might be reached even on the "inactive" path if the user manages to click fast enough before the style applies.

- **The cast `as React.CSSProperties` hides the custom property keys from TypeScript.** This means if you misspell `--button-bg` (e.g. `--buton-bg`), TypeScript will not catch it — the override simply has no effect and Mantine's default disabled style shows. Double-check spelling against Mantine's source if behaviour looks wrong.

---

## 20. Always-Visible Inactive Grid

**What it is:**  
All nine combat control buttons are always rendered in a fixed 3×3 CSS grid. Unavailable buttons use the INACTIVE style (Pattern 19) rather than being conditionally removed. The grid never changes shape; only the button contents and styles change.

**Where it is used:**  
`src/renderer/src/components/GmControls.tsx` — the `Box` with `display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)'`

**What to be careful of:**

- **Slot 1 (Start Combat / Next Round) and Slot 6 (Pause / Resume) ARE conditionally rendered** — they swap between two different buttons, not between active and inactive states of the same button. See Pattern 21. The grid shape is preserved because both alternatives render as a full-width button occupying the same cell.

- **Adding a tenth button to the 3×3 grid will break the layout.** The grid is designed for exactly nine. If you need a tenth button, either add a fourth row (change to `repeat(4, 1fr)` columns or add a new row), or consolidate an existing button.

- **`fullWidth` on every Slot button is required.** Without `fullWidth`, the buttons shrink to their text content width and the grid cells show gaps. All Button and Slot calls inside the grid must include `fullWidth`.

- **The purpose of this pattern is spatial memory.** Do not add exceptions where a button in the grid disappears in certain states. If a button is contextually irrelevant, make it inactive (INACTIVE style + disabled); do not hide it. Hiding disrupts the fixed positions the GM has memorised.

---

## 21. Shared/Toggling Slot (UI)

**What it is:**  
Two grid slots contain a conditional expression that renders one of two entirely different buttons depending on machine state:

- **Slot 1:** `isComplete ? <Next Round> : <Start Combat (active or inactive)>`  
- **Slot 6:** `canResume ? <Resume> : <Pause (active or inactive)>`

Both alternatives render a full-width `Slot`-pattern button, so the grid cell geometry is preserved regardless of which branch renders.

**Where it is used:**  
`src/renderer/src/components/GmControls.tsx`

**What to be careful of:**

- **Both branches must produce the same DOM structure shape** (a full-width button occupying one grid cell). If one branch renders a `Group` of two buttons and the other renders a single button, the grid layout breaks.

- **The inactive variant of the "off" state must also be full-width.** In Slot 1, when `!isIdle && !isComplete`, Start Combat renders as inactive (INACTIVE style). It is still a full-width button via the `Slot` component's `!can` branch. Do not conditionally remove or shrink it.

- **Slot 1 has a three-way logical state** (`isIdle` → active Start, `isComplete` → active Next Round, otherwise → inactive Start), implemented as a two-branch ternary where the "else" branch is itself aware of `isIdle`. Adding a fourth logical state (e.g. active in `battleEnded`) should be done by extending the ternary or extracting a helper, not by nesting further ternaries.

---

## 22. Render Branch Chain (HudApp)

**What it is:**  
`HudApp.tsx` has four mutually exclusive render branches evaluated as an ordered if-chain before the main return:

1. `!connected` → "Connecting…" splash  
2. `isIdle` → "Awaiting combat start…" splash  
3. `isBattleEnded` → full-screen beat log recap  
4. All other states → live combat HUD grid

**Where it is used:**  
`src/renderer/src/hud/HudApp.tsx`

**What to be careful of:**

- **Order matters.** Branch 1 must come before branch 2 because `!connected` AND `state === null` could both be true simultaneously on first load. If branch 2 ran first, it would show "Awaiting combat start" instead of "Connecting", hiding the connection status from the user.

- **Adding a new branch:** Insert it in priority order. If the new branch should show for a specific machine state, it must come before branch 4 (the catch-all live HUD). If it should override the idle splash, it must come before branch 2.

- **Branch 4 has a hard-coded assertion** — it calls `state!.round`, `state!.stages`, etc. with the non-null assertion `!` because branches 1 and 2 have already guarded against `state === null`. If you insert a new branch that allows `state` to be null after branch 2, the non-null assertions in branch 4 will throw.

- **`isIdle` catches both the pre-connect case AND the genuine idle state.** The comment in the code notes this: `isIdle = !state || state.machineState === 'idle'`. A newly connected client that hasn't received a `TC_STATE` message yet (`state === null`) also falls into branch 2, which is intentional — the splash is the same.

---

## 23. Derived State / Flattened Boolean Flags

**What it is:**  
Rather than referencing `machineState === 'stageGMHold'` throughout the render, `GmControls.tsx` computes a set of named boolean flags at the top of the function body:

```typescript
const isGMHold       = machineState === 'stageGMHold'
const isActive       = machineState === 'stageActive'
const isPaused       = machineState === 'stagePaused'
// ...
const releaseActive  = inCombat && !isComplete && !isBattleEnded && canRelease
const isReleaseEmphatic = isGMHold || (isActive && currentStage?.type === 'gm-release')
```

All downstream button logic reads these named flags, not raw strings.

**Where it is used:**  
`src/renderer/src/components/GmControls.tsx`, `src/renderer/src/hud/HudApp.tsx`

**What to be careful of:**

- **All flags are derived from `tc` (state snapshot) and recomputed on every render.** They are not stored in `useState`. If you add a new flag that depends on a value that changes over time (e.g. a timer), ensure it derives from the `tc` state snapshot, not from a stale local variable.

- **Compound flags (like `releaseActive`, `isReleaseEmphatic`) silently encode business rules.** `isReleaseEmphatic` is a two-condition OR. The second condition (`isActive && stage.type === 'gm-release'`) was added specifically because `gm-release` stages bypass `stageGMHold`. If you add a third stage type that also bypasses GM Hold but requires emphatic treatment, it must be added here. A missed condition produces a silent wrong appearance, not an error.

- **The flags are evaluated in top-to-bottom order**, and some depend on earlier flags (e.g. `releasePulse` depends on `releaseActive` which depends on `canRelease` which depends on `isGMHold`). Insert new flags in logical dependency order, not at random positions in the list.

---

## 24. Cascading Priority Rule

**What it is:**  
Several places in the codebase implement a multi-condition priority cascade — a fixed sequence of checks where the first match wins and later conditions are not evaluated. The Round Visibility evaluation and the HUD's `getMessage` / `getIcon` functions are the clearest examples.

Round visibility cascade in `roundVisibilityUtils.ts`:
1. If any `i#` matches → inactive (stop)
2. If no `I#` entries → active (stop)
3. Find highest `I#` ≤ round; if none → active (stop)
4. `I#` in effect → active only if explicit `A#` matches

HUD `getMessage` priority:
1. `tcComplete` → "Round complete. Awaiting GM."
2. `stagePaused` → "Combat paused."
3. `stageGMHold` → "GM is preparing…"
4. Stage `description` (fallback)

**Where it is used:**  
`src/main/stages/roundVisibilityUtils.ts`  
`src/renderer/src/hud/components/MessageArea.tsx`  
`src/renderer/src/hud/components/DigitalCountdown.tsx`

**What to be careful of:**

- **Inserting a new condition at the wrong priority level changes behaviour for all existing conditions below it.** In the round visibility cascade, inserting a new check between steps 2 and 3 could prevent step 3 from ever being reached in some scenarios. Map out all existing test cases before inserting.

- **Conditions must be mutually exclusive at the implementation level, even if conceptually they could overlap.** In `getMessage`, `tcComplete` and `stageGMHold` cannot both be true at the same time (the machine never occupies two states simultaneously), so their order only matters for code clarity. But `stageGMHold` and `stage.type === 'gm-release'` CAN both appear in the same context — the order in the DigitalCountdown handles this by checking machine state before stage type.

- **Silent first-match semantics mean a condition can mask another.** In the DigitalCountdown, `stageGMHold` produces a "GM" icon with the same appearance as `stage.type === 'gm-release'` in `stageActive`. If future changes make these look different (e.g. different icons), the GM Hold check MUST remain above the gm-release check, or the Hold display would be overridden.

---

## 25. Tooltip + Disabled-Button Wrapper

**What it is:**  
Mantine's `Tooltip` does not show on a disabled element (pointer events are suppressed on disabled inputs). To show a tooltip on an inactive button, a `Box` wrapper captures the hover event and the `Button` itself has `pointerEvents: 'none'`:

```tsx
<Tooltip label="...">
  <Box style={{ cursor: 'not-allowed', width: '100%' }}>
    <Button disabled style={{ ...INACTIVE, pointerEvents: 'none' }}>
      Label
    </Button>
  </Box>
</Tooltip>
```

**Where it is used:**  
`src/renderer/src/components/GmControls.tsx` — `Slot` component's `!can` branch, and inline in the danger zone section.

**What to be careful of:**

- **`pointerEvents: 'none'` must be on the Button, not the Box.** The Box is the hover target for the Tooltip. If the Box has `pointerEvents: 'none'`, neither the Tooltip nor the cursor shows. The Button having `pointerEvents: 'none'` means clicks pass through to the Box (which has no click handler), effectively disabling the click while keeping hover.

- **`width: '100%'` on the Box is required inside a grid.** Without it, the Box shrinks to its content width (the button's minimum intrinsic width), which may not fill the grid cell. The `fullWidth` prop on the Button fills the Box; the Box's `width: '100%'` fills the grid cell.

- **`cursor: 'not-allowed'` is on the Box.** The Button renders with `cursor: default` when disabled. The Box overrides this at the wrapper level so the "no entry" cursor appears over the entire cell, not just the button's footprint.

- **Active buttons (the `can = true` branch) do NOT use this wrapper.** They render as a plain `<Tooltip><Button .../></Tooltip>`. Adding the Box wrapper to active buttons unnecessarily — even without `cursor: not-allowed` — adds a layer of DOM that can interfere with Mantine's Button hover animations and focus ring.
