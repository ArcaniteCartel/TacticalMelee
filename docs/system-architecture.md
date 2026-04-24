# TacticalMelee — System Architecture

This document describes the full architecture of TacticalMelee: every component, its
responsibilities, its interfaces, and how components find and communicate with each other.

---

## 1. High-Level Overview

TacticalMelee is an **ElectronJS desktop application** that runs a combat timing aid for
tabletop RPGs. It presents two simultaneous surfaces to the table:

- **GM Dashboard** — the GM's control panel, running in the main Electron window
- **Group HUD** — a read-only display for all players, designed for a second screen or
  a LAN-connected device

Architecturally the application follows a strict **hub-and-spoke** model:

```
                        ┌─────────────────────────────────┐
                        │         MAIN PROCESS            │
                        │                                 │
  GM Dashboard  ──IPC──▶│  index.ts (coordinator)         │
  (renderer)    ◀──IPC──│    │                            │
                        │    ├── tcActor (XState machine)  │
                        │    ├── BattleLedger              │
                        │    ├── StagePlanner              │
                        │    ├── ActivePlugin              │
                        │    ├── StageRegistry             │
                        │    └── lanServer                 │
                        │              │                  │
                        └──────────────┼──────────────────┘
                                       │ WebSocket (port 3001)
                                 ┌─────┴──────┐
                                 │ Group HUD  │
                                 │ (browser)  │
                                 └────────────┘
```

All game state lives exclusively in the **main process**. Neither the GM Dashboard nor
the Group HUD own any authoritative game state — they are pure views. The main process
pushes complete state snapshots to both surfaces on every change.

---

## 2. Component Inventory

| Component | Location | Process |
|---|---|---|
| Main process coordinator | `src/main/index.ts` | Main |
| XState machine | `src/main/tc/tcMachine.ts` | Main |
| BattleLedger | `src/main/battle/BattleLedger.ts` | Main |
| StagePlanner | `src/main/stages/stagePlanner.ts` | Main |
| ActivePlugin | `src/main/plugins/ActivePlugin.ts` | Main |
| StageRegistry | `src/main/stages/registry.ts` | Main |
| Stage handlers | `src/main/stages/*.ts` | Main |
| Round visibility utils | `src/main/stages/roundVisibilityUtils.ts` | Main |
| LAN server | `src/main/server/lanServer.ts` | Main |
| Logger | `src/main/logger.ts` | Main |
| Preload bridge | `src/preload/index.ts` | Preload (isolated) |
| GM Dashboard | `src/renderer/src/App.tsx` + children | Renderer |
| Group HUD | `src/renderer/src/hud/HudApp.tsx` + children | Browser/Renderer |
| Shared types | `src/shared/types.ts`, `src/shared/battleTypes.ts` | Both |

---

## 3. Component Details

### 3.1 Main Process Coordinator (`src/main/index.ts`)

**The central hub of the entire application.** Everything else is a spoke.

**Responsibilities:**
- Creates and owns all main-process singletons
- Registers the XState subscription that reacts to every state transition
- Handles all IPC messages from the GM Dashboard and translates them to machine events
- Manages real-time timers (TICK and SPIN_TICK intervals)
- Coordinates BattleLedger push/restore/discard operations in lockstep with machine transitions
- Triggers StagePlanner carry-forward after GM Release events
- Broadcasts state to both surfaces after every transition

**Singletons created here:**

```typescript
const activePlugin  = new ActivePlugin()
const tcActor       = createActor(tcMachine)
const lanServer     = createLanServer()
const stagePlanner  = new StagePlanner(activePlugin.getConfig().minAdjustedTimerSeconds)
const battleLedger  = new BattleLedger()
```

**State shadows** (module-level variables that track the previous subscription call):

```typescript
let prevMachineState: string | null = null   // last stable machine state
let prevStageIndex: number = -1              // last stage index
let lastIpcOp: 'pass' | 'round-reset' | null = null  // IPC→subscription coordination flag
let pendingCrossTierCarry: { fromStageIndex: number; surplusBeats: number } | null = null
```

