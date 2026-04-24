# Beat Mechanics and BattleLedger — Technical Reference

This document explains how beat-based time tracking works in TacticalMelee and how the
BattleLedger maintains a rollback-safe beat log through the entire combat lifecycle.

---

## Part 1 — Beat Mechanics

### What a Beat Is

A **beat** is TacticalMelee's unit of in-world tactical time. It is not wall-clock seconds.
Beats are a finite resource for each Tactical Cycle (TC): the plugin defines `beatsPerTC`
(e.g. 60 for the Standard plugin) and that budget is consumed as stages run. When the
budget is exhausted the TC is complete.

Beats serve three purposes:

1. **Pacing** — stages are assigned a beat cost (`stage.beats`). The beat clock counts down
   as stages run, giving the GM and players a sense of time pressure.
2. **Tier count** — the StagePlanner uses the beat budget to decide how many Action Tiers
   fit in a round (see below).
3. **Beat log** — every significant moment in a TC is timestamped with cumulative beats
   consumed, forming a permanent record of events.

### Beat Variables in Machine Context

The XState machine context carries four beat-related variables:

| Variable | Meaning |
|---|---|
| `totalBeats` | Total beats in one TC (set at `START_COMBAT`, constant thereafter) |
| `beatsRemaining` | Beats not yet consumed. Counts down as timed stages run. |
| `beatsAtStageEntry` | Value of `beatsRemaining` when the current stage was entered. Used to detect surplus on early release. |
| `beatsAtTierEntry` | Value of `beatsRemaining` when the current Action Tier was entered. Used as the restore point for Tier Reset. |

`beatsConsumed` is not stored directly — it is always computed as
`totalBeats − beatsRemaining`.

### How Beats Are Consumed

Beats are consumed during **timed stages** (type `timed`, `action`, or `response`).
Each TICK event decrements `beatsRemaining` by a small fractional amount proportional to
the real-time elapsed:

```
beatsPerSecond = stage.beats / stage.timerSeconds
beatsRemaining -= beatsPerSecond × tickInterval
```

When the timer expires naturally (`time-expired`), the stage has consumed exactly
`stage.beats`. When the GM releases early (`gm-release`), fewer beats are consumed and
a surplus remains.

**Administrative stages** (Surprise Determination, Initiative Determination, Resolution,
GM Narrative) have `beats = 0`. They consume no in-world time — they are computation or
narrative windows outside the tactical clock.

### StagePlanner — Pipeline Expansion and Tier Count

Before combat starts (`START_COMBAT`) and at every new round (`NEXT_ROUND`), the
`StagePlanner.plan()` method expands the raw plugin stage list into the round's full
pipeline.

**Algorithm:**

1. Separate the **preamble** (all stages before the first Action/Response/Resolution triad)
   from the triad templates.
2. Compute available beats: `beatsPerTC − preambleBeats`.
3. Compute `triadBeats = action.beats + response.beats` (Resolution is always 0 beats).
4. `tierCount = Math.floor(available / triadBeats)` — floor is required; a partial tier
   would leave players mid-declaration without a Resolution.
5. Emit: `preamble + tierCount × [Action, Response, Resolution]`.

Each generated triad copy gets a scoped ID (`action-t1`, `response-t2`, …) and a
zero-based `tierIndex` (`t` in the loop, so Tier 1 → `tierIndex: 0`).

For the Standard plugin: `(60 − 4) / 8 = 7` tiers per round.

### Carry-Forward

When a GM Release ends a timed stage early, the surplus beats
(`beatsRemaining − (beatsAtStageEntry − stage.beats)`) would otherwise be lost. Instead
they are **carried forward** to the next beat-consuming stage in the pipeline, extending
both its beat allocation and timer proportionally.

**Routing:**

| Source stage | Carry destination | Timing |
|---|---|---|
| Pre-Encounter (or any preamble) | First Action stage (Tier 1) | Immediate |
| Action | Response (same tier) | Immediate |
| Response | Action (next tier) | **Deferred** |
| Final Response | No target — surplus forfeited | — |

**Why Response carry is deferred:**

If Response surplus were applied immediately, the next-tier Action would be inflated while
Tier Reset is still possible. A Tier Reset restores the beat clock but not the pipeline
stage beat values. On the re-run, another surplus detection could fire against the now-
inflated Action allocation, producing a double-count.

