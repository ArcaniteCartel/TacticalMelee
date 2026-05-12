---
name: TacticalMelee — Active Context
description: Compact working context for TacticalMelee. Version0.1 baseline. Tech stack, built/stub/gap status, plugin config, key gotchas, open questions, next work. BattleEngine architecture. Docs in repo under docs/.
type: project
originSessionId: bd43b247-5720-4e67-9022-fa22ed419fe3
---
# TacticalMelee — Active Context
*Baselined: 2026-04-24 · Tag: Version0.1 · Repo: ArcaniteCartel/TacticalMelee · Branch: main*
*BattleEngine architecture: designed 2026-05-10*

## What It Is
TTRPG combat aid. Timeboxed simultaneous decision windows per initiative tier, computer-resolved math, plugin layer for game mechanics. ElectronJS on GM's machine; Group HUD + player dashboards served over LAN WebSocket. Collective timing only — no per-player timers.

## Tech Stack
- ElectronJS + electron-vite · React 18 + TypeScript · Mantine v7 · XState v5
- pino v8 logging · Express + ws WebSocket (port 3001)
- Working dir: `D:\PROJECTS\ClaudeCode\TacticalMelee`

## Reference Docs (committed to repo under `docs/`)
- `system-architecture.md` — component interfaces, IPC/WS paths, data flow
- `beat-mechanics-and-battle-ledger.md` — beat math, carry-forward, BattleLedger stack
- `feature-and-ui-spec.md` — machine states, stage types, control matrix, HUD components
- `battle-model-architecture.md` — BattleEngine ownership, BattleLedger, Skirmish/Bout/Geomancer/Formation model
- `plugin-manager-design.md` — PluginManager, plugin YAML spec, Rules Registry DSL, CreatureMappingRegistry
- `critter-registry-design.md` — CritterRegistry, Critter YAML spec, Critter Factory design
- `tmcrittermaker-design-state.md` — TMCritterMaker tool design and pipeline
- `bout-resolution-decision-tree.md` — 13-step bout resolution algorithm; A.3 WPP enum values with integer codes
- `combat-mechanics-and-group-hud.md` — wager mechanic, Group HUD, Bout Card spec
- `glossary.md` — 55+ term glossary (A–X)

## BattleEngine Architecture (designed 2026-05-10)
Intended design — not yet implemented. To be introduced when Skirmish actor is first built.

```
BattleEngine  (src/main/battle/BattleEngine.ts)
  ├── PluginManager      ← sole game-system interface; evaluate(tag, args)→result
  │     ├── Rules Registry         ← compiled DSL rules, topologically sorted
  │     ├── CreatureMappingRegistry ← game-world creature names → critter class + biases
  │     └── Resolver               ← validates YAMLs, produces PluginContext
  ├── WeaponRegistry     ← BattleEngine-direct (not via PluginManager); 3 weapon YAMLs in-memory
  ├── CritterRegistry    ← Critter YAML files + parser + Factory
  ├── Skirmish actor     ← top-level combat coordinator
  └── BattleLedger       ← snapshot/log
```

Observable to index.ts: `battleEngine.onStateChange(cb: (snapshot) => void)`
WeaponRegistry query: `getWeaponPhysicalData(id)` · `getPackage(id, tier, pkgId)` · `getWppProfile(id)`
PluginManager interface: `pluginManager.evaluate(tag, args) → result`

### Three Abstraction Levels (Critter/Creature/Combatant)
| Level | Owned by | Examples |
|---|---|---|
| Critter | CritterRegistry (BattleEngine) | `humanoid`, `giant_kind` — machine blueprint |
| Creature | CreatureMappingRegistry (PluginManager) | `dwarf`, `elf`, `goblin` — game-world name + biases |
| Combatant | Bout / Skirmish | PC, NPC — battle role |

### DSL Rules Registry Key Decisions
- Rule structure: `id`, `inputs`, `returns`, `body`
- Body statements: `assign` (eval: dice|mathjs), `if/then/else`, `while` (100-iter cap), `for`, `call`
- Two evaluators: `dice` (rpg-dice-roller), `mathjs`
- Token substitution: string-template `{token}` for plugin-level stats; mathjs scope for local vars
- Inter-rule cycles: topological sort at load time; intra-rule forward refs validated
- WPP enum integer encoding: 0, 5, 10… left-to-right; free text tokens exempt

### Initial Measure Contest
- Melee closure: Bout passes reach/inertia (ordinals from WeaponReferenceData) + actor refs to rules registry
- Rule tag `initial_measure_contest` returns score ∈ [-1, 1]
- Score-to-Measure: 3-step probabilistic algorithm; score=0 → 50/50 weak assignment; score=±1 deterministic

## Status: BUILT (fully working as of Version0.1)
- XState machine: 9 states, all events
- Beat budget: accumulation, carry-forward (intra/cross-tier), GM Pass full-cost, surplus detection
- BattleLedger: Memento stack (round/tier/stage), rollback
- StagePlanner: triad expansion, tierIndex stamping, UPDATE_PIPELINE, beat adjustment
- GM Dashboard: fixed 3×3 control grid, status strip, message area, danger zone, Battle Log drawer, Settings drawer
- Group HUD: live combat grid, stage list, digital countdown, burndown bar, battle-ended recap, WS auto-reconnect
- LAN server: WebSocket port 3001, cache-one-per-type replay
- Three themes: Tactical / Arcane / Iron. CSS vars: `--tm-*`
- Round visibility: A#/I#/i# DSL, cascade evaluation, validation alerts

## Status: STUB / NOT STARTED
- All 7 stage handlers (on-ops); SPIN_COMPLETE never fired; player dashboard; plugin YAML loading; expression language; per-player WS filtering; player action declarations

## Standard Plugin Config (ActivePlugin.ts)
60 beats/TC · Preamble (GM Narrative 0b + Pre-Encounter 4b/30s) · Admin (Surprise/Initiative, 0b each) · Triad per tier: Action (4b/30s) + Response (4b/30s) + Resolution (0b, 30s spin) · 7 tiers fit in 56b

## Key Gotchas (see software-patterns.md)
- `checkAdvance` is transient — subscription must return early or `prevMachineState` corrupts
- `lastIpcOp` relies on XState v5 sync semantics
- `pendingCrossTierCarry` has 4 timing zones — never apply in Zone 2
- Post-restore push invariant: always `push('tier')` immediately after `restore('tier')`
- `beatsAtStageEntry` never mutated mid-stage
- GM Release emphatic: `isGMHold || (isActive && stage.type === 'gm-release')`

## Open Questions
- **OQ-1**: Can GM re-run an administrative stage after completion? No decision.

## Design Agenda (as of 2026-05-12)
See `project_tacticalmelee_agenda.md` for the full prioritized design frontier.