**Subscription processing order** (every state transition):

1. Skip transient `checkAdvance` state
2. Compute `entering`, `exiting`, `ticking`, `releasingFromHold` flags
3. Dispatch `onEnter` / `onTick` / `onExit` to StageRegistry
4. Push stage snapshot and log `stage-start` (on `stageActive` entry)
5. Detect carry-forward surplus (on `stageActive → stageSpin`)
6. Clear `pendingCrossTierCarry` if a reset is detected
7. Apply deferred cross-tier carry (on Resolution spin → next tier's `stageGMHold`)
8. BattleLedger restore/discard (on `stageGMHold` entry, based on index direction)
9. BattleLedger discard on normal forward advance from spin
10. Push tier snapshot (on Action `stageGMHold` entry, when not a reset re-entry)
11. Stack cleanup (on `tcComplete` / `battleEnded`)
12. Update `prevMachineState` and `prevStageIndex` shadows
13. Start/stop TICK and SPIN_TICK intervals
14. Broadcast `TCStatePayload` via IPC and WebSocket; broadcast ledger

---

### 3.2 XState Machine (`src/main/tc/tcMachine.ts`)

**The single source of truth for all game state.** Owns no timers and performs no I/O.

**Responsibilities:**
- Models the full lifecycle of a Tactical Cycle as a deterministic finite state machine
- Holds all beat-related context variables
- Enforces all transition guards (when an event is legal)
- Performs all context mutations via XState `assign` actions

**States:**

| State | Meaning |
|---|---|
| `idle` | Combat not started |
| `stageGMHold` | GM prep phase — timer has not started; GM must release to begin |
| `stageActive` | Player countdown running |
| `checkAdvance` | Transient: decides which stable state to enter next |
| `stagePaused` | Player countdown frozen by GM |
| `stageSpin` | Post-stage hourglass pause (`spinTime > 0`) |
| `stageSpinPaused` | Spin paused by GM |
| `tcComplete` | All stages done; waiting for Next Round |
| `battleEnded` | GM ended the battle explicitly |

**Context (`TCContext`):**

```typescript
interface TCContext {
  round: number
  stages: StageDefinition[]
  currentStageIndex: number
  timerSecondsRemaining: number
  spinSecondsRemaining: number
  backgroundOpsComplete: boolean
  beatsRemaining: number
  beatsAtStageEntry: number     // fixed reference for surplus and Stage Reset
  beatsAtTierEntry: number      // fixed reference for Tier Reset
  totalBeats: number
  tierStageSnapshot: TierStageSnapshot | null  // entry-time beats for Action+Response in current tier
}
```

**Events (`TCEvent`):** `START_COMBAT`, `TICK`, `SPIN_TICK`, `SPIN_COMPLETE`,
`SPIN_EXCEPTION`, `GM_RELEASE`, `PASS`, `PAUSE`, `RESUME`, `STAGE_RESET`,
`TIER_RESET`, `ROUND_RESET`, `NEXT_ROUND`, `UPDATE_PIPELINE`, `END_BATTLE`, `RESET`

**How `index.ts` finds it:**

```typescript
import { tcMachine } from './tc/tcMachine'
const tcActor = createActor(tcMachine)
tcActor.subscribe((snapshot) => { /* ... */ })
tcActor.start()
tcActor.send({ type: 'GM_RELEASE' })
```

---

### 3.3 BattleLedger (`src/main/battle/BattleLedger.ts`)

**A Memento-pattern snapshot stack** that keeps the beat log consistent with the machine's
beat clock across Stage, Tier, and Round Resets.

**Responsibilities:**
- Maintains the live beat log (`BeatLogEntry[]`)
- Maintains a labeled snapshot stack (`'round' | 'tier' | 'stage'`)
- Enforces hierarchy boundaries (discard/restore cannot cross a lower-level entry)
- Provides rollback on reset by restoring from snapshots

**Interface:**

```typescript
class BattleLedger {
  push(type: 'round' | 'tier' | 'stage'): void       // save snapshot
  logEntry(entry: BeatLogEntry): void                  // append to live log
  discard(type: 'round' | 'tier' | 'stage'): void     // pop without restore (normal completion)
  restore(type: 'round' | 'tier' | 'stage'): void     // pop and revert data (reset)
  reset(): void                                        // full clear (idle)
  getData(): BattleLedgerData                         // read for broadcast
}
```

**How `index.ts` finds it:**

```typescript
import { BattleLedger } from './battle/BattleLedger'
const battleLedger = new BattleLedger()
```

See `docs/beat-mechanics-and-battle-ledger.md` for a full description of the push/restore
invariants and the post-restore push rule.

---

### 3.4 StagePlanner (`src/main/stages/stagePlanner.ts`)

**Computes the round's stage pipeline** and redistributes surplus beats after early GM
Releases.

**Responsibilities:**
- `plan()`: Expands plugin stage templates into a full pipeline with `tierCount` triads,
  assigns scoped IDs (`action-t1`, etc.) and zero-based `tierIndex`
- `applyCarryForward()`: Adds surplus beats to the next beat-consuming stage and
  pro-rates its timer proportionally

**Interface:**

```typescript
class StagePlanner {
  plan(pipeline: StageDefinition[], beatsPerTC: number): StageDefinition[]
  applyCarryForward(pipeline: StageDefinition[], fromStageIndex: number, surplusBeats: number): StageDefinition[]
}
```

**How `index.ts` finds it:**

```typescript
import { StagePlanner } from './stages/stagePlanner'
const stagePlanner = new StagePlanner(activePlugin.getConfig().minAdjustedTimerSeconds)

// On START_COMBAT:
const stages = stagePlanner.plan(filtered, beatsPerTC)

// After GM Release surplus detected:
const updatedStages = stagePlanner.applyCarryForward(stages, prevStageIndex, surplusBeats)
tcActor.send({ type: 'UPDATE_PIPELINE', stages: updatedStages })
```

---

### 3.5 ActivePlugin (`src/main/plugins/ActivePlugin.ts`)

**The single source of truth for game mechanic configuration.** Currently hardcoded to
the Standard plugin; future versions will load from YAML or a database.

**Responsibilities:**
- Provides the full `PluginConfig` (stage definitions, beat budget, minimum timer floor)
- All other modules query this class; none access plugin data directly

**Interface:**

```typescript
class ActivePlugin {
  getConfig(): PluginConfig
  getStages(): StageDefinition[]
  getBeatsPerTC(): number
}
```

**How `index.ts` finds it:**

```typescript
import { ActivePlugin } from './plugins/ActivePlugin'
const activePlugin = new ActivePlugin()
```

---

### 3.6 StageRegistry (`src/main/stages/registry.ts`)

**Maps stage type strings to their handler implementations.** The sole registration point
for all stage types the system supports.

**Responsibilities:**
- Provides a lookup table `Record<string, StageHandler>`
- Dispatched by `index.ts` subscription on every `onEnter` / `onTick` / `onExit`
  lifecycle event

**Interface:**

```typescript
export const StageRegistry: Record<string, StageHandler> = {
  'gm-release':               GmReleaseHandler,
  'timed':                    TimedHandler,
  'surprise-determination':   SurpriseDeterminationHandler,
  'initiative-determination': InitiativeDeterminationHandler,
  'action':                   ActionHandler,
  'response':                 ResponseHandler,
  'resolution':               ResolutionHandler,
}
```

**How `index.ts` finds it:**

```typescript
import { StageRegistry } from './stages/registry'

// In subscription:
const handler = StageRegistry[prevStage.type]
if (handler) handler.onExit(prevStage, snapshot.context)
```

---

### 3.7 Stage Handlers (`src/main/stages/*.ts`)

Each stage type has a handler implementing the `StageHandler` interface:

```typescript
interface StageHandler {
  readonly type: string
  onEnter: (config: StageDefinition, context: TCContext) => void
  onTick:  (config: StageDefinition, context: TCContext) => void
  onExit:  (config: StageDefinition, context: TCContext) => void
}
```

**Current state:** All handlers are stubs — they log a message and return. The interface
is fully wired; adding real behaviour requires only filling in the stub methods.

**Known gap:** `onExit` does not receive an exit reason (GM Release vs Pass vs timer
expiry vs Reset). This matters for Resolution, which must eventually decide whether to
commit results based on how it exited. This is a documented open gap in the registry
comment.

**How handlers find the registry:**
They don't — they are instantiated as singletons and imported directly into `registry.ts`.
The registry owns all handler references; `index.ts` dispatches through it.

---

### 3.8 Round Visibility Utils (`src/main/stages/roundVisibilityUtils.ts`)

Evaluates the `RoundVisibilityEntry[]` DSL on each stage to determine which stages are
active for a given round number.

**Responsibilities:**
- `filterStagesForRound(stages, round)`: Returns only stages active for this round
- `validateStagesRoundVisibility(stages)`: Warns/errors on config mistakes (e.g. a
  stage that is never active)

**How `index.ts` finds it:**

```typescript
import { filterStagesForRound, validateStagesRoundVisibility } from './stages/roundVisibilityUtils'

// On START_COMBAT and NEXT_ROUND:
const filtered = filterStagesForRound(allStages, round)
const stages   = stagePlanner.plan(filtered, beatsPerTC)
```

---

### 3.9 LAN Server (`src/main/server/lanServer.ts`)

**HTTP + WebSocket server** embedded in the Electron main process. Serves the Group HUD
over the local network.

**Responsibilities:**
- Opens a WebSocket server on port 3001
- Broadcasts `WSMessage` objects (`TC_STATE` and `LEDGER_STATE`) to all connected clients
- Maintains a per-type message cache so new connections immediately receive the full
  current state (no need to wait for the next broadcast)
- Serves pre-built HUD static assets over HTTP in production

**Interface:**

```typescript
interface LanServer {
  broadcast: (data: unknown) => void
  close: () => void
}

export function createLanServer(): LanServer
```

**How `index.ts` finds it:**

```typescript
import { createLanServer } from './server/lanServer'
const lanServer = createLanServer()

// In subscription, after every state change:
lanServer.broadcast({ type: 'TC_STATE', payload })
lanServer.broadcast({ type: 'LEDGER_STATE', payload: battleLedger.getData() })
```

---

### 3.10 Logger (`src/main/logger.ts`)

A **Pino logger** instance shared across all main-process modules.

- Dev: pretty-printed to stdout with colour (synchronous stream, Node 18 compatible)
- Prod: structured JSON (suitable for log aggregators)
- Log level: `debug` in dev, `info` in prod

**How modules find it:**

```typescript
import { logger } from '../logger'
logger.debug({ round, stageIndex }, 'TC state broadcast')
```

---

### 3.11 Preload Bridge (`src/preload/index.ts`)

**The only sanctioned communication channel** between the renderer process and the main
process. Uses Electron's `contextBridge` to expose a typed `window.api` object.

**Responsibilities:**
- Exposes fire-and-forget command methods (renderer → main)
- Exposes subscription methods (main → renderer via `ipcRenderer.on`)
- Enforces context isolation — the renderer has no direct Node or Electron access

**The `window.api` interface (defined in `src/preload/index.d.ts`):**

```typescript
interface TacticalMeleeAPI {
  // Commands (renderer → main, fire-and-forget)
  startCombat():  void
  gmRelease():    void
  pass():         void
  pause():        void
  resume():       void
  nextRound():    void
  launchHUD():    void
  stageReset():   void
  tierReset():    void
  roundReset():   void
  endBattle():    void
  resetBattle():  void

  // Subscriptions (main → renderer, push)
  onStateUpdate(callback: (state: TCStatePayload) => void):     void
  offStateUpdate():                                              void
  onLedgerUpdate(callback: (ledger: BattleLedgerPayload) => void): void
  offLedgerUpdate():                                             void
  onBattleEnd(callback: () => void):                            void
  offBattleEnd():                                               void
  onDevLog(callback: (message: string) => void):                void
  onGmAlert(callback: (message: string) => void):               void
}
```

**The Group HUD does NOT use this preload.** It has no preload script by design and
communicates exclusively via WebSocket.

---

### 3.12 GM Dashboard (`src/renderer/src/`)

**The GM's control panel.** A React 18 + Mantine v7 application running in the main
Electron `BrowserWindow`.

**Component tree:**

```
App.tsx                    — root; owns ledger state, gmAlerts queue, drawer open/close
├── TopBar.tsx             — title bar; dismissable GM alert strip
├── GmControls.tsx         — all combat controls; owns TCStatePayload via onStateUpdate
├── SettingsDrawer.tsx     — settings panel (theme picker, etc.)
└── BattleLogDrawer.tsx    — beat log drawer (receives ledger from App.tsx)
```

**How components communicate:**

- `App.tsx` subscribes to `onLedgerUpdate` and passes the ledger down as a prop to
  `BattleLogDrawer`
- `GmControls.tsx` subscribes to `onStateUpdate` independently — it needs the full
  `TCStatePayload` to compute button availability. This is an intentional local
  subscription rather than prop-drilling through `App.tsx`
- All buttons call `window.api.*` directly — no action creators or Redux-style dispatch

```typescript
// GmControls.tsx — subscribes directly to state
useEffect(() => {
  window.api.onStateUpdate((state) => setTc(state))
  return () => window.api.offStateUpdate()
}, [])

// Button click — fire-and-forget to main process
onClick={() => window.api.gmRelease()
```

**How the GM Dashboard finds the main process:**
Via `window.api` injected by the preload bridge. There are no direct imports between
renderer and main process code.

---

### 3.13 Group HUD (`src/renderer/src/hud/`)

**A read-only display for players.** A React 18 + Mantine v7 application with no Electron
IPC access. Can be opened in the Electron second window or on any LAN-connected browser.

**Component tree:**

```
HudApp.tsx              — root; owns WebSocket connection, TCStatePayload, BattleLedgerPayload
├── RoundCounter        — round number display
├── MessageArea         — stage description text
├── StageList           — pipeline visualizer (tier grouping, current stage highlight)
├── DigitalCountdown    — real-time timer display
└── BeatsBurndown       — beats remaining progress bar
```

**WebSocket connection:**

```typescript
// WS_URL derived from page hostname so remote LAN clients connect to the right host
const WS_URL = `ws://${window.location.hostname}:3001`

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data) as WSMessage
  if (msg.type === 'TC_STATE')     setState(msg.payload)
  if (msg.type === 'LEDGER_STATE') setLedger(msg.payload)
}
```

Reconnect strategy: on `onclose`, schedule a retry in 2 s. On `onerror`, force-close so
`onclose` always fires and drives the reconnect loop.

**Four render branches (mutually exclusive, evaluated in order):**

1. Not connected → "Connecting…" splash
2. `idle` state → "Awaiting combat start…" splash
3. `battleEnded` → full-screen beat log recap
4. All other states → live combat HUD (round counter, stage list, countdown, burndown)

**How the Group HUD finds the main process:**
It doesn't. It receives all state passively over WebSocket. It cannot send commands.

---

### 3.14 Shared Types (`src/shared/`)

Two files shared between the main process and all renderer contexts:

**`src/shared/types.ts`:**
- `StageType` — union of all stage type strings
- `StageDefinition` — the shape of one stage in the pipeline
- `PluginConfig` — the full plugin configuration shape
- `TCStatePayload` — the state snapshot broadcast to both surfaces on every change
- `WSMessage` — the WebSocket message envelope (`TC_STATE | LEDGER_STATE`)
- `isTimedStageType()` — runtime predicate (timed/action/response → true)
- `RoundVisibilityEntry` — DSL entry type for round filtering

**`src/shared/battleTypes.ts`:**
- `BeatLogEntry` — one timestamped beat log event
- `BeatLogOperation` — `'stage-start' | 'gm-release' | 'time-expired' | 'gm-pass'`
- `BattleLedgerData` — wrapper holding `beatLog: BeatLogEntry[]`
- `BattleLedgerPayload` — alias for `BattleLedgerData`; the type sent over IPC/WS

**Import note:** The renderer process can only use type-level imports from `@shared`
(TypeScript path alias). It cannot import runtime values like `isTimedStageType`.
When the renderer needs equivalent logic, it inlines a copy (see `GmControls.tsx` —
`isActivityStage` is a local replica of `isTimedStageType`).

---

## 4. Communication Paths

### 4.1 GM Action → Machine → Broadcast

This is the primary event loop:

```
GM clicks a button in GmControls.tsx
  └─▶ window.api.gmRelease()                    [renderer]
        └─▶ ipcRenderer.send('tc:gm-release')   [preload]
              └─▶ ipcMain.on('tc:gm-release')   [main: index.ts]
                    └─▶ tcActor.send({ type: 'GM_RELEASE' })
                          └─▶ XState processes transition synchronously
                                └─▶ tcActor.subscribe fires
                                      ├─▶ StageRegistry.onExit / onEnter
                                      ├─▶ BattleLedger operations
                                      ├─▶ StagePlanner carry-forward (if surplus)
                                      ├─▶ prevMachineState / prevStageIndex updated
                                      ├─▶ startTicker() / stopTicker()
                                      ├─▶ mainWindow.webContents.send('tc:state-update', payload)
                                      │     └─▶ ipcRenderer.on → App.tsx / GmControls.tsx
                                      └─▶ lanServer.broadcast({ type: 'TC_STATE', payload })
                                            └─▶ WebSocket → HudApp.tsx