The fix: store the carry in `pendingCrossTierCarry` and apply it only when the tier's
Resolution spin completes and the machine advances forward into the next tier's
`stageGMHold`. At that point, Tier Reset is no longer available for the completed tier,
so the carry is applied to a pipeline that cannot be rolled back.

---

## Part 2 — The Beat Log

### What Gets Logged

Every significant beat-timestamped event produces a `BeatLogEntry`:

```typescript
interface BeatLogEntry {
  round: number
  tierIndex?: number      // undefined for preamble stages; 0-based internally
  stageId: string
  stageName: string
  operation: 'stage-start' | 'gm-release' | 'time-expired' | 'gm-pass'
  beatsConsumed: number   // totalBeats − beatsRemaining at this moment
}
```

The four operations:

| Operation | Meaning | Logged when |
|---|---|---|
| `stage-start` | Stage countdown began | `stageGMHold → stageActive` (GM Release from hold) |
| `gm-release` | GM ended stage early | `stageActive → stageSpin` with surplus beats remaining |
| `time-expired` | Stage ran to full time | `stageActive → stageSpin` with no surplus |
| `gm-pass` | Stage was passed (full cost) | `tc:pass` IPC before event fires |

**0-beat stages are not logged.** Administrative stages (Resolution, Surprise, Initiative)
consume no in-world time. Logging `0.0 beats consumed` would add noise to a timeline that
is supposed to show time flow. The stage snapshot is still pushed/popped for reset
consistency, but no `logEntry` is called.

### Display Format

Entries are displayed as `R:T:B` in both the GM Battle Log drawer and the HUD battle
recap:

- `R` = round number
- `T` = tier number for display (`tierIndex + 1`; preamble stages show `0`)
- `B` = beats consumed at this event, one decimal place

Example: `1:2:18.9` = Round 1, Tier 2, 18.9 beats consumed at this point.

The tooltip expands to `Round N, Tier N, Beat N.N`.

---

## Part 3 — BattleLedger

### Purpose

The `BattleLedger` is a **Memento-pattern snapshot store**. It holds the current beat log
and a stack of labeled snapshots taken at the start of each round, each tier, and each
active stage. When a reset fires, the ledger is rolled back to the appropriate snapshot,
keeping the beat log consistent with the machine's beat-clock restoration.

Without the ledger, a Tier Reset would roll the beat clock back to `beatsAtTierEntry` but
leave the log full of entries from the aborted run — the displayed log would not match the
machine's state.

### The Stack

The stack holds at most three entries at any point in combat:

```
[round]               ← pushed at START_COMBAT / NEXT_ROUND
[round, tier]         ← pushed when entering Action stageGMHold for a new tier
[round, tier, stage]  ← pushed when entering stageActive
```

Each entry is a labeled deep-clone of `BattleLedgerData` (the full beat log) at the
moment of the push.

### Hierarchy Levels

Entries have a hierarchy level: `round=0`, `tier=1`, `stage=2`. The `discard` and
`restore` methods use this to enforce a critical safety invariant:

**A discard or restore for level N can only pop entries at level N or higher. It stops
before crossing an entry at a lower level (lower number).**

This means `discard('tier')` cannot accidentally pop the `round` entry. Without this
guard, `discard('tier')` on a stack that had no `tier` entry (e.g. due to an earlier bug)
would scan all the way down and pop `round`, silently destroying the round snapshot and
making future Round Resets a no-op.

### The Four Operations

#### `push(type)`

Saves a deep-clone of the current beat log at the given label. Called at:

- `'round'` — `tc:start-combat` IPC and `tc:round-reset` IPC (before `send()`)
- `'tier'` — subscription, on entering Action `stageGMHold` for a new tier (when not a
  reset re-entry)
- `'stage'` — subscription, on entering `stageActive` (or releasing from hold)

#### `logEntry(entry)`

Appends a `BeatLogEntry` to the current live data. Does not touch the stack.

#### `discard(type)`

Pops the topmost entry of the given type (and any higher-level entries above it), without
restoring data. Used on **normal (non-reset) completion**:

- `discard('stage')` — on `stageActive → stageSpin` (normal stage end)
- `discard('stage')` — on `stageActive → stageGMHold` forward (gm-release stage, no spin
  window)
