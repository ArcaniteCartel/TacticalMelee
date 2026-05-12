# TMCritterMaker — Design State
*As of 2026-04-30*

## What We're Building
An Electron + electron-vite + React + TypeScript desktop app for:
1. Authoring critter class definitions in YAML
2. Generating XState machine configs via a factory
3. Testing critter machines interactively (instantiate actor, send events, observe state)

**"Critter"** = any combatant (PC, NPC, creature) in TacticalMelee combat.

---

## Architecture

### Three-layer pipeline
```
Plugin YAML + Critter YAML
        ↓
    [ Resolver ] — validates mappings, produces PluginContext
        ↓
    PluginContext
        ↓
    [ Factory ] + Critter YAML + Type Biases → XState machine config
        ↓
    createMachine(config) → actor
```

### Critter YAML = class definition
Plugin YAML = specific type instantiation with biases (critter types, stat biases, DSL rules,
condition effects, thresholds, wager config).

*Plugin YAML structure and design: `plugin-manager-design.md`.*

### Multi-machine tier
```
Skirmish actor          — top level; all participants, Bout lifecycle, geographical org
    └── Bout actor(s)   — one per combatant pair; measure, mutual orientation
            └── Critter machine(s) — individual internal state ← TMCritterMaker scope
```
Critter machine is a leaf. Orientation/facing lives in the Bout, not the critter machine.
Attack events carry approach direction as payload.

See `battle-model-architecture.md` for the full Skirmish, Bout, and orientation model.

### Shared factory
Same factory used in TMCritterMaker and in main TacticalMelee app.
Main app uses an ActivePlugin adapter to produce PluginContext from ActivePlugin.ts.

---

## Spatial Model
Each critter occupies a **hex prism**. 8 standardized exposure plane labels (fixed enum):
- Vertical (6): `front`, `front-left`, `rear-left`, `rear`, `rear-right`, `front-right`
- Horizontal (2): `above`, `below`

Body part `exposure_planes[]` in the critter YAML draws from this enum. The Bout machine
uses these same labels for orientation tracking — a body part is only targetable if its
declared plane matches the attacker's current adjacency value in the Bout.

Large critters (dragon) occupy multiple hex prisms joined at faces — geometry TBD.

See `battle-model-architecture.md` for the full orientation and targeting model.

---

## YAML Design Approach: Middle Path
1. **Shorthand primitives** — declare `type: resource_pool_group`; factory supplies
   all baked-in semantics. Concise, opinionated.
2. **Explicit declarative** — escape hatch for new patterns; specify states, events,
   transitions, actions directly in YAML without touching factory code.

Shorthands expand to explicit form internally. Designer uses shorthand when it fits,
drops to explicit when they need something new.

---

## Critter YAML Top-Level Structure
```yaml
critter_type: humanoid
version: "1.0"
condition_effects: []    # behavioral categories; plugin YAML maps its conditions here
threshold_vocabulary: [] # named threshold ids; plugin YAML maps its thresholds here
parallel_regions: []     # XState parallel state definitions
```

---

## Confirmed Primitives

### Top-level primitives

| Primitive | Owns | Baked-in semantics |
|---|---|---|
| `life_state` | vitality state | Compound. Responds to POOL_THRESHOLD + APPLY_CONDITION_EFFECT. YAML defines states. |
| `resource_pool_group` | numeric pools + thresholds | One parallel region per pool (from PluginContext). DECREMENT/INCREMENT. Broadcasts POOL_THRESHOLD on threshold cross. |
| `accumulator_group` | numeric trackers | One per accumulator (from PluginContext). INCREMENT/DECREMENT. No threshold, no broadcast. |
| `status_tracker` | active condition lists | APPLY_CONDITION / REMOVE_CONDITION. Scoped: critter-level or per body part. |
| `body_part_group` | targetable regions | YAML-defined tiers with on_enter effects. Natural weapon disarm on destroyed. Per-part status_tracker. |
| `slot_manager` | equipping + combat slot counts | SLOT_REQUEST / SLOT_RELEASE. Guards carried_weapon_group transitions. |
| `action_economy` | actions/reactions per turn | SPEND_ACTION / SPEND_REACTION. Baked-in TURN_START reset. Values from PluginContext. |
| `movement_state` | elevation mode + movement points | Elevation modes as compound states. MOVE decrements points. TURN_START resets. |
| `offensive_status` | all offense-related state | **Grouping primitive** — parallel container for offense child primitives (see below). |
| `defensive_status` | all defense-related state | **Grouping primitive** — parallel container for defense child primitives (see below). |

### Child primitives under `offensive_status`

