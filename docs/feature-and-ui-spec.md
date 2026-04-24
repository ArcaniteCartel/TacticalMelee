# TacticalMelee — Feature & UI Specification

**Date:** 2026-04-24  
**Version:** as of commit b6d60cc  
**Purpose:** Authoritative reference for feature behaviour and UI control specifications.
Use this document when modifying the system to understand how every control is supposed to operate and why it was designed that way.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [Machine States](#2-machine-states)
3. [Stage Types](#3-stage-types)
4. [Beat Mechanics](#4-beat-mechanics)
5. [GM Dashboard](#5-gm-dashboard)
   - 5.1 [Top Bar](#51-top-bar)
   - 5.2 [Combat Controls — Status Strip](#52-combat-controls--status-strip)
   - 5.3 [Combat Controls — Button Grid](#53-combat-controls--button-grid)
   - 5.4 [Combat Controls — Message Area](#54-combat-controls--message-area)
   - 5.5 [Danger Zone](#55-danger-zone)
   - 5.6 [System Status Panel](#56-system-status-panel)
   - 5.7 [Settings Drawer](#57-settings-drawer)
   - 5.8 [Battle Log Drawer](#58-battle-log-drawer)
6. [Group HUD](#6-group-hud)
   - 6.1 [Connection Behaviour](#61-connection-behaviour)
   - 6.2 [Idle Splash](#62-idle-splash)
   - 6.3 [Live Combat Layout](#63-live-combat-layout)
   - 6.4 [Round Counter](#64-round-counter)
   - 6.5 [Message Area](#65-message-area)
   - 6.6 [Stage List](#66-stage-list)
   - 6.7 [Digital Countdown](#67-digital-countdown)
   - 6.8 [Beats Burndown](#68-beats-burndown)
   - 6.9 [Battle Ended Recap](#69-battle-ended-recap)
7. [Theming System](#7-theming-system)
8. [Round Visibility Rules](#8-round-visibility-rules)
9. [Control Availability Matrix](#9-control-availability-matrix)

---

## 1. Application Overview

TacticalMelee is a TTRPG combat aid that runs as an Electron desktop application. It enforces timeboxed decision windows on players, resolves beat (resource) mathematics automatically, and broadcasts live state to connected players over a LAN WebSocket server.

**Three surfaces exist:**

| Surface | Entry point | Transport |
|---------|-------------|-----------|
| GM Dashboard | Electron main `BrowserWindow` | Electron IPC (via preload bridge `window.api`) |
| Group HUD | Second `BrowserWindow` (launched by GM) | WebSocket on port 3001 |
| Player Dashboards | Browser tab on player devices over LAN | WebSocket on port 3001 (planned, not yet built) |

The GM Dashboard has privileged access to the main process. The Group HUD and player dashboards are stateless browser clients that receive read-only state over WebSocket.

---

## 2. Machine States

The core is an XState v5 machine. Every state update is broadcast as a `TCStatePayload` to both the GM Dashboard (via `tc:state-update` IPC) and all WebSocket clients (as a `TC_STATE` message).

| State | Meaning |
|-------|---------|
| `idle` | Combat not started. Beat budget is zero. No stages exist. |
| `stageGMHold` | GM preparation phase before a timed/action/response stage's player countdown begins. The beat clock is not running. GM must Release or Pass to proceed. |
| `stageActive` | Player countdown is running (timed/action/response stages), OR the GM is narrating a `gm-release` stage. The beat clock accumulates in real time. |
| `stagePaused` | The player countdown has been manually frozen. Beat accumulation is stopped. Timer display shows the frozen value. |
| `stageSpin` | Post-completion spin window (hourglass pause). Background computations run. The beat clock does not run during spin. |
| `stageSpinPaused` | The spin window has been manually frozen. |
| `tcComplete` | All stages in the round are done. Beat budget is depleted or stage pipeline is exhausted. Awaiting GM's Next Round command. |
| `battleEnded` | GM clicked End Battle. All timers stopped. HUD shows full beat log recap. Awaiting Reset Battle. |

**State transitions summary:**  
`idle` → (Start Combat) → `stageActive` or `stageGMHold` (for the first stage)  
`stageGMHold` → (GM Release) → `stageActive`  
`stageGMHold` → (GM Pass) → spin or next stageGMHold  
`stageActive` → (timer expires) → `stageSpin` (if spinTime > 0) or `checkAdvance` (transient)  
`stageActive` → (GM Release) → `stageSpin` or `checkAdvance`  
`stageActive` → (Pause) → `stagePaused`  
`stagePaused` → (Resume) → `stageActive`  
`stageSpin` → (spin expires + backgroundOpsComplete) → `checkAdvance` (transient)  
`checkAdvance` → next stage's entry state or `tcComplete`

---

## 3. Stage Types

A `StageDefinition` is the template for one node in the stage pipeline. The pipeline for a round is built by the StagePlanner and stored in `TCStatePayload.stages`.

| Type | Behaviour | Has Timer | GM Hold | Beat Cost |
|------|-----------|-----------|---------|-----------|
| `gm-release` | GM narrates; must click Release to advance. Enters `stageActive` directly (no GM Hold). | No | No (enters stageActive) | Yes (zero for GM Narrative by convention) |
| `timed` | Player countdown. Enters `stageGMHold` first, then `stageActive` on release. | Yes | Yes | Yes |
| `action` | Player action declaration window. Timed. | Yes | Yes | Yes |
| `response` | NPC response window. Timed. | Yes | Yes | Yes |
| `system-complete` | Administrative stage. No timer. Advances immediately when background ops finish. | No | No | Yes |
| `surprise-determination` | Administrative stage — determines surprise. Advances via spin. | No | No | Yes |
| `initiative-determination` | Administrative stage — determines initiative. Advances via spin. | No | No | Yes |
| `resolution` | Administrative stage — resolves combat outcomes. Advances via spin. | No | No | Yes |

**Why `gm-release` bypasses GM Hold:**  
The GM Hold state exists to give the GM prep time before starting a player-facing countdown. `gm-release` stages are GM-paced by definition — the GM IS the timing mechanism. Inserting a GM Hold phase before a GM-release stage would require two Release clicks for no benefit. The machine enters `stageActive` directly.

**Why `action` and `response` go through GM Hold:**  
Both are player-facing countdowns. The GM needs to be ready to observe and adjudicate before the clock starts. The GM Hold phase is mandatory preparation time. This is why GM Release is emphatic (accent + pulse) during GM Hold: the HUD is displaying a "Stand By" message to players and they cannot act until the GM releases.

---

## 4. Beat Mechanics

Beats are the in-world time currency for one Tactical Cycle (TC). One TC = one round.

**Key values (Standard plugin):**

| Parameter | Value |
|-----------|-------|
| `beatsPerTC` | 60 |
| Preamble beats (GM Narrative) | 4 |
| Per-tier triad total | 8 (Action 4 + Response 4) |
| `minAdjustedTimerSeconds` | plugin-defined |

**Beat accumulation:**  
Beats accrue in real time during `stageActive`. The rate is `stage.beats / stage.timerSeconds` beats per second. Beats are NOT charged during `stageGMHold`, `stagePaused`, `stageSpin`, or `stageSpinPaused`.

**Carry-forward (GM Release early):**  
If the GM releases a timed stage before its timer expires, only the elapsed fraction of the stage's beat allocation is consumed. The surplus beats are added to the NEXT beat-consuming stage's allocation, extending its timer proportionally. Nothing is lost from the beat budget. This is intentional: the TC is a fixed-length contract; releasing early just shifts time forward.

**GM Pass:**  
The full beat cost of the stage is charged regardless of whether the timer started. The stage "existed" in the timeline. No carry-forward occurs. Surplus beats (full allocation minus actual elapsed) are consumed and discarded.

**Beat log position marker — "R:T:B":**  
Each beat log entry carries a `round:tier:beatsConsumed` marker.  
- `R` = round number  
- `T` = tier number (1-based). `0` for preamble stages that have no tier.  
- `B` = cumulative beats consumed in the TC at the moment this event fired (1 decimal place)  

Example: `1:2:14.0` = Round 1, Tier 2, 14.0 beats consumed at this point.

**BattleLedger snapshots:**  
The BattleLedger maintains a memento-pattern snapshot stack at three granularities: `round`, `tier`, and `stage`. This supports rollback on Stage Reset, Tier Reset, and Round Reset. After every `restore('tier')`, the caller immediately calls `push('tier')` to re-anchor the snapshot, enabling consecutive Tier Resets on the same re-run.

---

## 5. GM Dashboard

The GM Dashboard is the Electron main window. It is the only surface with write access to the machine (via `window.api`).

### 5.1 Top Bar

**Location:** Fixed-height (52px) strip across the top of the window.  
**Left:** "TACTICAL**MELEE**" wordmark (accent-coloured "MELEE").  
**Centre:** GM Alert strip — displays queued non-fatal system alerts one at a time.  
**Right:** Settings gear icon — opens the Settings Drawer.

**GM Alert strip behaviour:**  
Alerts arrive via `tm:gm-alert` IPC from the main process (plugin config errors, round visibility warnings, SPIN_EXCEPTION events, etc.). Multiple alerts can fire in rapid succession during Start Combat validation. They are queued in an array; the strip shows only `gmAlerts[0]`. The GM dismisses it with the close button (×), which removes index 0 and reveals the next. A `[N]` count prefix appears when more than one is queued.

**Why a queue instead of just showing the latest:**  
Config validation during Start Combat can fire several warnings in one pass. Showing only the last would silently drop earlier ones. The queue guarantees the GM sees every alert.

### 5.2 Combat Controls — Status Strip

**Component:** `Paper` at the top of `GmControls`.  
**Content:**  
- Left: Mantine `Badge` with a coloured dot showing current machine state (humanised, camelCase split on capitals), plus the current round number when round > 0.  
- Right: The name of the currently active stage (from `currentStage.name`).

**Badge dot colours:**

| Colour | Meaning |
|--------|---------|
| `green` | `stageGMHold`, `stageActive`, `stageSpin` — something is running |
| `orange` | `stagePaused`, `stageSpinPaused` — frozen |
| `yellow` | `tcComplete` — round finished, awaiting advance |
| `gray` | `idle`, `battleEnded` — nothing active |

### 5.3 Combat Controls — Button Grid

**Layout:** A CSS grid of `repeat(3, 1fr)` columns with 8px gap. All nine button slots are always rendered — buttons never disappear. Inactive buttons use the INACTIVE style (see below) rather than being hidden.

**Why always-visible buttons:**  
Disappearing/reappearing buttons destroy spatial memory. The GM must act quickly under time pressure. Knowing that "Stage Reset is always in the bottom-left" is more reliable than hunting for a button that may or may not be present. The inactive (dead) colour communicates unavailability without removing the element.

**INACTIVE style:**  
CSS custom-property overrides applied to the disabled Mantine Button via the `style` prop. These override Mantine's `[data-disabled]` styling because inline CSS variables beat selector-level rules.

```
--button-bg:    var(--tm-inactive-bg)
--button-hover: var(--tm-inactive-bg)
--button-color: var(--tm-inactive-text)
--button-bd:    1px solid var(--tm-inactive-border)
opacity: 1
pointerEvents: none  (on the Button itself)
cursor: not-allowed  (on the Box wrapper, to capture hover for Tooltip)
```

**DANGER style (danger zone only):**  
```
--button-bg:    var(--tm-danger-zone-bg)
--button-hover: color-mix(in srgb, var(--tm-danger-zone-bg) 80%, var(--tm-danger-zone-text))
--button-color: var(--tm-danger-zone-text)
--button-bd:    1px solid var(--tm-danger-zone-border)
opacity: 1
```

**Tooltip pattern:**  
Active buttons: multi-line Tooltip with full contextual explanation (beat effects, carry-forward behaviour, etc.). Inactive buttons: short one-sentence Tooltip explaining why the button is unavailable. Delay: 350ms on all tooltips. All tooltips use `whiteSpace: pre-line` to support multi-line strings.

---

**Row 1 — Navigation & Utility**

**Slot 1 — Start Combat / Next Round** *(shared slot)*  
- When `idle`: renders **Start Combat** (green filled, IconSwords). Active.  
  - Action: `window.api.startCombat()`  
  - Tooltip: "Starts the Tactical Cycle and builds the stage pipeline for round 1."  
- When `tcComplete`: renders **Next Round** (blue filled, IconPlayerSkipForward). Active.  
  - Action: `window.api.nextRound()`  
  - Tooltip: "Advances to round N. The beat budget resets to the full X beats and the stage pipeline is rebuilt for the new round."  
- All other states: renders **Start Combat** with INACTIVE style.  
  - Inactive tooltip: "Not available — an active battle is already in progress."

**Why a shared slot:**  
Start Combat and Next Round are never simultaneously relevant. They represent the same conceptual action — "begin the next phase of combat" — at different lifecycle points. Sharing the slot avoids a persistent Next Round button that is meaningless most of the time.

**Slot 2 — Launch HUD**  
- When `inCombat` (any non-idle state): Active (blue outline, IconDeviceTv).  
  - Action: `window.api.launchHUD()`  
  - Tooltip: "Opens the Group HUD window for display on a second screen."  
- When `idle`: INACTIVE.  
  - Inactive tooltip: "Available only during an active battle."

**Why inactive in idle:**  
Opening the HUD before combat starts would show the "Awaiting combat start…" splash on a blank second screen, which is marginally useful. The button is still disabled to reduce the chance of the GM opening the HUD at the wrong time.

**Slot 3 — Battle Log**  
- Always active (no inactive state). Opens the Battle Log Drawer.  
- Action: `onBattleLogOpen()` callback (opens `BattleLogDrawer`)  
- Tooltip: "Opens the battle beat log — a timeline of stage starts, releases, and passes with beat positions."  
- Never disabled because the drawer is useful at any point — even in idle, to review the previous battle's log.

---

**Row 2 — Stage Flow**

**Slot 4 — GM Release**  

*Availability (`releaseActive`):*  
```
inCombat && !isComplete && !isBattleEnded &&
  (isGMHold || (isActive && (stage.type === 'gm-release' || stage.timerSeconds > 0)) || (isSpin && backgroundOpsComplete))
```

*Emphatic state (`isReleaseEmphatic`):*  
```
isGMHold || (isActive && stage.type === 'gm-release')
```

When emphatic: accent colour (`var(--tm-accent)`), `filled` variant, `tm-release-waiting` CSS class (slow pulsing glow, 2.5s ease-in-out).  
When active but not emphatic: green, `light` variant, no pulse.  
When inactive: INACTIVE style.

**Why two emphatic conditions:**  
- `isGMHold`: The standard hold phase before any timed/action/response stage. The HUD is showing "Stand By" to players; the GM must release to start their countdown. Maximum urgency.  
- `isActive && type === 'gm-release'`: GM Narrative and similar stages bypass GM Hold and enter `stageActive` directly. The GM is the timing mechanism; the button must be emphatic to indicate an action is required. Without this condition, GM Narrative would show a plain light-green button because `isGMHold` is false.  

**Why NOT emphatic in stageSpin:**  
GM Release during a spin window (`isSpin && backgroundOpsComplete`) is optional — it ends the spin early. The spin will end on its own. No urgency, no emphasis.

**Tooltips by state:**  
- `isGMHold`: "Starts the player countdown for this stage.\n\nNo beats are charged yet — the beat clock begins ticking from the moment you release."  
- `isActive, type = gm-release`: "Ends this narrative stage and advances. This stage type has no beat cost — releasing has no effect on the beat budget."  
- `isActive, timed`: "Ends this stage early.\n\nBeats are charged proportionally to elapsed time. Unelapsed beats carry forward to the next stage, extending it — nothing is lost from the budget."  
- `isSpin, opsComplete`: "Ends the spin window early and advances to the next stage."  
- `isSpin, !opsComplete`: "Waiting for background processing to finish before the spin window can end."  
- Inactive, no active stage: "Not available — no active stage to release."  
- Inactive, other: "Not available in the current state."

**Slot 5 — Pass Stage**  

*Availability:*  
```
(isGMHold || isActive || isPaused) && currentStage.canPass === true
```

The `canPass` flag is set per stage in the plugin config. It must be explicitly `true`; stages do not pass by default. This gives the plugin author fine-grained control over which stages the GM can skip.

- Action: `window.api.pass()`
- Color: blue, `light` variant.
- Inactive tooltip: "Passing is not available for this stage type or state."

**Tooltips by state:**  
- `isGMHold`: Full beat cost charged. Stage window existed in timeline regardless. No carry-forward.  
- `isActive/isPaused`: Full beat cost charged. Unelapsed beats are NOT carried to the next stage. Represents characters doing nothing during the window.

**Why Pass charges the full cost regardless:**  
The beat budget is a TC-length contract, not a "pay as you go" meter. A stage that existed in the timeline consumed real time whether or not players engaged with it. Passing skips the engagement but not the time.

**Slot 6 — Pause / Resume** *(shared slot)*  

The slot shows **Resume** when `canResume` (isPaused or isSpinPaused), otherwise shows **Pause** (active or inactive).

*Pause availability:*  
```
(isActive && stage.type !== 'gm-release') || isSpin
```

*Resume availability:*  
```
isPaused || isSpinPaused
```

- Pause: orange, `light` variant. Action: `window.api.pause()`  
- Resume: green, `filled` variant. Action: `window.api.resume()`  
- Inactive (Pause shown but can't pause): INACTIVE style.  
  - Inactive tooltip: "Available only while a stage timer is actively running."

**Why `gm-release` stages cannot be paused:**  
GM Narrative is GM-paced. There is no "timer" to freeze. Pausing a gm-release stage has no meaningful effect on beat accumulation because gm-release stages have zero beat cost by convention. Preventing pause avoids confusing state combinations.

---

**Row 3 — Reset Controls**

All three reset controls restore the beat clock to a prior snapshot. They all require confirmation-by-intent (no modal dialog); the INACTIVE dead colour when unavailable is the guard against accidental use.

**Slot 7 — Stage Reset**  

*Availability:*  
```
(isActive || isPaused || isSpin || isSpinPaused) && inCombat && isActivityStage
```

Where `isActivityStage` = `stage.type === 'timed' || 'action' || 'response'`.

- Action: `window.api.stageReset()`
- Color: orange, `outline` variant.
- Inactive tooltip: "Stage Reset is not available for this stage type or state."

**Why restricted to activity stages:**  
Administrative system stages (surprise, initiative, resolution) run background computations that cannot be "undone" — the plugin has already fired. Allowing Stage Reset on these stages would restart the timer without re-running the computation, producing inconsistent state. The machine enforces this restriction; the UI guard keeps the button visually dead rather than enabled-but-rejected.

**Slot 8 — Tier Reset**  

*Availability:*  
```
stage.tierIndex !== undefined && inCombat &&
  (isActive || isPaused || isSpin || isSpinPaused || (isGMHold && stage.type !== 'action'))
```

- Action: `window.api.tierReset()`
- Color: orange, `outline` variant.
- Inactive tooltip: "Tier Reset is not available outside of an Action Tier stage."

**Why `stageGMHold && type !== 'action'` is the GM Hold condition:**  
In a standard pipeline, the tier triad is Action → (spin) → Response → (spin) → Resolution. GM Hold occurs before the Action stage and before the Response stage. At Action's GM Hold (type = 'action'), the tier hasn't really started yet from the GM's perspective — no player decisions have been made. Allowing Tier Reset here would be equivalent to "undo before you've started," which is meaningless. At Response's GM Hold (type = 'response', which is `!== 'action'`), the tier IS underway and a redo is meaningful.

**Slot 9 — Round Reset**  

*Availability:*  
```
(isActive || isPaused || isSpin || isSpinPaused || isGMHold) && currentStageIndex > 0
```

- Action: `window.api.roundReset()`
- Color: red, `outline` variant.
- Inactive tooltip: "Available only after the first stage of the round."

**Why `currentStageIndex > 0`:**  
At index 0 (typically GM Narrative hold), nothing has happened in the round yet. Resetting here is a no-op — the round is in its opening state. The restriction prevents an accidental "double reset" immediately after advancing to a new round.

### 5.4 Combat Controls — Message Area

A `Paper` strip rendered below the button grid. Always present; never dismissed.

**Content logic:**

| Condition | Message |
|-----------|---------|
| `isGMHold` | "⏳ GM hold — release to start player countdown, or pass to skip." |
| `isActive && timerSecondsRemaining > 0` | "⏱ {X}s remaining on stage timer." |
| `isPaused` | "⏸ Stage timer paused at {X}s." |
| `isSpin` | "⌛ Spin window: {X}s remaining." |
| `isSpinPaused` | "⌛ Spin window paused at {X}s." |
| `isComplete` | "TC complete — advance to round N when ready." |
| `isBattleEnded` | "Battle ended." |
| Otherwise | *(no message — renders "No messages." in italic dimmed text)* |

**Why permanent instead of dismissable:**  
The previous design had a dismissable GM Hold banner that reappeared on every new GM Hold transition. The GM would dismiss it once and not realise a new hold had begun. A permanent message area solves this: it always shows the current status, there is nothing to dismiss, and the "No messages." fallback communicates silence rather than ambiguity.

### 5.5 Danger Zone

A separate 2-column grid below a Divider. Both buttons use the DANGER style (per-theme burnt/rusty colours) when active.

**End Battle:**  
- Active when `!isIdle && !isBattleEnded`. INACTIVE style when unavailable.  
- Action: `window.api.endBattle()`  
- Tooltip (active): "Ends the battle immediately. All timers stop and the Group HUD shows the end screen."  
- Inactive tooltip: "Not available — no battle is currently in progress."  
- Uses DANGER style (burnt/rusty per-theme) when active, INACTIVE style when not.

**Reset Battle:**  
- Always active (available in all states including idle and battleEnded).  
- Action: `window.api.resetBattle()`  
- Tooltip: "Resets everything to idle — clears all round, stage, and beat state. This cannot be undone."  
- Always uses DANGER style.

**Why the danger zone is visually distinct:**  
End Battle and Reset Battle are irreversible. End Battle stops all timers and shifts the HUD to the recap screen. Reset Battle wipes the entire battle state, including the beat log. Using a burnt/rusty thematic colour (rather than Mantine's standard red) keeps these controls visually separate from the orange/red used by Reset controls in the main grid, while still communicating danger. The per-theme colour definitions ensure the danger aesthetic is consistent with each theme's palette.

**Why Reset Battle is always active:**  
The GM must always be able to recover from a broken state. If the machine is stuck or the plugin has misfired, Reset Battle is the nuclear option. Disabling it in any state would risk permanently locking the application.

### 5.6 System Status Panel

Rendered below the GmControls stack. Three `Paper` tiles:

| Tile | Content | Notes |
|------|---------|-------|
| Plugin | "Standard" badge (green, light) | Hardcoded in current implementation; will be dynamic when plugin selection is built |
| Players Connected | "0 / 0" badge (gray, light) | Placeholder — not yet wired to the LAN server's connection count |
| LAN Server | "Port 3001" badge (green, light) | Static; the LAN server always starts on 3001 |

### 5.7 Settings Drawer

Opens from the gear icon in the Top Bar. Slides in from the right (Mantine `Drawer`, `position="right"`, `size="sm"`).

**Content:** Theme selector. One `UnstyledButton` per available theme showing:  
- Theme name (bold)  
- "ACTIVE" label in accent colour when selected  
- Description line in dimmed text  
- Three colour swatch boxes (20×20px, from `meta.swatches`)

**Active state:** Selected theme button has an accent-coloured border and `--tm-surface-raised` background. Clicking a theme card calls `setTheme(name)` from `ThemeContext`, which swaps the active Mantine theme and CSS variable resolver immediately.

### 5.8 Battle Log Drawer

Opens from the Battle Log button in the control grid. Slides in from the right.

**Content:** Chronological list of `BeatLogEntry` records from `BattleLedgerPayload.beatLog`.

Each row shows:  
- **R:T:B marker** (monospace, accent colour): `round:tier:beatsConsumed` with tooltip showing full "Round N, Tier N, Beat N.N" text  
- **Stage name**  
- **Operation badge** (size xs, `light` variant)

**Operation badge colours and labels:**

| Operation | Label | Colour |
|-----------|-------|--------|
| `stage-start` | start | blue |
| `gm-release` | release | green |
| `time-expired` | time window complete | cyan |
| `gm-pass` | pass | orange |

**Tier value in R:T:B:** `tierIndex` is 0-based internally. Add 1 for display. Preamble stages (no tierIndex) show `0` as the tier. This means `1:0:3.0` = Round 1, preamble stage, 3.0 beats consumed.

**Why `0` for preamble, not blank:** A blank or dash would require a different display format. Using `0` keeps the R:T:B format consistent for all entries. Preamble stages are tier 0 by convention.

---

## 6. Group HUD

A standalone `BrowserWindow` (or browser tab on a player device) that connects to the LAN WebSocket server on port 3001. It has no access to Electron IPC.

### 6.1 Connection Behaviour

WebSocket URL: `ws://${window.location.hostname}:3001`  

**Why `window.location.hostname` instead of `localhost`:**  
When a player opens the HUD URL on their own device over LAN, `window.location.hostname` is the host machine's IP address. Hardcoding `localhost` would cause remote clients to connect to themselves and fail.

**Reconnect strategy:**  
- `onopen` → mark connected; components render live data  
- `onclose` → mark disconnected; schedule reconnect in 2s  
- `onerror` → force-close (so `onclose` always fires); reconnect loop continues  

The 2s retry means clients return to the live view automatically after a network blip. The pending reconnect timer is cleared on component unmount to avoid spurious reconnects after teardown.

**Message types:**  
- `TC_STATE` payload → replaces the full `TCStatePayload` state snapshot  
- `LEDGER_STATE` payload → replaces the full `BattleLedgerPayload`  

The LAN server caches the latest of each message type and replays both on every new WebSocket connection. A client joining mid-combat immediately receives current state without waiting for the next broadcast.

### 6.2 Idle Splash

Shown when `state === null || state.machineState === 'idle'`.

Displays: "TACTICAL**MELEE**" wordmark + "Awaiting combat start…" in dimmed text. Full-screen centred flex layout. Persists between rounds (the machine returns to idle after Reset Battle).

### 6.3 Live Combat Layout

CSS grid — 2 rows × 4 columns filling 100vh.

```
Columns: 260px | 1fr | auto | auto
Rows:    auto  | 1fr

Areas:
  "round   message   message   message"
  "stages  content   countdown burndown"
```

Gap: 1px. The `--tm-body-bg` background bleeds through the gaps, creating thin divider lines without explicit borders on every cell. Additional explicit borders on the header row (`borderBottom`) and between the left column and centre (`borderRight`) reinforce the grid structure.

### 6.4 Round Counter

**Grid area:** `round` (top-left).  
Shows "Round" label and a large numeric round number.  
- Shows `—` when `round === 0` (idle, before first Start Combat).  
- When `tcComplete`: round number turns accent colour and "COMPLETE" label appears below.

### 6.5 Message Area

**Grid area:** `message` (top, spans 3 columns).  
Shows a contextual icon and message string.

**Icon selection (priority order):**

| Condition | Icon | Colour |
|-----------|------|--------|
| `stageGMHold` | IconUser | `--tm-accent` |
| `stagePaused` | IconPlayerPause | `--tm-warning` |
| `stage.type === 'gm-release'` | IconUser | `--tm-accent` |
| `stage.type === 'system-complete'` | IconSettings (spinning) | `--tm-accent` |
| Otherwise | *(none)* | — |

**Message selection (priority order):**

| Condition | Message |
|-----------|---------|
| `tcComplete` | "Round complete. Awaiting GM." |
| `stagePaused` | "Combat paused." |
| `stageGMHold` (response stage) | "GM is preparing NPC responses — stand by." |
| `stageGMHold` (other) | "GM is preparing NPC actions — stand by." |
| Otherwise | `stage.description` from the stage definition |

**Why machine-state checks take priority over stage type:**  
`stageGMHold` and `stagePaused` are transient states that overlay the underlying stage. The underlying stage's description would be misleading ("Declare your actions…" while paused). Machine state overrides ensure the message always reflects what is CURRENTLY happening, not what the stage is nominally about.

### 6.6 Stage List

**Grid area:** `stages` (left column, scrollable).  
Displays all stages in the current round's pipeline, grouped visually.

**Grouping logic:**  
- Preamble stages (no `tierIndex`) render individually without a header.  
- Consecutive stages sharing the same `tierIndex` are grouped under a "Tier N" divider with a left-border connector.

**Stage card visual states:**

| State | Condition | Appearance |
|-------|-----------|------------|
| Done | `idx < currentIndex \|\| isComplete` | Dimmed (opacity 0.55), checkmark icon, no beat label |
| Active | `idx === currentIndex && !isComplete` | Accent border, raised background, glow, bold name, accent colour, beat label shown |
| Upcoming | `idx > currentIndex && !isComplete` | Low opacity (0.4), type icon, beat label shown |

**Beat label:** Shown on active and upcoming stages only. Omitted on done stages because a released stage's beat allocation ≠ actual beats consumed (carry-forward may have inflated or a partial release may have reduced it). The burndown bar is the authoritative consumed total.

**Beat label formatting:**  
Whole numbers display without decimal (e.g. `4b`). Fractional values (carry-inflated) display at 1dp (e.g. `4.7b`). This matches the burndown's `toFixed(1)` precision.

**Tier header state:**  
- Active tier: header text in accent colour, left border in accent colour, full opacity.  
- Done tier: dimmed text, border colour, 0.6 opacity.  
- Upcoming tier: dimmed text, border colour, 0.4 opacity.

### 6.7 Digital Countdown

**Grid area:** `countdown` (right of centre).  
A large numeric display or icon indicating what the machine is currently doing.

**Render branches (in evaluation order):**

| Machine state / stage type | Display |
|----------------------------|---------|
| `stageGMHold` | IconUser (accent), "GM" label |
| `stageSpin` | IconHourglass (accent), "Processing" label |
| `stageSpinPaused` | IconHourglass (warning, 0.7 opacity), "Paused" label |
| `tcComplete` | IconFlagCheck (accent), "Done" label |
| `stagePaused` | IconPlayerPause (warning) + frozen seconds value (warning colour, 0.7 opacity) + "paused" label |
| `stageActive` with `gm-release` type | IconUser (accent), "GM" label |
| `stageActive` with non-timed type | IconSettings (accent), "Processing" label |
| `stageActive` with timed type | Large numeric countdown |

**Timed countdown colour thresholds:**

| Seconds remaining | Colour |
|-------------------|--------|
| > 10 | `--mantine-color-text` (white/default) |
| > 5 | `--tm-timer-warning` |
| ≤ 5 | `--tm-timer-critical` |

The countdown border and text both transition to the threshold colour simultaneously, with a 300ms CSS transition for smooth progression. The display uses `font-variant-numeric: tabular-nums` and zero-pads to two digits to prevent layout shift as the number decreases.

### 6.8 Beats Burndown

**Grid area:** `burndown` (far right).  
A vertical bar (320px tall, 28px wide) showing the remaining beat budget as a proportion of the total.

**Fill behaviour:**  
The bar fills from the bottom. Fraction = `beatsRemaining / totalBeats`, clamped to [0, 1]. The fill height is `fraction * 100%`. A marker line sits at the consumed/remaining boundary `(1 - fraction)` from the top.

**Colour thresholds:**

| Fraction | Colour |
|----------|--------|
| > 0.5 | `--tm-timer-active` (green) |
| > 0.2 | `--tm-timer-warning` (yellow/amber) |
| > 0 | `--tm-timer-critical` (red) |
| = 0 | `--tm-border` (depleted) |

**Transitions:** `height 800ms ease`, `background-color 400ms ease`, `top 800ms ease` for the marker. When paused: transitions are disabled (`none`) and opacity drops to 0.5 to convey the frozen state.

**Labels:**  
- Top: "BEATS" label (dimmed, uppercase, rotated horizontal)  
- Above track: `−{consumed}` beats consumed (dimmed, 1dp)  
- Below track: `{remaining}` beats remaining (thematic colour, 1dp, bold)

**Why 800ms transition instead of immediate:**  
The beat value updates every tick (roughly every second or sub-second during stageActive). An instant jump would produce a jittery, anxious bar. 800ms smoothly interpolates between ticks, giving the bar a continuous "draining" feel that communicates time pressure without visual noise.

### 6.9 Battle Ended Recap

Shown when `machineState === 'battleEnded'`. Full-screen scrollable layout.

**Header:** "BATTLE ENDED" (danger colour) + "Round N — Battle Beat Log" subtitle.

**Beat log timeline:** One row per `BeatLogEntry`, using the same R:T:B format and operation badge colours as the GM Dashboard's Battle Log Drawer (see §5.8). The HUD version uses `ScrollArea` to handle long logs.

**Why mirrored on the HUD:**  
The beat log is the debrief record. Players should be able to review it after a battle to understand how beat resources were spent. Showing it full-screen on the HUD after End Battle makes it immediately visible to the whole table.

---

## 7. Theming System

Three built-in themes. Each theme is defined in `src/renderer/src/themes/`.

**Theme file structure:**  
1. `createTheme(...)` — Mantine theme overrides (primary colour, shade, border radius)  
2. `CSSVariablesResolver` — exports `--tm-*` CSS custom properties  
3. `meta` object — `{ name, description, swatches[] }` used by the Settings Drawer

**Registering a new theme:** Add the file, export the triple, and add the entry to `src/renderer/src/themes/index.ts`. The Settings Drawer automatically picks it up.

**CSS custom properties reference:**

| Variable | Purpose |
|----------|---------|
| `--tm-body-bg` | Page background (darkest) |
| `--tm-surface` | Component background (slightly lighter than body) |
| `--tm-surface-raised` | Elevated component background (e.g. active stage card) |
| `--tm-border` | Subtle divider colour |
| `--tm-accent` | Primary highlight colour (timers, active states, GM Hold emphasis) |
| `--tm-accent-dim` | Desaturated/darker version of accent (used in pulse animation shadow) |
| `--tm-danger` | Destructive action colour |
| `--tm-success` | Positive state colour |
| `--tm-warning` | Caution/paused state colour |
| `--tm-timer-active` | Countdown colour when time is plentiful |
| `--tm-timer-warning` | Countdown colour when time is low |
| `--tm-timer-critical` | Countdown colour when time is critical |
| `--tm-inactive-bg` | Background for inactive (disabled) buttons; blends toward body |
| `--tm-inactive-text` | Text colour for inactive buttons |
| `--tm-inactive-border` | Border colour for inactive buttons |
| `--tm-danger-zone-bg` | Background for danger zone buttons (burnt/rusty) |
| `--tm-danger-zone-text` | Text colour for danger zone buttons |
| `--tm-danger-zone-border` | Border colour for danger zone buttons |

**Theme palettes:**

| Variable | Tactical | Arcane | Iron |
|----------|----------|--------|------|
| `--tm-inactive-bg` | `#0d1a0d` | `#140f2a` | `#161920` |
| `--tm-inactive-text` | `#2d4a2d` | `#2e2060` | `#2a3048` |
| `--tm-inactive-border` | `#1a2e1a` | `#221840` | `#1e2330` |
| `--tm-danger-zone-bg` | `#1a1200` | `#1a0d0d` | `#1a1008` |
| `--tm-danger-zone-text` | `#9a6510` | `#8a2020` | `#9a4010` |
| `--tm-danger-zone-border` | `#3d2800` | `#3d1010` | `#3d1e08` |

**Why inactive colours blend toward the background:**  
The inactive buttons must be visually quiet without disappearing. A colour that is slightly lighter than the body background but darker than the normal surface communicates "this is here but not available" without drawing the GM's eye. If inactive buttons were fully hidden, the GM would lose spatial memory.

---

## 8. Round Visibility Rules

Each `StageDefinition.roundVisibility` is an array of `RoundVisibilityEntry` strings controlling which rounds a stage participates in.

| Entry | Meaning |
|-------|---------|
| *(empty array)* | Active every round |
| `A#` | Active for round # only (requires an `I#` to have any effect; without `I#`, it is redundant) |
| `I#` | Inactive from round # onward (inclusive) |
| `i#` | Inactive for exactly round # only |

**Evaluation cascade (`isStageActiveForRound`):**
1. If any `i#` matches → inactive. Stop.
2. If no `I#` entries exist → active. Stop.
3. Find highest `I#` ≤ currentRound. If none → active (I# not yet in effect). Stop.
4. I# is in effect → active only if an explicit `A#` matches this exact round.

**Priority:** `i#` (highest) > `A#` > `I#`

**Common patterns:**

| Pattern | Meaning |
|---------|---------|
| `[]` | Every round |
| `['A1','I2']` | Round 1 only |
| `['i1']` | Round 2+ only |
| `['I3']` | Rounds 1–2 only |

**Validation errors/warnings** (fired as GM alerts on Start Combat):
- ERROR: `I1` with no `A#` → stage never active (invalid)
- WARNING: `A#` with no `I#` → A# is redundant
- WARNING: `A#` and `i#` on same round → `i#` wins; A# is misleading

---

## 9. Control Availability Matrix

The table below shows every control's availability across machine states.
✅ = active/available, 🔴 = inactive (INACTIVE style shown), — = not applicable.

| Control | idle | stageGMHold | stageActive | stagePaused | stageSpin | stageSpinPaused | tcComplete | battleEnded |
|---------|------|-------------|-------------|-------------|-----------|-----------------|------------|-------------|
| Start Combat | ✅ | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 | 🔴 |
| Next Round | — | — | — | — | — | — | ✅ | — |
| Launch HUD | 🔴 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Battle Log | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| GM Release | 🔴 | ✅ (emphatic) | ✅ if timed or gm-release; 🔴 otherwise | 🔴 | ✅ if opsComplete; 🔴 otherwise | 🔴 | 🔴 | 🔴 |
| Pass Stage | 🔴 | ✅ if canPass | ✅ if canPass | ✅ if canPass | 🔴 | 🔴 | 🔴 | 🔴 |
| Pause | 🔴 | 🔴 | ✅ if not gm-release | 🔴 | ✅ | 🔴 | 🔴 | 🔴 |
| Resume | 🔴 | 🔴 | 🔴 | ✅ | 🔴 | ✅ | 🔴 | 🔴 |
| Stage Reset | 🔴 | 🔴 | ✅ if activity stage | ✅ if activity stage | ✅ if activity stage | ✅ if activity stage | 🔴 | 🔴 |
| Tier Reset | 🔴 | ✅ if tier stage + type≠action | ✅ if tier stage | ✅ if tier stage | ✅ if tier stage | ✅ if tier stage | 🔴 | 🔴 |
| Round Reset | 🔴 | ✅ if stageIndex > 0 | ✅ if stageIndex > 0 | ✅ if stageIndex > 0 | ✅ if stageIndex > 0 | ✅ if stageIndex > 0 | 🔴 | 🔴 |
| End Battle | 🔴 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🔴 |
| Reset Battle | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Notes:**  
- Start Combat and Next Round share slot 1. The table shows them separately for clarity.  
- Pause and Resume share slot 6. Resume is shown when `isPaused || isSpinPaused`; Pause is shown otherwise.  
- "activity stage" = `stage.type === 'timed' || 'action' || 'response'`  
- "tier stage" = `stage.tierIndex !== undefined`  
- GM Release emphatic state = `stageGMHold` (any stage) OR `stageActive + gm-release type`