- `discard('tier')` — on Resolution `stageSpin → stageGMHold` forward (tier completed
  normally)
- `discard('tier')` — on `tcComplete` or `battleEnded` (cleanup)

#### `restore(type)`

Pops the topmost entry of the given type (and any higher-level entries above it), and
**replaces the current live data with the snapshot's data**. Used on resets:

- `restore('stage')` — Stage Reset (`stageActive`/`stageSpin → stageGMHold`, same index)
- `restore('tier')` — Tier Reset (`stageActive`/`stageSpin`/`stageGMHold → stageGMHold`,
  lower index)
- `restore('round')` — Round Reset (in the `tc:round-reset` IPC handler, before `send()`)

---

## Part 4 — The Subscription: Connecting Machine Transitions to Ledger Operations

The XState subscription in `index.ts` fires on every state transition. It reads
`prevMachineState` and `prevStageIndex` (shadows updated at the end of each subscription
call) to classify each transition and call the appropriate ledger operation.

### Push: Stage Snapshot

```
(entering stageActive) OR (stageGMHold → stageActive, same index)
AND NOT resuming from pause
→ push('stage')
→ logEntry(stage-start) if stage.beats > 0
```

The stage snapshot is pushed at the moment the countdown timer starts (either first entry
into `stageActive`, or GM Release from hold for `action`/`response` stages).

Resuming from pause (`stagePaused → stageActive`) is explicitly excluded — the stage
was already entered; this is just a timer resume.

### Log: Stage End

```
(stageActive OR stagePaused) → stageSpin
AND lastIpcOp !== 'pass'
→ logEntry(gm-release OR time-expired)
→ discard('stage')
```

The end-of-stage log fires when the machine enters `stageSpin`. The `gm-release` vs.
`time-expired` distinction is made by checking surplus beats:
`surplus = beatsRemaining − (beatsAtStageEntry − stage.beats)`.

The `lastIpcOp !== 'pass'` guard prevents a duplicate entry — the `tc:pass` IPC handler
logs `gm-pass` before sending the event, and then `lastIpcOp` is set to `'pass'` for the
duration of that synchronous `send()` call.

### Push: Tier Snapshot

```
entering stageGMHold AND currentStage.type === 'action'
AND NOT isResetReentry
→ push('tier')
```

The tier snapshot is pushed when the machine enters the Action stage's GM hold — the
moment just before the players begin their declarations for that tier. This captures
`beatsRemaining` at the start of the tier, which is what Tier Reset needs to restore to.

**`isResetReentry`** is true when the return to Action `stageGMHold` was caused by a
reset rather than a fresh forward advance. The restore blocks earlier in the subscription
have already handled the snapshot in those cases, so a new push here would be a duplicate.
The flag is computed from `prevMachineState` and the direction of `currentStageIndex`
relative to `prevStageIndex`:

```typescript
const isResetReentry =
  (prevMachineState === 'stageActive'    && currentStageIndex <= prevStageIndex) ||
  (prevMachineState === 'stagePaused'    && currentStageIndex <= prevStageIndex) ||
  (prevMachineState === 'stageGMHold'    && currentStageIndex <= prevStageIndex && lastIpcOp !== 'round-reset') ||
  (prevMachineState === 'stageSpin'      && currentStageIndex <= prevStageIndex) ||
  (prevMachineState === 'stageSpinPaused'&& currentStageIndex <= prevStageIndex)
```

The index direction check (`<= prevStageIndex`) is essential. Without it, a forward
transition from a gm-release preamble stage (GM Narrative → Action, higher index) would
also be flagged as a reset re-entry and block the push, leaving the tier without a
snapshot.

**ORDERING INVARIANT:** The tier push block is placed **after** the discard block.

When Resolution spin completes and the machine advances to the next tier's Action
`stageGMHold`, that single transition simultaneously satisfies both "forward advance from
spin → discard old tier" and "entering Action stageGMHold → push new tier." If the push
ran first, the new tier snapshot would be on top and the subsequent discard would pop it
instead of the old one. By running discard first, the old tier is cleanly removed before
the new one is pushed.

### Restore/Discard on Reset and Forward Transitions

