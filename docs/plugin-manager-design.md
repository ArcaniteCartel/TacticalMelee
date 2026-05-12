# Plugin Manager — Design Reference
*Started: 2026-05-10*

---

## Purpose

This document is the authoritative design reference for the TacticalMelee **PluginManager**
and the plugin YAML format it processes. PluginManager is the contained sub-system within
BattleEngine that is the sole interface between BattleEngine and all game-system-specific
configuration. Nothing in BattleEngine reads plugin YAML content directly — all game-system
interaction passes through PluginManager via rule tags.

A plugin YAML file configures a specific game system on top of the TacticalMelee engine — it
defines the rules, formulas, creature types, conditions, thresholds, and resource configuration
that make the engine behave like a particular RPG. The engine is game-system-neutral; the plugin
makes it concrete.

*See also: `battle-model-architecture.md` for the BattleEngine ownership model and PluginManager
interface. See `critter-registry-design.md` for the CritterRegistry, the machine-level critter
counterpart to PluginManager's CreatureMappingRegistry. See `tmcrittermaker-design-state.md`
for how the plugin YAML feeds into the critter factory pipeline. See `system-architecture.md`
for the current `ActivePlugin.ts` implementation (hardcoded; PluginManager is the planned
replacement).*

---

## Three Roles of PluginManager

**Role 1 — Game system configuration**
Defines the rules, DSL formulas, condition effects, thresholds, and resource pools that govern
how combat is resolved. This is the "physics" of the game system.

**Role 2 — Creature-to-critter mapping** *(CreatureMappingRegistry)*
Maps game-world creature names (dwarf, elf, hill giant) to machine-level critter class IDs and
stat biases. The CreatureMappingRegistry is PluginManager's counterpart to the BattleEngine's
CritterRegistry — it bridges the game designer's vocabulary to the machine infrastructure.

**Role 3 — Resolver and PluginContext production**
Validates that every ID referenced in the critter YAML (threshold IDs, condition effect IDs,
rule type tags) is defined in plugin YAML, compiles rules into the Rules Registry, and produces
a `PluginContext` object for the Factory.

---

## Relationship to Other Components

### PluginManager within BattleEngine

```
BattleEngine
  ├── PluginManager
  │     ├── Rules Registry          ← compiled DSL rules (topologically sorted)
  │     ├── CreatureMappingRegistry ← game-world creature → critter class mapping
  │     └── Resolver                ← validates YAMLs, produces PluginContext
  ├── CritterRegistry               ← machine-level critter infrastructure
  └── ...
```

*Full BattleEngine ownership diagram: `battle-model-architecture.md`.*
*CritterRegistry design: `critter-registry-design.md`.*

### Critter Instantiation Pipeline

```
Plugin YAML + Critter YAML
        ↓
    [ Resolver ] — validates mappings, produces PluginContext
        ↓
    PluginContext
        ↓
    [ Factory ] + Critter YAML + Creature Biases → XState machine config
        ↓
    createMachine(config) → critter actor
```

- **Critter YAML** defines a class blueprint — the structural states, primitives, and vocabulary.
  It owns threshold IDs and condition effect IDs but does not define their values.
- **Plugin YAML** owns the values — threshold mappings, condition effect definitions, stat
  formulas, and the creature types that instantiate the class with biases.
- **Resolver** validates that every ID referenced in the critter YAML is defined in the plugin
  YAML, and produces a `PluginContext` object for the factory.
- **Factory** uses both YAMLs and the PluginContext to generate the XState machine config.

*Full factory pipeline: `tmcrittermaker-design-state.md`. Full critter YAML spec:
`critter-registry-design.md`.*

---

## Top-Level YAML Structure

*Draft — sections marked TBD will be filled in as design is confirmed.*

```yaml
plugin_id: standard
version: "1.0"
display_name: "Standard Plugin"

creature_types: []      # Named creature types with critter class references and stat biases
rules: []               # DSL formula rules, registered by rule type ID
condition_effects: {}   # Named condition effects and their mechanical consequences (TBD)
thresholds: {}          # Named threshold definitions and their trigger values (TBD)
wager:                  # Wager mechanic resource configuration
  pool_type: survival   # survival | courage
  global_cap: 0.5       # maximum wager as fraction of remaining pool (default: half)
stages: []              # Stage pipeline definitions (TBD — currently in ActivePlugin.ts)
```