```

### 4.2 Beat Log Updates

The ledger is broadcast separately from the TC state (it changes less frequently):

```
battleLedger.logEntry(...)     or     battleLedger.restore(...)
  └─▶ broadcastLedger()
        ├─▶ mainWindow.webContents.send('ledger:update', data)
        │     └─▶ App.tsx: window.api.onLedgerUpdate → setLedger(payload)
        │             └─▶ BattleLogDrawer (prop)
        └─▶ lanServer.broadcast({ type: 'LEDGER_STATE', payload: data })
              └─▶ WebSocket → HudApp.tsx: setLedger(payload)
```

### 4.3 Timer Tick Loop

The timer is external to the machine — it is driven by `setInterval` in `index.ts`:

```
setInterval(() => tcActor.send({ type: 'TICK' }), 1000)
  └─▶ machine decrements timerSecondsRemaining and beatsRemaining
        └─▶ tcActor.subscribe fires → broadcast (state + ledger if changed)
```

Separate intervals exist for `TICK` (player countdown) and `SPIN_TICK` (spin window).
The subscription starts/stops these at the end of every call based on current state.

### 4.4 New HUD Connection (Cache Replay)

```
New WebSocket client connects to port 3001
  └─▶ lanServer: connection handler fires
        └─▶ messageCache.forEach → ws.send(cached TC_STATE)
                                 → ws.send(cached LEDGER_STATE)