| Primitive | Owns | Baked-in semantics |
|---|---|---|
| `offense_mode` | selected attack mode | Compound — exclusive. Three behavioral modes: `freestyle-grapple`, `freestyle-armed`, `honed-war-form`. Mode is set by event; weapon ID, package ID, and profile ID travel in the event payload and are stored in context. |
| `carried_weapon_group` | carried weapon slot states | Full state hierarchy (see below). State-change events for cost calc. |

#### `offense_mode` structure

`offense_mode` is compound — exclusive. Three behavioral modes:

| Sub-state | Event payload | Context stores | Notes |
|---|---|---|---|
| `freestyle-grapple` | — | — | Initial. No weapon; pure instinctive grappling. No package, no profile. |
| `freestyle-armed` | weapon ID | weapon ID | Weapon is readied; fighting instinctively without a package. |
| `honed-war-form` | weapon ID + package ID + profile ID | weapon ID + package ID + profile ID | Skilled package selected. Package and weapon profile resolve together at execution time. |

Event payload carries all identifying information at the moment of selection; context stores it
for the duration of the exchange. The machine itself does not need to inspect the IDs — the
rules registry receives them from context when evaluating the exchange.

If a `honed-war-form` package proves incompatible with the opponent's action, the system reverts
to `freestyle-armed` (if a weapon is readied) or `freestyle-grapple` (if not). See OQ-3 for
compatibility determination mechanics.

Each package in the Pattern Library carries a `measure_profile` (optimal / viable / weak)
indicating at which measure it performs best — likely a primary compatibility signal.
Package IDs and their full definitions are maintained in the Pattern Library documents
(e.g., `Longsword-Attack-Pattern-Library.md`). Weapon profile IDs are TBD.

---

### Child primitives under `defensive_status`

| Primitive | Owns | Baked-in semantics |
|---|---|---|
| `defensive_position` | which defensive approach is active | Compound — exclusive. Four behavioral modes: `freestyle-unarmed`, `freestyle-armed`, `war-honed-guard`, `war-honed-evasion`. Mode is set by event; identifying IDs travel in the event payload and are stored in context. |
| `commitment` | whether a defensive sacrifice has been made | Compound — exclusive. Initial: `normal`. |

#### `defensive_position` sub-states

`defensive_position` is compound — exclusive. Four behavioral modes:

| Sub-state | Event payload | Context stores | Notes |
|---|---|---|---|
| `freestyle-unarmed` | — | — | Initial. No weapon; instinctive defense — evasion, flinching, interposing. No technique. |
| `freestyle-armed` | weapon ID | weapon ID | Weapon is readied; defending instinctively without a structured guard or evasion technique. |
| `war-honed-guard` | weapon ID + guard package ID + profile ID | weapon ID + guard package ID + profile ID | Trained guard position with weapon. Guard packages and profiles TBD. |
| `war-honed-evasion` | evasion package ID + profile ID | evasion package ID + profile ID | Trained evasion technique. Evasion packages and profiles TBD. |

Event payload carries all identifying information at the moment of selection; context stores it
for the duration of the exchange. The machine itself does not need to inspect the IDs — the
rules registry receives them from context when evaluating the exchange.

Evasion technique IDs (formerly hardcoded sub-states of `evasion_based_defense`) are now
carried as `war-honed-evasion` payload: `parryFocus` · `retreatFocus` · `dodgeFocus` ·
`footworkFocus` · `grappleWeaponFocus` · `beatWeaponFocus` · `distanceKeepingFocus` ·
`measureFocus`. These are now package/profile IDs, not machine states.

> **`freestyle` prefix** — used across both offense and defense modes, it indicates instinctive
> combat without a structured technique or package. The word carries no negative connotation;
> a combatant in `freestyle-armed` is using their weapon, just without a learned form.

> **`evasion_based_defense.freestyle` — resolved as redundant.** Under the previous design,
> `evasion_based_defense` carried a `freestyle` sub-state for untrained evasion. Under the
> new four-state structure, untrained evasion without a weapon is identical to `freestyle-unarmed`
> — both are instinctive, no-technique defense with no weapon context. The distinction is
> redundant; untrained evasion is represented by `freestyle-unarmed`.

#### `commitment` sub-states

| Sub-state | Notes |
|---|---|
| `normal` | Initial. No defensive commitment made. |
| `defensiveSacrifice` | Combatant gave up an offensive action to commit fully to defense; grants a bonus. Bonus effect is **plugin-defined**. |

> **Note on `stance`**: Previously listed as a top-level primitive. Its role may be
> absorbed by `offense_mode` and `defensive_status`. Final placement TBD.

### Machine top-level structure