---

## CreatureMappingRegistry

The `CreatureMappingRegistry` is PluginManager's sub-component for mapping game-world creature
names to machine-level critter infrastructure. It is the plugin-side counterpart to the
`CritterRegistry` in BattleEngine.

### Three Abstraction Levels

| Level | Owned by | Examples | Role |
|---|---|---|---|
| **Critter** | CritterRegistry (BattleEngine) | `humanoid`, `giant_kind` | Machine class blueprint, YAML parser, Factory |
| **Creature** | CreatureMappingRegistry (PluginManager) | `dwarf`, `elf`, `hill_giant`, `goblin` | Game-world name, class reference, stat biases |
| **Combatant** | Battle model (Bout, Skirmish) | PC, NPC, Boss NPC | Role as a participant in the battle system |

- **Critter** is the machine-level class blueprint. The CritterRegistry owns the YAML parser,
  the factory, and the machine topology. It knows nothing about game-world identity.
- **Creature** is the game-world named type. The CreatureMappingRegistry knows that a `dwarf` is
  an instance of the `humanoid` critter class with specific stat biases. Game designers define
  creatures; the CreatureMappingRegistry resolves them to critter class IDs at load time.
- **Combatant** is the battle-model role — a running Critter Actor participating in a Skirmish
  and Bouts as a named participant.

### Creature Type YAML Structure

```yaml
creature_types:
  - name: dwarf
    class: humanoid
    biases: { size: -0.2, str: +2, con: +2, cha: -1 }
  - name: elf
    class: humanoid
    biases: { dex: +2, int: +1, con: -1 }
  - name: hill_giant
    class: giant_kind
    biases: { size: +1.5, str: +6, con: +4, int: -2 }
```

- `name` — the game-world creature name
- `class` — the CritterRegistry critter class ID to instantiate
- `biases` — signed stat deltas applied at instantiation time
- Biases shift stat formulas and pool maxima; they do not change the machine topology
- Machine topology (states, transitions, primitive structure) is shared across all creature types
  of a given critter class — only numeric values shift

### Stat Type Taxonomy (Open Design Question)

The CreatureMappingRegistry owns the link between creature stat names and critter-level primitive
types (e.g., "strength is an `accumulator_group` slot in the `humanoid` class"). The precise
ownership of the stat type taxonomy — who declares that `strength` is an accumulator, and where
that declaration lives — is an open design question. See CR-OQ-1 in `critter-registry-design.md`.

*Factory receives creature biases and resolved stat definitions via PluginContext at actor
creation. See `critter-registry-design.md` for the full CritterRegistry and Factory design.*

---

## Rules Registry and DSL

### Overview

When plugin YAML is ingested, every rule is compiled into a **Rules Registry** — a singleton
service. The registry is not stored in actor context; actors hold a registry key, keeping XState
snapshots serializable. The registry is passed into the critter factory and made available to all
machine actions and guards via XState v5's `input` mechanism at actor creation.

Each rule is a named, typed unit with declared inputs, declared returns, and a structured body.
The body is executed by a **custom execution engine** that handles flow control constructs
(`if/then/else`, `while`, `for`) and dispatches individual statements to the appropriate
**evaluator** (`dice`, `mathjs`, or future additions). This engine replaces the old flat
three-stage pipeline for all but the simplest single-expression rules.

---

### Rule Structure

A rule in plugin YAML has the following anatomy:

```yaml
rules:
  - id: bypass_damage             # unique identifier; also serves as the dispatch tag
    inputs:
      - { name: str_mod,     type: integer }
      - { name: is_armored,  type: boolean }
      - { name: armor_value, type: integer }
    returns:
      - { name: damage, type: integer }
    body:
      - if:
          condition: { eval: mathjs, expr: "is_armored == false" }
          then:
            - assign: { name: damage, eval: dice,   expr: "2d6 + {str_mod}" }
          else:
            - assign: { name: damage, eval: mathjs, expr: "max(0, str_mod - armor_value)" }
```

- `id` — uniquely identifies the rule within the registry; also used as the critter YAML dispatch
  tag when a state or transition references this rule by name
- `inputs` — explicitly declared inputs bound by name at call time; types are `integer`, `float`,
  `boolean`, `string`. Shorthand: `inputs: [reach_a, inertia_a, dex_a]` (all integer)