Three blocks handle the cases where `stageGMHold` is entered from an active or spin state:

**Block 1: `(stageActive OR stagePaused) → stageGMHold`**

| Index direction | Operation | Meaning |
|---|---|---|
| `current < prev` | `restore('tier')` then `push('tier')` | Tier Reset |
| `current === prev` | `restore('stage')` | Stage Reset |
| `current > prev` | `discard('stage')` | Normal forward (gm-release stage, no spin window) |

**Block 2: `(stageSpin OR stageSpinPaused) → stageGMHold, current <= prev`**

| Index direction | Operation | Meaning |
|---|---|---|
| `current < prev` | `restore('tier')` then `push('tier')` | Tier Reset from spin |
| `current === prev` | `restore('stage')` | Stage Reset from spin |

**Block 3: `stageGMHold → stageGMHold, current < prev`**

```
restore('tier') then push('tier')
```

This handles Tier Reset when the GM passes in the Response stage's GM hold (the machine
was already in `stageGMHold` for Response and goes directly back to `stageGMHold` for
Action).

**All three blocks exclude `lastIpcOp === 'round-reset'`** to prevent a double-restore.
Round Reset is handled exclusively in the `tc:round-reset` IPC handler before `send()`.
If the transition also matches one of these blocks (which it can, e.g.
`stageActive → stageGMHold` with a lower index), the block must skip itself.

### Round Reset — IPC Handler Path

Round Reset is handled differently from Stage Reset and Tier Reset:

```typescript
ipcMain.on('tc:round-reset', () => {
  pendingCrossTierCarry = null
  battleLedger.restore('round')
  battleLedger.push('round')
  // ... rebuild pipeline ...
  lastIpcOp = 'round-reset'
  tcActor.send({ type: 'ROUND_RESET', stages })
  lastIpcOp = null
})
```

The ledger is restored **before** `send()`. This means when the subscription fires, the
ledger is already at its clean pre-round state. The `lastIpcOp = 'round-reset'` flag tells
all three restore blocks in the subscription to skip themselves — the work is already done.

The `push('round')` immediately after `restore('round')` re-anchors a fresh round snapshot
at the restored state, making future Round Resets on the re-run possible.

---

## Part 5 — The Post-Restore Push Invariant

This is the subtlest invariant in the system. It solves the problem of repeated resets
within the same re-run.

### The Problem

When Tier Reset fires:

1. `restore('tier')` pops the tier snapshot and restores the beat log to the pre-tier state.
2. `isResetReentry = true` blocks the normal tier-push at the `entering stageGMHold` block.
3. The machine is now back at Action `stageGMHold` — but it was **already there** before
   the reset. No new `stageGMHold` entry fires.

This means: after the first Tier Reset, there is no tier snapshot on the stack for the
re-run. If the GM triggers a **second Tier Reset** on the same re-run, `restore('tier')`
finds no tier entry and is a no-op. The beat log is not reverted. The re-run's entries
persist in the log as if the second reset never happened.

### The Fix

After every `restore('tier')`, immediately call `push('tier')`:

```typescript
battleLedger.restore('tier')
battleLedger.push('tier')   // re-anchor at restored state
```

This re-anchors the snapshot at the freshly restored pre-tier beat log state. The
`isResetReentry` guard at the normal tier-push site will still block any duplicate push
there (since `currentStageIndex <= prevStageIndex` is true after a reset). So the only
push that happens is this immediate one.

The same logic applies to all three restore blocks (stageActive/Paused → hold,
spin/SpinPaused → hold, and hold → hold), and to Round Reset in the IPC handler.

### Why This Works for Repeated Resets

After the fix, the stack state after a Tier Reset looks like:

```
before restore: [round, tier_T2]
after restore:  [round]              ← tier popped, data restored to pre-tier
after push:     [round, tier_T2*]   ← fresh snapshot at restored state
```

A second Tier Reset finds `tier_T2*` on the stack and correctly restores again.
A third Tier Reset would find yet another fresh snapshot pushed by the second restore.
The pattern scales to any number of resets within the same re-run.

---

## Part 6 — Stack State Through a Full Example

Standard plugin: 60 beats, 7 tiers. Walking through Round 1, Tier 2 with a Tier Reset
and a second Tier Reset on the re-run.