```
critter machine (parallel)
  ├── life_state
  ├── resource_pool_group
  ├── accumulator_group
  ├── status_tracker
  ├── body_part_group
  ├── slot_manager
  ├── action_economy
  ├── movement_state
  ├── offensive_status (parallel grouping)
  │     ├── offense_mode (compound — exclusive)
  │     │     ├── freestyle-grapple  (initial — no weapon; instinctive grappling; no payload)
  │     │     ├── freestyle-armed    (payload/context: weapon ID)
  │     │     └── honed-war-form     (payload/context: weapon ID + package ID + profile ID)
  │     └── carried_weapon_group (see weapon state hierarchy below)
  └── defensive_status (parallel grouping)
        ├── defensive_position (compound — exclusive)
        │     ├── freestyle-unarmed  (initial — no weapon; instinctive defense; no payload)
        │     ├── freestyle-armed    (payload/context: weapon ID)
        │     ├── war-honed-guard    (payload/context: weapon ID + guard package ID + profile ID)
        │     └── war-honed-evasion  (payload/context: evasion package ID + profile ID)
        └── commitment (compound — exclusive)
              ├── normal (initial)
              └── defensiveSacrifice (bonus: plugin-defined)
```

**Primitive enumeration is NOT yet complete.**

---

## Body Part Tiers (YAML-defined, not hardcoded)
```yaml
- name: head
  tiers:
    - name: intact
      initial: true
    - name: grazed
    - name: wounded
      on_enter: [{ apply_condition_effect: impair_perception }]
    - name: critical
      on_enter: [{ apply_condition_effect: confusion }]
    - name: destroyed
      on_enter: [{ apply_condition_effect: death }]
  natural_weapons: []
  exposure_planes: [front, above]
  status_tracker: true
```

---

## Weapon State Hierarchy (carried_weapon_group)

```
empty               — slot has no weapon
stowed              — in pack (no body slots occupied)
holstered           — on body (equipping slots occupied)
in_hand             — held, not in fighting stance (combat slots occupied)
readied (compound)  — in fighting stance (combat slots occupied)
  ├── free                       — in stance, no current exchange
  └── engaged (compound)         — in active combat exchange
        ├── wielding             — baseline, actively attacking/parrying (initial)
        ├── out_of_line          — dislodged, not threatening; must recover
        ├── locked_as_binder     — initiated bind; weapon locked, critter has leverage
        ├── locked_in_bind       — bound by opponent; can't use effectively
        ├── grappled_weapon      — opponent grabbed weapon; they have influence
        ├── grappling_weapon     — using weapon to grapple opponent's weapon
        ├── grappling_opponent   — bodily grappling opponent; entered from close measure
        ├── target_struck        — struck target; weapon recoverable (transient)
        ├── weapon_stuck         — stuck in target; requires recovery action
        └── weapon_clash         — direct weapon-on-weapon collision (transient, disarm risk)
disarmed            — weapon on ground nearby; slot freed; recoverable
```

**Notes:**
- `target_struck` and `weapon_clash` are transient — auto-transition back to `wielding` or `free`
- `weapon_stuck` persists until deliberate recovery action is spent
- `disarmed` = a state (not a transition); weapon on ground, recoverable
- Equipping slots occupied by `holstered`; combat slots occupied by `in_hand` / `readied`
- Weapon slot costs (how many slots a weapon needs) arrive as reference data from outside

### Slot Manager
```yaml
- id: slot_manager
  type: slot_manager
  equipping_slots: 6   # size-dependent, plugin biases can modify
  combat_slots: 2      # critter topology (humanoid = 2 hands)
```

### Weapon Transitions
Not yet designed — deferred until primitive enumeration is complete.

---

## Rules Registry

The Rules Registry is a singleton service compiled from plugin YAML at load time. Actors hold
a registry key (not the registry itself) to keep XState snapshots serializable. The registry
is passed into the critter factory via XState v5's `input` mechanism and is available to all
machine actions and guards.

Critter YAML tags states and transitions with **rule type identifiers**. At runtime, a state
or transition asks the registry for the rule matching its tag and executes it. This is what
connects the critter machine's structural vocabulary to the plugin's game-system formulas.

```yaml
# critter YAML — tagging a transition
- name: wounded
  on_enter:
    - rule_type: body_part_damage_entry
      apply_condition_effect: impair_perception
```

*Full Rules Registry design (DSL pipeline, topological sort, circular reference prevention,
token scope, known rule tags): `plugin-manager-design.md`.*
*Authoritative Critter YAML spec (primitives, machine topology, body parts, weapon states,
Factory design): `critter-registry-design.md`.*

---

