---
name: TMCritterMaker
description: Electron subproject of TacticalMelee. YAML-driven critter state machine designer and test harness. CritterRegistry/CreatureMappingRegistry split established 2026-05-10.
type: project
originSessionId: 72fbb481-6807-4675-bc2b-513d6f9763a7
---
# TMCritterMaker — Design Context
*Started: 2026-04-26 · Updated: 2026-05-10 · Subproject of TacticalMelee*

## What It Is
An Electron + electron-vite + React + TypeScript desktop app for designing critter class definitions as YAML, generating XState machine configs via a factory, and testing them interactively.

## Planned Location
`D:\PROJECTS\ClaudeCode\TMCritterMaker\`

## Authoritative Design Docs
- `critter-registry-design.md` — CritterRegistry, Critter YAML spec (authoritative), Factory design, open questions
- `plugin-manager-design.md` — PluginManager, plugin YAML spec, CreatureMappingRegistry, Rules Registry DSL
- `tmcrittermaker-design-state.md` — pipeline architecture, test harness design, Bout stub
- `battle-model-architecture.md` — full multi-machine model; Skirmish/Bout/Geomancer/Formation

## Organizational Split (established 2026-05-10)
Three abstraction levels:
| Level | Owned by | Examples |
|---|---|---|
| **Critter** | CritterRegistry (BattleEngine) | `humanoid`, `giant_kind` — machine class blueprint |
| **Creature** | CreatureMappingRegistry (PluginManager) | `dwarf`, `elf`, `goblin` — game-world name + biases |
| **Combatant** | Bout / Skirmish | PC, NPC — battle role |

- **CritterRegistry**: Critter YAML files, YAML parser, Critter Factory, in-memory class index
- **CreatureMappingRegistry**: plugin YAML `creature_types` section; resolves creature names to critter class IDs + biases at load time

## Three-Layer Pipeline
```
Plugin YAML + Critter YAML
  → [Resolver] → PluginContext
  → [Factory] + Critter YAML + Creature Biases → XState machine config
  → createMachine(config) → critter actor
```
Factory is a sub-component of CritterRegistry within BattleEngine; same implementation used by TMCritterMaker.

## Multi-Machine Architecture
```
Skirmish actor
  ├── Geomancer actor — battlefield geography
  ├── Bout actor(s) — one per combatant pair; measure + orientation
  ├── Formation actor(s) — allied groups
  └── Critter machine(s) ← TMCritterMaker scope
```
Orientation/facing NOT in critter machine — belongs to Bout. Attack events carry approach direction as payload.

## YAML Design Approach: Middle Path
1. **Shorthand primitives** — baked-in semantics, concise YAML
2. **Explicit declarative** — full states/events/transitions/actions in YAML (escape hatch; vocab not yet designed — CR-OQ-4)

## Confirmed Primitive Types

| Primitive | Owns | Key semantics |
|---|---|---|
| `life_state` | vitality state | compound; responds to POOL_THRESHOLD + APPLY_CONDITION_EFFECT |
| `resource_pool_group` | numeric pools + thresholds | DECREMENT/INCREMENT; broadcasts POOL_THRESHOLD on cross |
| `accumulator_group` | numeric trackers, no threshold | INCREMENT/DECREMENT; no broadcast |
| `status_tracker` | active condition lists | APPLY/REMOVE; scoped critter-level or per body part |
| `body_part_group` | targetable regions | YAML-defined tiers + on_enter effects; natural weapon disarm on destroyed |
| `slot_manager` | equipping + combat slot availability | SLOT_REQUEST/SLOT_RELEASE; guards carried_weapon_group transitions |
| `action_economy` | actions/reactions per turn | SPEND_ACTION/SPEND_REACTION; TURN_START reset |
| `movement_state` | elevation + movement points | elevation as compound states; MOVE decrements; TURN_START resets |
| `offensive_status` | all offense state | GROUPING — parallel container |
| `defensive_status` | all defense state | GROUPING — parallel container |

**Primitive enumeration NOT yet complete (CR-OQ-2).**

**Children of offensive_status:**
- `offense_mode` (compound exclusive; 3 states): `freestyle-grapple` (initial) · `freestyle-armed` (payload: weapon ID) · `honed-war-form` (payload: weapon ID + package ID + profile ID)
- `carried_weapon_group` (full weapon state hierarchy — see below)

**Children of defensive_status (parallel):**
- `defensive_position` (compound exclusive; 4 states): `freestyle-unarmed` (initial) · `freestyle-armed` (payload: weapon ID) · `war-honed-guard` (payload: weapon ID + guard pkg ID + profile ID) · `war-honed-evasion` (payload: evasion pkg ID + profile ID; evasion IDs: parryFocus, retreatFocus, dodgeFocus, footworkFocus, grappleWeaponFocus, beatWeaponFocus, distanceKeepingFocus, measureFocus)
- `commitment` (compound exclusive): `normal` (initial) · `defensiveSacrifice` (plugin-defined bonus)

`freestyle` prefix = instinctive, no structured technique. Not pejorative.

## Weapon State Hierarchy (carried_weapon_group)
```
empty / stowed / holstered / in_hand
readied (compound)
  ├── free
  └── engaged (compound)
        ├── wielding (initial) / out_of_line / locked_as_binder / locked_in_bind
        ├── grappled_weapon / grappling_weapon / grappling_opponent
        ├── target_struck (transient) / weapon_stuck / weapon_clash (transient)