- `returns` — declared output variables; the execution engine reads these from the final body scope
- `body` — ordered list of statements executed by the custom engine

---

### Body Statements

#### `assign`

Evaluates an expression and binds the result to a local variable.

```yaml
- assign: { name: reaction_a, eval: mathjs, expr: "reach_a * 2 + (4 - inertia_a) + dex_a" }
- assign: { name: roll,       eval: dice,   expr: "2d6 + {str_mod}" }
```

The `eval` field selects the evaluator. See **Evaluators** below.

#### `if / then / else`

Branches on a condition. `else` is optional.

```yaml
- if:
    condition: { eval: mathjs, expr: "armor_value > 0" }
    then:
      - assign: { name: damage, eval: mathjs, expr: "max(0, base - armor_value)" }
    else:
      - assign: { name: damage, eval: dice, expr: "2d6 + {str_mod}" }
```

#### `while`

Repeats the body while the condition holds. Intended for bounded retry loops; an iteration
guard is enforced by the execution engine (default cap: 100 iterations) to prevent runaway rules.

```yaml
- while:
    condition: { eval: mathjs, expr: "attempts < 3 and success == false" }
    body:
      - assign: { name: roll,    eval: dice,   expr: "1d20" }
      - assign: { name: success, eval: mathjs, expr: "roll >= threshold" }
      - assign: { name: attempts, eval: mathjs, expr: "attempts + 1" }
```

#### `for`

Iterates over a collection token. Intended for looping over structured collections resolved from
actor state (e.g. body parts, inventory slots). The loop variable is bound in the inner scope for
each iteration.

```yaml
- for:
    var: part
    in: { token: "{target.body_parts}" }
    body:
      - call:
          rule: body_part_damage_entry
          args: { target_part: part, str_mod: str_mod }
          out:  { damage: part_damage }
      - assign: { name: total_damage, eval: mathjs, expr: "total_damage + part_damage" }
```

#### `call`

Invokes another rule by id, passing named arguments and capturing named outputs into local
variables. The callee must be declared in the same plugin YAML; the registry enforces this at
load time. See **Sub-rule Calling and Dependency Order** below.

```yaml
- call:
    rule: compute_modifier
    args: { base_stat: str, level: level }
    out:  { modifier: str_mod }
```

---

### Evaluators

#### `dice`

Sends the expression through a dice-notation parser (e.g. `rpg-dice-roller`). Supports standard
RPG notation: `3d6`, `2d20kh1`, `1d100`, `4d6d1+2`. String-template substitution is applied
first, so `{str_mod}` in a dice expression is replaced with its live value before the dice parser
runs.

#### `mathjs`

Sends the expression to `mathjs` for evaluation. mathjs provides its own variable scope and
substitution mechanism: all variables currently in scope (declared inputs + any variables
assigned earlier in the body) are seeded into the mathjs scope and resolved natively. String-
template substitution is still applied first for plugin-level stat tokens not in the local scope.

`mathjs` supports arithmetic, comparison, min/max/clamp and other math functions, and logical
operators (`and`, `or`, `not`). It does not support multi-branch logic — use `if/then/else` for
that. The ternary `?:` operator is available for simple inline conditionals where `if/then/else`
would be verbose.

---

### Condition Syntax

Conditions (used in `if`, `while`) support two syntaxes:

**mathjs expression** — the condition is a mathjs expression that must evaluate to a boolean.
The full mathjs scope is available. Preferred for numeric comparisons and compound conditions.

```yaml
condition: { eval: mathjs, expr: "roll >= threshold and attempts < 3" }
```

**YAML-native operator** — an explicit structural comparison. Useful when the condition is a
simple equality or order check and you prefer not to embed it in a string expression.

```yaml
condition: { op: eq, left: is_armored, right: false }
condition: { op: le, left: armor_value, right: 0 }
condition: { op: gt, left: str_mod, right: 3 }
```

Supported operators: `eq`, `ne`, `lt`, `le`, `gt`, `ge`. Left and right operands may be local
variable names or literal values. The `eval` field is required for mathjs conditions; it is
absent for YAML-native operator conditions.

---

### Token Substitution

Two substitution mechanisms exist and operate at different layers:

**String-template substitution** — applied before any evaluator runs. Replaces `{token}` syntax
with live values resolved from actor state. Used for plugin-level stats and context values that
are not explicit inputs to the rule — e.g. `{str}`, `{target.armor}`, `{attacker.str_mod}`,
`{combatant.level}`. These tokens are known to the plugin (and the plugin knows how to map them
to the correct actor's state) but are not passed as named inputs because they are ambient facts
the plugin always has access to.

The Bout engine — and any other caller — passes actor references into the registry call. The
plugin resolves stat tokens to values using those references before the expression string reaches
the evaluator.

**mathjs scope substitution** — mathjs seeds its scope from the rule's local variable environment
(declared inputs + variables assigned earlier in the body). References to local variables inside
a mathjs expression are resolved by mathjs directly without needing `{...}` syntax. Both
mechanisms can coexist in a single expression:

```yaml
# {str_mod} resolved by string-template (plugin-level stat, not an input)
# armor_value resolved by mathjs scope (explicit input, in local scope)
- assign: { name: damage, eval: mathjs, expr: "max(0, {str_mod} - armor_value)" }
```

*Token scope binding convention: TBD — see OQ-1 and OQ-2 in `tmcrittermaker-design-state.md`.*

---

### Sub-rule Calling and Dependency Order

Rules may call other rules via `call` statements. The registry resolves the full call graph at
load time:

- **Inter-rule cycles** (rule A calls rule B which calls rule A) are detected by topological
  sort and reported as load-time errors. Order of declaration in plugin YAML does not matter.
- **Intra-rule variable ordering** — within a single rule body, `assign` statements execute in
  declaration order. A variable must be assigned before it can be referenced in a later statement.
  The execution engine enforces this; forward references to un-assigned variables are a load-time
  error.
- **`call` outputs** are injected into the calling rule's local scope under the names declared in
  the `out` map, and are available to subsequent statements.

---

### Rule Type Dispatching

Plugin YAML registers rules by `id`. Critter YAML tags states and transitions with rule type
identifiers that match these ids. At runtime, a state or transition asks the registry for the
rule matching its tag and executes it with the provided arguments. This keeps the critter YAML
tag vocabulary stable even as the plugin swaps in different rules.

```yaml
# critter YAML — tagging a transition with a rule type id
- name: wounded
  on_enter:
    - rule_type: body_part_damage_entry
      apply_condition_effect: impair_perception

# plugin YAML — the rule with that id
rules:
  - id: body_part_damage_entry
    inputs:
      - { name: str_mod,    type: integer }
      - { name: target_part, type: string }
    returns:
      - { name: damage, type: integer }
    body:
      - assign: { name: damage, eval: dice, expr: "2d6 + {str_mod}" }
```

---

### Worked Example — Initial Measure Contest

A rule with no branching: pure sequential `assign` statements using `mathjs`.

```yaml
  - id: initial_measure_contest
    inputs: [reach_a, inertia_a, dex_a, reach_b, inertia_b, dex_b]
    returns:
      - { name: score, type: float }
    body:
      - assign: { name: reaction_a, eval: mathjs, expr: "reach_a * 2 + (4 - inertia_a) + dex_a" }
      - assign: { name: reaction_b, eval: mathjs, expr: "reach_b * 2 + (4 - inertia_b) + dex_b" }
      - assign: { name: score,      eval: mathjs,
                  expr: "clamp((reaction_a - reaction_b) / max(reaction_a, reaction_b, 1), -1, 1)" }
```

Inputs are ordinals (reach: 1–5, inertia: 1–3) passed by the Bout engine alongside combatant
`dex_a`/`dex_b` resolved from actor state by the plugin. Score ∈ [-1, 1] is returned to the
Bout engine for probabilistic conversion to a measure enum.

---

### Known Rule Tags

The following rule tags are referenced elsewhere in the design. Definitions are TBD pending
fuller design work.

| Tag | Used by | Description |
|---|---|---|
| `body_part_damage_entry` | critter YAML body_part_group on_enter | Damage amount on entering a body part tier |
| `freestyle_defense_rating` | Bout resolution (Phase 9) | Baseline defense rating for a freestyle defender |
| `deception_detection_rating` | Bout resolution (Phase 9) | Probability freestyle defender detects a deceptive action |
| `initial_measure_contest` | Bout initialization (Phase 0) | Reaction score for opening measure contest; inputs: reach, inertia (ordinals), combatant dex stats |
| `wager_damage_bonus` | Bout resolution (Phase 12) | Bonus damage applied on successful wager |
| `riposte_probability` | Bout resolution (Phase 12) | Probability opponent seizes riposte window |
| `bypass_damage` | Bout resolution (Phase 11) | Damage on armor bypass outcome |
| `deform_damage` | Bout resolution (Phase 11) | Damage on armor deform outcome |
| `glance_damage` | Bout resolution (Phase 11) | Damage on armor glance outcome |

*Full tag vocabulary will grow as combat resolution is designed. See `bout-resolution-decision-tree.md`.*

---

## Condition Effects

*TBD — design not yet started.*

Condition effects are named mechanical consequences that the critter machine can apply.
Critter YAML references condition effect IDs (e.g. `impair_perception`, `confusion`, `death`);
plugin YAML defines what each ID actually does mechanically (stat penalties, state overrides,
pool drains, etc.).

Known IDs referenced in critter YAML body part tier examples:
- `impair_perception` — applied on head: wounded
- `confusion` — applied on head: critical
- `death` — applied on head: destroyed

Condition scope (critter-level vs. body-part-level) and category design are open. See OQ below.

---

## Threshold Vocabulary

*TBD — design not yet started.*

Threshold IDs are declared in critter YAML as vocabulary; plugin YAML maps each ID to a
specific trigger value (e.g. a fraction of a pool's maximum). When the pool crosses the
trigger, the critter machine broadcasts a `POOL_THRESHOLD` event using the named ID.

Design note: threshold wiring lives in plugin YAML; critter YAML owns only the vocabulary
(the named IDs). This keeps the critter class blueprint game-system-neutral.

---

## Wager Configuration

The wager mechanic requires two plugin-level configuration values that apply globally across
all wager-eligible exchanges. These are not per-package — they are set once in the plugin YAML
and apply to all honed-war-form exchanges in the session.

```yaml
wager:
  pool_type: survival   # survival | courage
  global_cap: 0.5       # maximum wager as fraction of remaining pool (default: 0.5)
```

- `pool_type` — which resource pool backs the wager. `survival` = hit points or equivalent
  (existentially costly). `courage` = a separate morale/courage pool (lower existential stakes,
  different tactical flavor). The pool identity is defined in the plugin; the critter machine
  holds a reference to it via `pc.wager_pool_ref`.
- `global_cap` — the maximum wager a combatant may place as a fraction of their current pool.
  The per-package `wager_allowance` tier (none/small/medium/large) may further cap this below
  the global ceiling. Effective cap = min(global_cap × pool_current, allowance_cap × pool_current).

Per-package wager behavior (wager_allowance, wager_balance, wager_riposte, commitment_scaling)
is defined in the WPP profiles in the Pattern Library, not in plugin YAML.

*Full wager mechanic spec: `combat-mechanics-and-group-hud.md`.*

---

## Stage Pipeline

*TBD — currently implemented as hardcoded TypeScript in `ActivePlugin.ts`.*

The stage pipeline defines how a combat round is structured: which stages exist, their beat
costs, their types, and their ordering. In the current implementation this is hardcoded in
`src/main/plugins/ActivePlugin.ts`. The future design moves this into plugin YAML so that
different game systems can define different round structures.

*See `system-architecture.md` (ActivePlugin section) and `beat-mechanics-and-battle-ledger.md`
for the current implementation. Plugin YAML design for stages is deferred until the
ActivePlugin refactor is scoped.*

---

## PluginContext Interface

*TBD — TypeScript interface not yet defined.*

`PluginContext` is the normalized, validated representation of plugin YAML data that the
critter factory consumes. It is produced by the Resolver from a (plugin YAML, critter YAML)
pair. The same interface is used in both TMCritterMaker (via the Resolver directly) and in
the main TacticalMelee app (via an `ActivePlugin` adapter that produces PluginContext from
the current hardcoded implementation).

Known contents (inferred from factory requirements):
- Critter type definitions with resolved biases
- Compiled Rules Registry (or a reference to it)
- Condition effect definitions
- Threshold mappings
- Wager configuration (pool type, global cap)
- Action economy values (actions per turn, reactions per turn)
- Slot manager configuration (equipping slots, combat slots)

---

## Resolver Design

*TBD — design not yet started.*

The Resolver takes a raw plugin YAML and a critter YAML and:
1. Validates that every ID referenced in the critter YAML (threshold IDs, condition effect IDs,
   rule type tags) is defined in the plugin YAML
2. Compiles rules into the Rules Registry (topological sort, DSL pipeline detection)
3. Resolves critter type biases against class baseline stats
4. Produces a validated `PluginContext` object

Error reporting: cycles in rule dependencies, undefined IDs, and type mismatches should all
produce actionable error messages with the offending YAML key and line number.

---

## Key Design Decisions

- **Plugin YAML owns values; critter YAML owns vocabulary.** Threshold IDs, condition effect IDs,
  and rule type tags are declared in critter YAML. Their definitions (what a threshold triggers,
  what a condition does, what formula a rule uses) live in plugin YAML. This keeps critter class
  blueprints game-system-neutral.
- **Creature types live in PluginManager (CreatureMappingRegistry); critter class blueprints
  live in BattleEngine (CritterRegistry).** This separation keeps game-world vocabulary (dwarf,
  elf, goblin) out of the machine infrastructure. The critter machine doesn't know it's a dwarf —
  it knows it's a `humanoid` running with certain numeric values. A game designer defines creatures
  in plugin YAML; the machine is game-system-neutral.
- **Factory requires both YAMLs.** Critter YAML alone is insufficient to produce a machine config.
  The factory always receives both a critter YAML and a PluginContext derived from plugin YAML.
- **Rules registry is a singleton service.** Actors hold a registry key, not the registry itself,
  keeping XState snapshots serializable and diffable.
- **Rules have structured bodies, not single-line formulas.** Each rule declares explicit inputs,
  declared returns, and a body of typed statements. This supports multi-step computations,
  branching, looping, and sub-rule calls within a single rule — none of which are possible
  with a flat expression string.
- **A custom execution engine handles flow control.** `if/then/else`, `while`, and `for`
  constructs are handled by the engine, not by any individual evaluator. Individual evaluators
  (`dice`, `mathjs`) handle expression evaluation only.
- **Conditions support two syntaxes.** A condition may be a mathjs expression string (flexible,
  compound) or a YAML-native comparison operator (`eq`, `le`, `gt`, etc.) — the author chooses
  based on readability. The `eval` field distinguishes them.
- **Token substitution has two layers.** String-template substitution (`{token}`) handles
  plugin-level stats and actor-state values not passed as explicit inputs. mathjs scope
  substitution handles explicit inputs and locally-assigned variables. Both can appear in the
  same expression.
- **Inter-rule call cycles are caught at load time.** The registry performs topological sort
  over the full call graph on ingestion. Intra-rule variable ordering is also validated — a
  variable must be assigned before it is referenced in a subsequent statement.
- **Wager global cap and pool type are plugin-level.** Per-package wager behavior is in WPP
  profiles. The two layers are distinct and do not duplicate each other.
- **Stage pipeline is currently hardcoded.** Moving stages into plugin YAML is deferred — it
  requires an ActivePlugin refactor and is not needed for the critter machine work.

---

## Open Questions

**PY-OQ-1: Condition effect schema**
What is the full structure of a condition effect definition in plugin YAML? What mechanical
actions can a condition effect perform (stat penalty, pool drain, state override, event
broadcast)? Are some categories critter-specific and others engine-level?

**PY-OQ-2: Threshold trigger value schema**
How is a threshold value expressed? As a fixed number? A fraction of pool maximum? An
expression? Can a threshold trigger in both directions (crossing down AND up)?

**PY-OQ-3: Stat and token namespace**
What is the full vocabulary of substitution tokens available in DSL formulas? What are the
naming conventions for combatant stats, body part states, pool values, and context values?
Which tokens are engine-reserved vs. plugin-defined?

**PY-OQ-4: Multiple plugin support**
Will TacticalMelee ever load more than one plugin simultaneously (e.g. a base plugin + an
expansion)? If so, how are conflicting rule type IDs resolved?

**PY-OQ-5: PluginContext serialization**
Does PluginContext need to be serializable (e.g. for save/restore or IPC transport), or is it
only ever a runtime object? This affects whether the compiled Rules Registry can live inside
PluginContext or must be referenced externally.

---

*See also: `critter-registry-design.md` · `tmcrittermaker-design-state.md` ·
`battle-model-architecture.md` · `bout-resolution-decision-tree.md` ·
`combat-mechanics-and-group-hud.md` · `system-architecture.md`*
