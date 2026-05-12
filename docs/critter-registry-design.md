# Critter Registry — Design Reference
*Started: 2026-05-10*

---

## Purpose

This document is the authoritative design reference for the TacticalMelee **CritterRegistry**
and the Critter YAML format it processes. CritterRegistry is a sub-component of BattleEngine
that owns all machine-level critter infrastructure: the Critter YAML files, the YAML parser,
the Critter Factory, and the in-memory registry of parsed critter class definitions.

*See also: `plugin-manager-design.md` for the PluginManager and its CreatureMappingRegistry
(the game-world creature counterpart to CritterRegistry). See `tmcrittermaker-design-state.md`
for the TMCritterMaker tool that uses the same Factory pipeline in its own Electron process.
See `battle-model-architecture.md` for the BattleEngine ownership model.*

---

## Organizational Principle

### Three Abstraction Levels

| Level | Owned by | Examples | Role |
|---|---|---|---|
| **Critter** | CritterRegistry (BattleEngine) | `humanoid`, `giant_kind` | Machine class blueprint, YAML parser, Factory |
| **Creature** | CreatureMappingRegistry (PluginManager) | `dwarf`, `elf`, `hill_giant`, `goblin` | Game-world name, class reference, stat biases |
| **Combatant** | Battle model (Bout, Skirmish) | PC, NPC, Boss NPC | Role as a participant in the battle system |

**Critter** is the machine-level class blueprint. The CritterRegistry owns the YAML parser, the
factory, and the machine topology. A critter class (`humanoid`, `giant_kind`) knows nothing about
game-world identity — it is pure structural machinery.

**Creature** is the game-world named type. The CreatureMappingRegistry (in PluginManager) knows
that a `dwarf` is an instance of the `humanoid` critter class with specific stat biases. Game
designers define creatures in plugin YAML; the CreatureMappingRegistry resolves them to critter
class IDs at load time. The critter machine doesn't know it's a dwarf — it knows it's a `humanoid`
running with certain numeric values.

**Combatant** is the battle-model role — a running Critter Actor participating in a Skirmish and
Bouts as a named participant. The Bout and Skirmish use "combatant" to refer to participants; the
critter design uses "critter" to refer to the machine structure.

### Relationship to CreatureMappingRegistry

```
BattleEngine
  ├── CritterRegistry              ← machine: class blueprints, YAML parser, Factory
  │     ├── Critter YAML files
  │     ├── YAML parser
  │     └── Critter Factory
  └── PluginManager
        ├── CreatureMappingRegistry ← game-world: creature names, class refs, biases
        └── ...
```

CritterRegistry and CreatureMappingRegistry are counterparts:
- CritterRegistry is the **infrastructure layer** — the nuts and bolts of how a critter machine
  is structured and instantiated. It serves the Factory.
- CreatureMappingRegistry is the **identity layer** — it maps game-world names to that
  infrastructure and provides the biases and stat definitions that flesh out the blueprint.

At actor creation time, the Factory receives:
- A critter YAML (from CritterRegistry) — the structural blueprint
- A PluginContext (from PluginManager via Resolver) — the numeric values, biases, rule tags

---

## What CritterRegistry Owns

- **Critter YAML files** — one per critter class (`humanoid.yaml`, `giant_kind.yaml`, etc.)
- **YAML parser** — parses and validates Critter YAML against the schema defined in this document
- **Critter Factory** — takes a parsed Critter YAML + PluginContext and produces an XState machine config
- **Critter class registry** — in-memory index of parsed critter class definitions, indexed by
  `critter_type` identifier

*CritterRegistry is loaded at BattleEngine startup. No database is used — critter class
definitions are engine data, not runtime-mutable, and small enough for in-memory storage.*

---

## Critter YAML Specification

*This is the authoritative specification. For context on how this feeds into the factory pipeline
and the TMCritterMaker tool, see `tmcrittermaker-design-state.md`.*

### Design Approach: Middle Path

1. **Shorthand primitives** — declare `type: resource_pool_group`; factory supplies all
   baked-in semantics. Concise, opinionated.
2. **Explicit declarative** — escape hatch for new patterns; specify states, events, transitions,
   and actions directly in YAML without touching factory code.

Shorthands expand to explicit form internally. Designers use shorthand when it fits, and drop to
explicit when they need something new. The explicit declarative vocabulary is not yet designed
(see CR-OQ-4).

### Top-Level Structure

```yaml
critter_type: humanoid
version: "1.0"
condition_effects: []    # behavioral categories; plugin YAML maps its conditions here
threshold_vocabulary: [] # named threshold ids; plugin YAML maps its thresholds here
parallel_regions: []     # XState parallel state definitions
```

### Confirmed Primitives

**Note: Primitive enumeration is not yet complete.** The following are confirmed; more may be
needed. See CR-OQ-2.

#### Top-level primitives

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

#### Child primitives under `offensive_status`

| Primitive | Owns | Baked-in semantics |
|---|---|---|
| `offense_mode` | selected attack mode | Compound — exclusive. Three behavioral modes: `freestyle-grapple`, `freestyle-armed`, `honed-war-form`. Mode is set by event; weapon ID, package ID, and profile ID travel in the event payload and are stored in context. |
| `carried_weapon_group` | carried weapon slot states | Full state hierarchy (see Weapon State Hierarchy). State-change events for cost calc. |

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
to `freestyle-armed` (if a weapon is readied) or `freestyle-grapple` (if not). See OQ-3 in
`tmcrittermaker-design-state.md` for compatibility determination mechanics.