```

This ensures a player who opens the HUD mid-combat immediately sees the current state
without waiting for the next TICK broadcast.

---

## 5. Data Flow Summary

```
Plugin config (ActivePlugin)
  │
  ├─▶ StagePlanner.plan() → expanded pipeline (with tierIndex, scoped IDs)
  │     │
  │     └─▶ filterStagesForRound() → round-filtered pipeline
  │               │
  │               └─▶ tcActor.send(START_COMBAT / NEXT_ROUND / ROUND_RESET)
  │                         │
  │                         ▼
  │               XState machine (tcMachine)
  │                         │ state transitions
  │                         ▼
  │               tcActor.subscribe (index.ts)
  │                         │
  │               ┌─────────┴─────────────────────┐
  │               │                               │
  │         StageRegistry                   BattleLedger
  │         (hook dispatch)                 (snapshot/log)
  │               │                               │
  │         StagePlanner                          │
  │         (carry-forward)                       │
  │               │                               │
  │         TCStatePayload ◀──────────────────────┘ BattleLedgerPayload
  │               │                               │
  │       ┌───────┴────────┐              ┌───────┴────────┐
  │       │   IPC channel  │              │   IPC channel  │
  │       │ tc:state-update│              │  ledger:update │
  │       └───────┬────────┘              └───────┬────────┘
  │               │                               │
  │       GM Dashboard (renderer)         GM Dashboard (renderer)
  │       GmControls.tsx                  BattleLogDrawer.tsx
  │
  └─▶ WebSocket broadcast (TC_STATE + LEDGER_STATE)
              │
        Group HUD (HudApp.tsx)
        ├── RoundCounter
        ├── MessageArea
        ├── StageList
        ├── DigitalCountdown
        └── BeatsBurndown