```
START_COMBAT
  push('round')           → stack: [round(0)]   data: []

─── Preamble ────────────────────────────────────────────────────────────────
stageActive: GM Narrative (gm-release, 0 beats)
  push('stage')           → stack: [round(0), stage(0)]
  (0-beat: no logEntry)
stageActive: Pre-Encounter (4 beats)
  discard('stage')        → stack: [round(0)]        (GM Narrative end)
  push('stage')           → stack: [round(0), stage(0)]
  logEntry(stage-start)   → data: [1:0:0.0 Pre-Encounter START]

stageSpin: Pre-Encounter ends
  logEntry(gm-release)    → data: [..., 1:0:2.0 Pre-Encounter RELEASE]
  discard('stage')        → stack: [round(0)]

─── Tier 1 ──────────────────────────────────────────────────────────────────
stageGMHold: Action T1 (entering, isResetReentry=false)
  push('tier')            → stack: [round(0), tier(2)]   ← snapshot has 2 entries

stageActive: Action T1
  push('stage')           → stack: [round(0), tier(2), stage(2)]
  logEntry(stage-start)   → data: [..., 1:1:2.0 Action START]

stageSpin: Action T1 ends
  logEntry(gm-release)    → data: [..., 1:1:5.0 Action RELEASE]
  discard('stage')        → stack: [round(0), tier(2)]

stageActive: Response T1
  push('stage')           → stack: [round(0), tier(2), stage(3)]
  logEntry(stage-start)   → data: [..., 1:1:5.0 Response START]

stageSpin: Resolution T1 spin
  ...
stageGMHold: Action T2 (forward advance)
  discard('tier')         → stack: [round(0)]            ← Tier 1 complete
  push('tier')            → stack: [round(0), tier(N)]   ← Tier 2 anchored

─── Tier 2: Tier Reset scenario ─────────────────────────────────────────────
stageActive: Action T2
  push('stage')           → stack: [round(0), tier(N), stage(N)]
  logEntry(stage-start)

stageSpin: Action T2 ends
  logEntry(time-expired)
  discard('stage')        → stack: [round(0), tier(N)]

stageActive: Response T2
  push('stage')           → stack: [round(0), tier(N), stage(N+1)]
  logEntry(stage-start)

PASS (gm-pass IPC):
  logEntry(gm-pass)       → data has entry at beat 28.0

stageGMHold: TIER RESET fires (stageSpin → stageGMHold, index lower)
  restore('tier')         → stack: [round(0)]   data: restored to beat 18.9
  push('tier')            → stack: [round(0), tier_restored]  ← POST-RESTORE PUSH

─── Re-run of Tier 2 ────────────────────────────────────────────────────────
stageActive: Action T2 (re-run)
  push('stage')           → stack: [round(0), tier_restored, stage]
  logEntry(stage-start)

stageActive: Response T2 (re-run)
  ...

SECOND TIER RESET fires:
  restore('tier')         → stack: [round(0)]   data: restored to beat 18.9 again ✓
  push('tier')            → stack: [round(0), tier_restored_2]
```

Without the post-restore push, the second Tier Reset would find `[round(0)]` with no
tier entry and do nothing — the log would not revert.

---

## Part 7 — Common Failure Modes and Their Guards

| Failure | Guard |
|---|---|
| `discard('tier')` pops `round` snapshot when no tier on stack | Hierarchy level check: stops before crossing a lower-level entry |
| Forward gm-release (GM Narrative → Action) blocks tier push via `isResetReentry` | Index direction check: `stageActive` arm requires `currentStageIndex <= prevStageIndex` |
| Round Reset fires subscription restore blocks causing double-restore | `lastIpcOp === 'round-reset'` excluded from all three restore blocks |
| Forward gm-release called `restore('stage')` instead of `discard('stage')` | Third branch of Block 1: `current > prev → discard('stage')` |
| Push runs before discard when advancing between tiers | Ordering invariant: discard block is always before tier-push block in subscription |
| Second Tier Reset on same re-run finds no snapshot | Post-restore push: `push('tier')` immediately after every `restore('tier')` |
| PASS IPC generates duplicate log entry (IPC handler + subscription both log) | `lastIpcOp === 'pass'` suppresses subscription-side log in `stageActive → stageSpin` |