disarmed — slot freed; weapon on ground; recoverable
```
Weapon transitions not yet designed (CR-OQ-3).

## Body Part Tiers (YAML-defined)
Tiers: intact(initial) → grazed → wounded(on_enter: condition effect ID) → critical → destroyed
`exposure_planes` draws from the 8-label hex prism enum (front/front-left/rear-left/rear/rear-right/front-right/above/below)

## Key Design Decisions
- Factory needs both YAMLs; critter YAML alone insufficient
- Threshold wiring in plugin YAML; critter YAML owns vocabulary (IDs only)
- TURN_START is an external event; critter machine doesn't know about turns
- Wager amount in critter machine context (not state); pool type + global cap in plugin YAML
- offense_mode and defensive_position: behavioral modes only; weapon/package/profile IDs in event payload and context — machine topology is ID-free
- `disarmed` = state (not transition); weapon on ground, recoverable
- Critter YAML: game-system-neutral blueprint. Creature biases (game-world) come from PluginManager at instantiation time.

## Open Design Questions
- **CR-OQ-1**: Stat type taxonomy — where is "strength is an accumulator" declared? (Critter YAML vs Plugin YAML/CMR vs shared schema) — must decide before Factory implementation
- **CR-OQ-2**: Primitive enumeration — incomplete; finalize before Factory
- **CR-OQ-3**: Weapon state transitions — deferred until primitives complete
- **CR-OQ-4**: Explicit declarative YAML vocabulary — not yet designed
- **PY-OQ-1**: Condition effect schema — what can a condition effect do mechanically? (Needed before critter YAML body part tiers can be finalized)
- **PY-OQ-2**: Threshold trigger value schema — fixed number? fraction? expression? bidirectional?
- **OQ-1/OQ-2**: DSL token scope — multi-actor binding convention for `{attacker.str}` vs `{defender.armor}`

## Build Plan
1. ~~Design critter YAML schema~~ — In progress (authoritative spec in `critter-registry-design.md`)
2. Complete primitive enumeration (CR-OQ-2)
3. Resolve stat type taxonomy (CR-OQ-1)
4. Design condition effect + threshold schemas (PY-OQ-1, PY-OQ-2)
5. Design weapon state transitions (CR-OQ-3)
6. Design explicit declarative YAML vocab (CR-OQ-4)
7. Define PluginContext TypeScript interface + Resolver
8. Build Critter Factory
9. Scaffold Electron app, build loader, YAML editor, test harness
10. Extract factory + PluginContext as shared module for TacticalMelee

## Wager Mechanic (summary)
Only on `honed-war-form`; gated by combatant type (PC always; boss NPC if flagged; regular NPC never) AND WPP `wager_allowance` ≠ `none`. Wager=0: no risk/effect. Wager>0+success: bonus per WPP `wager_balance` (hitOverDamage|damageOverHit|balanced|remiseOnly) — profile-determined. Wager>0+fail: riposte; `wager_riposte` governs weighting; `commitment_scaling` governs exposure. Defensive position does not mitigate riposte. Full spec: `combat-mechanics-and-group-hud.md`.

## Pattern Library
- `WeaponSpecificTieredPackageCatalog_rich.yaml` — weapon-specific packages; each has: id, weapon, tier, pattern, name, description, actions, profile_id
- `GenericWeaponPatternParameterCatalog_rich.yaml` — WPP profiles (395 across 18 weapon types); WPP enum values integer-encoded 0/5/10… left-to-right
- `WeaponReferenceData.yaml` — authoritative physical weapon facts (reach, inertia, size, damage); consistent across all packages per weapon type (verified)