```

---

## 6. Key Architectural Decisions

### Synchronous XState v5 subscription

XState v5 processes events synchronously. The subscription fires (and fully completes)
inside `tcActor.send()` before `send()` returns. This is exploited in two places:

1. **`tc:pass` IPC handler** logs the beat entry *before* calling `send()`, then sets
   `lastIpcOp = 'pass'` so the subscription skips its own duplicate log attempt.
2. **`tc:round-reset` IPC handler** restores the BattleLedger *before* calling `send()`,
   then sets `lastIpcOp = 'round-reset'` so the subscription's restore blocks skip
   themselves.

Both patterns would become race conditions under asynchronous XState. They are documented
with a fragility note in `index.ts`.

### No state in the renderer

The GM Dashboard and Group HUD hold no authoritative game state. They receive complete
state snapshots on every change and rebuild their view from scratch. This means a renderer
reload or a new HUD connection always converges to the correct state without a separate
sync protocol.

### IPC channel asymmetry

Renderer → Main is always fire-and-forget (`ipcRenderer.send`). There is no
request-response pattern. All state flows back via broadcasts, not replies. This
eliminates a class of timing bugs where a renderer holds stale state waiting for a
response.

### Group HUD has no preload

The Group HUD window is created with no preload script. It cannot send IPC messages to
the main process at all. This is enforced at construction time:

```typescript
// In index.ts, when creating the HUD window:
new BrowserWindow({ webPreferences: { preload: undefined } })
```

Read-only access is the whole design — players have no controls.

### WebSocket hostname derivation

The Group HUD derives the WebSocket URL from `window.location.hostname`:

```typescript
const WS_URL = `ws://${window.location.hostname}:3001`
```

This means the same URL works both locally (hostname = `localhost`) and when opened on a
LAN-connected device (hostname = the host machine's LAN IP), without any configuration.

### StagePlanner as immutable pipeline producer

`applyCarryForward()` returns a new pipeline array; it never mutates in place. The new
pipeline is passed to the machine as an `UPDATE_PIPELINE` event. This keeps the machine
context as the authoritative owner of pipeline state, and means the StagePlanner has no
persistent state of its own.

---

## 7. Adding New Functionality — Component Touch Points

### New stage type

1. Create `src/main/stages/mytype.ts` implementing `StageHandler`
2. Register it in `src/main/stages/registry.ts`
3. Add the type string to `StageType` in `src/shared/types.ts`
4. Add the stage to the plugin config in `ActivePlugin.ts`

### New IPC command (GM action)

1. Add the method to `src/preload/index.ts` (`ipcRenderer.send(...)`)
2. Add the type declaration to `src/preload/index.d.ts`
3. Add `ipcMain.on(...)` handler in `src/main/index.ts`
4. Add the event to `TCEvent` in `tcMachine.ts` if the machine needs to handle it
5. Add the button/trigger in `GmControls.tsx` calling `window.api.myCommand()`

### New state broadcast field

1. Add the field to `TCStatePayload` in `src/shared/types.ts`
2. Populate it in the `payload` object in the subscription's broadcast block
3. Consume it in `GmControls.tsx` (via `tc?.newField`) and/or `HudApp.tsx`

### New plugin

Replace `ActivePlugin.STANDARD_CONFIG` with a loader that reads from YAML or a database.
All other modules already query `ActivePlugin` — no other changes needed.