#### Child primitives under `defensive_status`

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

Evasion technique IDs (formerly hardcoded sub-states of `evasion_based_defense`) are now
carried as `war-honed-evasion` payload: `parryFocus` · `retreatFocus` · `dodgeFocus` ·
`footworkFocus` · `grappleWeaponFocus` · `beatWeaponFocus` · `distanceKeepingFocus` ·
`measureFocus`. These are now package/profile IDs, not machine states.

> **`freestyle` prefix** — used across both offense and defense modes, it indicates instinctive
> combat without a structured technique or package. The word carries no negative connotation;
> a combatant in `freestyle-armed` is using their weapon, just without a learned form.

#### `commitment` sub-states

| Sub-state | Notes |
|---|---|
| `normal` | Initial. No defensive commitment made. |
| `defensiveSacrifice` | Combatant gave up an offensive action to commit fully to defense; grants a bonus. Bonus effect is **plugin-defined**. |

### Machine Top-Level Structure

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

---

## Body Part Tiers

Body part tiers are YAML-defined, not hardcoded. The Factory expands the tier list into XState
compound states. Each tier may declare `on_enter` effects applied on entering that tier;
`on_enter` condition effect IDs are defined in plugin YAML.

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

## Weapon State Hierarchy

The `carried_weapon_group` primitive models the state of a single carried weapon slot. The
hierarchy applies to each weapon slot independently.

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
  equipping_slots: 6   # size-dependent; creature biases can modify
  combat_slots: 2      # critter topology (humanoid = 2 hands)
```

### Weapon Transitions

Not yet designed — deferred until primitive enumeration is complete (see CR-OQ-2, CR-OQ-3).

---

## Spatial Model

Each critter occupies a **hex prism**. Eight standardized exposure plane labels (fixed enum):

- **Vertical (6):** `front`, `front-left`, `rear-left`, `rear`, `rear-right`, `front-right`
- **Horizontal (2):** `above`, `below`

Body part `exposure_planes[]` in the critter YAML draws from this enum. The Bout machine uses
these same labels for orientation tracking — a body part is only targetable if its declared
plane matches the attacker's current adjacency value in the Bout.

Large critters (dragon) occupy multiple hex prisms joined at faces. Geometry for multi-hex
critters is TBD.

*Full orientation model: `battle-model-architecture.md`.*

---

## Critter Factory

*Design intent — not yet implemented.*

The Critter Factory takes a parsed Critter YAML and a `PluginContext` (from PluginManager's
Resolver) and produces an XState machine configuration (`createMachine(config)`). It:

1. Expands shorthand primitives into their explicit XState state/transition definitions
2. Applies creature biases from PluginContext to baseline stat values
3. Wires rule type tags to their Rules Registry entries
4. Generates the complete `createMachine(config)` input

**Ownership:** The Factory is a sub-component of CritterRegistry within BattleEngine. The same
Factory implementation is used by TMCritterMaker in its own Electron process — the shared
implementation lives in a common module; BattleEngine is the runtime owner within TacticalMelee.

**The Factory does not run the machine.** It produces the config; `createMachine(config)` and
actor creation happen at the BattleEngine level.

---

## Stat Type Taxonomy (Open Design Question — CR-OQ-1)

The CritterRegistry / CreatureMappingRegistry split raises a concrete design question: who
owns the declaration that, for example, `strength` is an `accumulator_group` slot in the
`humanoid` critter class?

**The problem:**
- CritterRegistry knows which primitives exist (`accumulator_group`, `resource_pool_group`, etc.)
- CreatureMappingRegistry knows which stat names a creature has (`str`, `con`, `dex`, etc.)
- The link — "this stat is this type of primitive" — must be declared somewhere

**Candidate locations:**
1. **Critter YAML** — declared at the class level. Stat types are class-specific and
   game-system-neutral. Advantage: keeps stat type declaration close to the machine structure.
2. **Plugin YAML / CreatureMappingRegistry** — declared per game system. Advantage: the same
   critter class could be reused across game systems with different stat type interpretations.
3. **Shared stat type schema** — a third YAML format referenced by both sides.

*Resolution deferred — must be decided before Factory implementation begins.*

---

## Open Questions

**CR-OQ-1: Stat type taxonomy ownership**
Where does the declaration "strength is an accumulator in the humanoid class" live? Options:
Critter YAML (class-level, game-system-neutral), Plugin YAML / CreatureMappingRegistry
(game-system-specific), or a shared stat type schema. Affects Factory design significantly.

**CR-OQ-2: Primitive enumeration completeness**
The confirmed primitive list is not yet complete. More primitives may be needed. The full
enumeration must be finalized before Factory implementation begins.

**CR-OQ-3: Weapon state transitions**
Permissible paths between weapon states (e.g., how does a weapon move from `locked_in_bind`
back to `wielding`?) are not yet designed — deferred until primitive enumeration is complete.

**CR-OQ-4: Explicit declarative YAML vocabulary**
The "middle path" design approach relies on an explicit declarative escape hatch for new
patterns (specifying states, events, transitions, actions directly in YAML). The DSL vocabulary
for this explicit form is not yet designed.

---

*See also: `plugin-manager-design.md` · `tmcrittermaker-design-state.md` ·
`battle-model-architecture.md` · `bout-resolution-decision-tree.md`*