## Key Design Decisions
- Factory needs both YAMLs — critter YAML alone is insufficient
- Context uses named keys, not index arrays
- Threshold wiring lives in plugin YAML; critter YAML owns the vocabulary (IDs only)
- TURN_START is an external event — critter machine does not know about turns
- Stance effects on mechanics are plugin YAML territory; machine just tracks active stance
- Natural weapon readiness defaults to `ready`; becomes `disarmed` when host body part is destroyed
- Wager amount lives in critter machine context (not state); wager resource pool and cap are plugin YAML-defined
- Rules Registry design decisions (singleton, key-not-registry, topological sort, auto-detect pipeline stages): `plugin-manager-design.md`

*Plugin YAML ownership decisions (what belongs in plugin vs. critter YAML): `plugin-manager-design.md`.*
*Critter YAML ownership decisions (what belongs in critter vs. plugin YAML): `critter-registry-design.md`.*

---

## Battle Model Integration

TMCritterMaker is concerned with the critter machine only. The broader battle model
(Skirmish, Bout, subscription model, orientation, measure) is documented in
`battle-model-architecture.md`.

### What the critter machine receives from the battle model

The critter machine is a leaf actor. It does not track orientation or measure — those
live in the Bout. It reacts to inbound events:

- **From the Skirmish**: `TURN_START`, round/phase management events
- **From each Bout it participates in**: orientation change events, measure change events,
  attack events carrying approach direction as payload

A combatant in multiple simultaneous Bouts receives events from each Bout independently.

### Test harness — Bout stub

To test measure-dependent and orientation-dependent critter behavior, the TMCritterMaker
test harness includes a **Bout stub** — a simplified Bout actor with manual controls for:
- Setting measure (`close_in` / `mid_reach` / `long_reach` / `far_reach`)
- Setting orientation (`pc_adjacent`, `npc_adjacent`, `elevation`)
- Firing attack events with a chosen approach direction

Single-critter tests that don't involve Bout interaction can be run without the stub.
Skirmish-level testing is not needed for critter building purposes.

---

## Important Open Questions

These must be resolved before or during implementation — they affect architecture.

**OQ-1: DSL scope — whose stats?**
When a formula references `{str}`, it refers to some critter's stat. Damage calculations
need both attacker and defender context simultaneously (e.g. `{attacker.str_mod} - {defender.armor}`).
How is the scope of each token specified in the template, and how does the registry receive
the correct actor instances at execution time? Needs a clear binding convention.

**OQ-2: Multi-actor rule execution and XState system**
XState v5 supports a `system` construct allowing actors to reference and communicate with
other registered actors by ID. This may be the mechanism for providing attacker/defender
context to the rules registry during cross-actor calculations. How actors are annotated
and how the system wires them into rule execution is an open design problem.

**OQ-3: Player/opponent choice interaction and package compatibility**
The player selects an `offense_mode` package before the exchange. If the selected package
is incompatible with what the opponent does, the system reverts the attacker to `naive`.
What constitutes incompatibility? How is it detected and by whom (Bout machine? Rules registry?)?
What does the opponent's defensive choice look like structurally, and how do the two choices
resolve against each other? The full interaction model between attacker package selection and
defender position selection is not yet designed.

*Battle model open questions (Bout disengagement, formation fighting) are tracked in
`battle-model-architecture.md`.*

---

## What Is Left To Cover

### Immediate (before building anything)
- [ ] Complete primitive enumeration — more primitives likely undiscovered
- [ ] Weapon state transitions (permissible paths between states)
- [ ] Explicit declarative YAML vocabulary design (states/events/transitions/actions DSL)
- [ ] PluginContext interface (TypeScript)
- [ ] Resolver design

### Design decisions deferred
- [ ] Ranged weapons — different slot and state model
- [ ] Body part health_model: independent and weighted details
- [ ] Multi-hex critter geometry (large critters)
- [ ] Condition categories: critter-specific vs plugin-only
- [ ] Stance library: which stances exist, defaults, plugin enable/disable
- [ ] Disarmed-by-opponent forced transition mechanics
- [ ] action_economy ↔ carried_weapon_group cost interaction
- [ ] Engagement machine interface (affects events critter machine receives)
- [ ] Wager mechanic context fields: define exact context schema for wager amount, pool reference, and per-exchange resolved state; see `combat-mechanics-and-group-hud.md`
- [ ] Boss flag: how GM flags an NPC as boss (affects wager eligibility) — plugin YAML vs. runtime toggle TBD
- [ ] Guard package and profile design for `war-honed-guard` — ID scheme, profile contents, relationship to weapon type TBD
- [ ] Evasion package and profile design for `war-honed-evasion` — evasion technique IDs (`parryFocus` etc.) are currently informal names; need formal ID scheme and profile structure TBD

### Out of scope for TMCritterMaker
- [ ] AI behavior state machines — separate project
- [ ] Skirmish and Bout full design — see `battle-model-architecture.md`
