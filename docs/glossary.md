# TacticalMelee Glossary
*Started: 2026-05-10 — Living reference. Add terms as design is confirmed; mark provisional
items explicitly.*

---

## Conventions

- **Code form** (e.g., `honed-war-form`) — the identifier as it appears in YAML or TypeScript.
- *Older variant* — a term that has been superseded but may still appear in earlier documents.
- *Provisional* — values or details not yet finalized in design.
- *Specialized quirk term* — a term used in a non-obvious or counterintuitive way in this project.
- **See also** links point to related entries within this document.
- *Under umbrella term* notes indicate where a specific term is also cross-referenced under a
  broader concept.

---

## A

**Actor**
*Variants: critter actor, bout actor, skirmish actor*

An instance of an XState state machine running as a live, autonomous process. TacticalMelee
uses actors for every major entity: Skirmish, Bout, Geomancer, and each Combatant. Actors
communicate via events and can be spawned, inspected, and snapshotted independently. "Actor"
is the XState v5 term for what v4 called a "service."

*See also: Machine, XState, Critter Actor*

---

**ActivePlugin**

The current hardcoded TypeScript implementation (`src/main/plugins/ActivePlugin.ts`) that
provides plugin configuration to the TacticalMelee engine. Acts as a stand-in for proper Plugin
YAML loading, which is planned but not yet implemented. The `ActivePlugin` produces a
PluginContext from hardcoded values. When BattleEngine is introduced, `ActivePlugin` will be
replaced by PluginManager.

*See also: Plugin YAML, PluginContext, PluginManager*

---

## B

**Battle Ledger**
*Also: Battle Log (partial synonym — see note)*

The persistent record of all combat activity in a Skirmish session. The Ledger is the broader
concept: it owns and encompasses the Battle Log, and may include structured data beyond the
log's narrative entries (round summaries, resource snapshots, stat deltas). "Battle Log" and
"Battle Ledger" are sometimes used interchangeably in casual usage; when precision matters, the
Ledger is the container and the Log is the chronological text record within it.

*See also: Battle Log, Skirmish, Bout Card*

---

**Battle Log**

The chronological, human-readable narrative record of exchanges and events during a Skirmish.
Owned by and part of the Battle Ledger. Bout Cards are archived to the Battle Log after their
hold period expires.

*See also: Battle Ledger, Bout Card*

---

**Beat**

The atomic time unit of the combat round. Actions, stages, and reactions are costed in Beats.
A stage consumes a defined number of Beats; combatants may have a fixed Beat budget per round.
The exact Beat economy (beats per round, costs per action type) is defined in the Plugin YAML
stage pipeline.

*See also: Stage, Round*

---

**BattleEngine**
*Also: Combat Engine · Battle Manager · Combat Manager (all appear in informal discussion; BattleEngine is the official term)*

The single runtime class (`src/main/battle/BattleEngine.ts`) that encapsulates all
battle-related state and subsystems. The main process coordinator (`index.ts`) creates one
`BattleEngine` instance and subscribes to it via an observable callback interface —
`index.ts` holds no direct references to actors or sub-components inside it. BattleEngine
owns: the Skirmish actor (and through it all combat actors), the BattleLedger, the
PluginManager, the WeaponRegistry, and the CritterRegistry.

*Intended design — not yet implemented. To be introduced when the Skirmish actor is first built.*

*See also: PluginManager, WeaponRegistry, CritterRegistry, Battle Ledger, Skirmish*
*Design reference: `battle-model-architecture.md`*

---

**Body Part Group**

A parallel region within a Critter Machine representing a distinct anatomical zone (e.g., head,
torso, left arm). All body part groups run concurrently — a combatant's head can be wounded
while their torso remains healthy. Body part groups are declared in Critter YAML as parallel
states.

*See also: Body Part Tier, Parallel State, Critter Machine*

---

**Body Part Tier**

One of the damage escalation states within a Body Part Group. Typically: healthy → wounded →
critical → destroyed (or equivalent game-system-specific labels). As a body part receives
damage, its tier advances. Entering a tier may trigger a Condition Effect (e.g., entering
head:critical triggers `confusion`). Tiers are defined in Critter YAML; tier entry rules and
condition effects are defined in Plugin YAML.

*See also: Body Part Group, Condition Effect*

---

**Boss NPC**

An NPC flagged at runtime (or in plugin configuration) as a boss-tier combatant. Boss NPCs
have access to the Wager mechanic, which regular NPCs do not. A wagering boss signals
escalation to the players and makes the exchange feel meaningfully different.

*See also: NPC, Wager*

---

**Bout**
*Older variant: Exchange*

The fundamental unit of one-on-one combat. A Bout is formed when one combatant declares to
engage another in hostilities. It exists as a live Actor, manages the declaration-and-resolution
cycle between exactly two combatants, and persists until the engagement ends. A single combatant
can participate in multiple simultaneous Bouts (e.g., a PC fighting two opponents at once).
"Exchange" is the older term for Bout and may appear in earlier documents.

*See also: Bout Formation, Exchange, Skirmish*

---

**Bout Card**

The visual representation of a single Bout in the Group HUD's central area. Displays both
combatants side by side, their declarations (face-down during the Declaration Window, revealed
simultaneously on resolution), and the full resolution outcome (damage, riposte, wager result)
in a resolution strip spanning the full card width. Archived to the Battle Log after a hold
period.

*See also: Group HUD, Battle Log, Declaration Window*

---

**Bout Formation**

The event that creates a Bout actor. Triggered via one of two paths: (1) a **ranged
declaration** — a combatant declares a ranged attack against a target; hex distance is read
from the Geomancer to initialize the Bout's measure directly; (2) a **melee closure** — a
combatant declares to close with an opponent; the Initial Measure Contest algorithm
probabilistically determines the opening measure.

*See also: Bout, Measure, Initial Measure Contest, Geomancer*

---

## C

**Combatant**

The battle-model role of a running Critter Actor that is participating in a Skirmish and one or
more Bouts as a named participant. "Combatant" is the vocabulary of the Bout and Skirmish layers
— the same entity is called a "Critter" when discussing its machine structure and a "Creature"
when discussing its game-world identity. The Bout and Skirmish do not use the terms "Critter" or
"Creature" internally — they operate on Combatant references.

*See also: Critter, Creature, Bout, Skirmish, CritterRegistry*

---

**Commitment Scaling**
*WPP field: `commitment_scaling`*

Per-package field in the WPP profile that controls how steeply wager exposure scales with the
wager amount. Values: `low`, `medium`, `high`. A `high` commitment_scaling means a large wager
creates dramatically higher riposte risk than a small wager on the same package.

*See also: Wager, WPP, Riposte*

---

**Compound State**

An XState state that contains child states, where exactly one child is active at any given time.
Models exclusive alternatives — a combatant is either standing, prone, or grappled, not multiple
at once. Contrast with Parallel State.

*See also: Parallel State, XState, Primitive State*

---

**Condition Effect**

A named mechanical consequence that the Critter Machine can apply when a threshold is crossed
or a body part tier is entered. Defined in Plugin YAML; referenced by ID in Critter YAML.
Examples: `impair_perception` (head:wounded), `confusion` (head:critical), `death`
(head:destroyed). Full schema for condition effects — what mechanical actions they can perform
(stat penalty, pool drain, state override, event broadcast) — is TBD.

*See also: Body Part Tier, Threshold, Plugin YAML*

---

**Creature**

A game-world named type defined in plugin YAML and owned by the `CreatureMappingRegistry`.
Examples: dwarf, elf, hill giant, goblin. A Creature is a named instantiation of a Critter
class with a specific set of stat biases — it is the game designer's vocabulary for populating
the world, as distinct from the machine-level class blueprint.

*See also: Critter, Combatant, CreatureMappingRegistry, CritterRegistry*

---

**CreatureMappingRegistry**

PluginManager's sub-component for mapping game-world creature names (dwarf, elf, goblin) to
machine-level critter class IDs, stat biases, and stat definitions. The game-world identity
layer that is the counterpart to BattleEngine's CritterRegistry.

CreatureMappingRegistry is populated from the `creature_types` section of plugin YAML. At
actor creation time, it provides the Factory with the creature biases and resolved stat
definitions that flesh out a critter class blueprint into a specific Creature type. The critter
machine itself does not know it is a dwarf — it knows it is a `humanoid` class machine running
with the numeric values the CreatureMappingRegistry provided.

*Intended design — not yet implemented.*

*See also: CritterRegistry, PluginManager, Critter, Creature, Combatant, Factory*
*Design reference: `plugin-manager-design.md`*

---

**Critter**
*Specialized quirk term*

The machine-level class identity for any combatant entity in TacticalMelee — including player
characters, NPCs, monsters, and bosses. All combatant types share the same machine topology and
factory pipeline; a PC is a critter. "Critter" specifically refers to the class blueprint level
(`humanoid`, `giant_kind`) owned by the CritterRegistry — distinct from **Creature** (the
game-world named type in PluginManager) and **Combatant** (the battle-model role in the Bout and
Skirmish layers). This three-level distinction is intentional: "critter" signals that the engine
makes no structural distinction between combatant types at the machine level.

*See also: Creature, Combatant, Critter Machine, Critter Actor, Critter YAML, CritterRegistry*

---

**Critter Actor**

A live, running instance of a Critter Machine — i.e., a specific combatant in a specific combat
session. The actor holds the combatant's runtime state (current hit points, body part tiers,
active conditions) and responds to events from the Bout and Skirmish actors. Multiple Critter
Actors may be instantiated from the same Critter Machine definition.

*See also: Critter, Critter Machine, Actor*

---

**CritterRegistry**

The sub-component of BattleEngine that owns all machine-level critter infrastructure: Critter
YAML files, the YAML parser, the Critter Factory, and the in-memory index of parsed critter class
definitions. Distinct from the `CreatureMappingRegistry` in PluginManager — CritterRegistry is
the infrastructure layer (nuts and bolts of machine structure and instantiation); the
CreatureMappingRegistry is the identity layer (game-world names, biases, stat definitions).

Loaded at BattleEngine startup from engine-data Critter YAML files. No database used — data is
static, read-only, and small.

*Intended design — not yet implemented.*

*See also: CreatureMappingRegistry, PluginManager, Factory, Critter, BattleEngine*
*Design reference: `critter-registry-design.md`*

---

**Critter Machine**

The XState state machine definition for a combatant. Describes the full topology of states
(body part groups, primitive states, conditions) and transitions for a critter class (e.g.,
humanoid, giant_kind). The machine topology is shared across all critter types of a given class;
only numeric values shift via Plugin YAML creature biases. Not to be confused with a Critter
Actor, which is a running instance of the machine.

*See also: Critter, Critter Actor, Critter YAML, Factory, CritterRegistry*

---

**Critter YAML**

The YAML file defining a critter class blueprint. Owns the structural vocabulary: state topology,
body part groups, body part tiers, threshold IDs, and condition effect IDs. Does not own the
values behind those IDs — those are Plugin YAML's responsibility. A Critter YAML is
game-system-neutral on its own; it requires a Plugin YAML to be instantiable.

*See also: Plugin YAML, Resolver, Factory, Critter Machine*

---

## D

**Declaration**

A combatant's committed action choice for the current exchange — the specific package and
defensive position they intend to execute. Declarations are submitted during the Declaration
Window and are binding once submitted. For PCs, declarations are made via the player dashboard
UI; for NPCs, they are resolved by the engine.

*See also: Declaration Window, Package, Defensive Position, Bout*

---

**Declaration Window**

The period during which both combatants in a Bout submit their declarations. Closes when both
sides have declared (or on timeout). Preferred behavior (HUD-OQ-1): simultaneous blind reveal —
both sub-cards appear face-down as each side declares, then flip simultaneously when the window
closes.

*See also: Declaration, Bout Card, Group HUD*

---

**Defensive Position**

The defensive stance or posture a combatant declares alongside their attack package. Determines
how they receive and respond to the opponent's action. Valid defensive positions and their
mechanical effects are defined by the game system via Plugin YAML and WPP profiles.

*See also: Declaration, Package, WPP*

---

**DSL**
*Domain Specific Language*

The formula language used in Plugin YAML to express combat calculations. DSL rules have declared
inputs, declared returns, and a structured body of statements. The body is executed by the
Execution Engine, which handles flow control and dispatches individual statements to the
appropriate Evaluator (dice or mathjs). Token substitution resolves live actor-state values into
expressions before evaluation.

*See also: Rules Registry, Evaluator, Execution Engine, Token Substitution*

---

## E

**Evaluator**

The expression evaluation component selected per DSL statement via the `eval` field. Current
evaluators: `dice` (rpg-dice-roller, handles dice notation) and `mathjs` (handles arithmetic
and math functions). Additional evaluators may be added in future. The Execution Engine
dispatches each statement's expression string to the declared evaluator.

*See also: DSL, Execution Engine, rpg-dice-roller, mathjs*

---

**Exchange**
*Older variant of Bout*

The earlier term for a one-on-one combat engagement. Still appears in older documents and some
formula contexts. Current preferred term is Bout. In informal usage, "exchange" may also refer
to a single declaration-and-resolution cycle, but this narrower usage is not yet formally
distinguished.

*See also: Bout*

---

**Execution Engine**

The custom runtime component that interprets the structured body of a DSL rule. Handles flow
control constructs (`if/then/else`, `while`, `for`, `call`) and dispatches individual statements
to Evaluators. Enforces intra-rule variable ordering (a variable must be assigned before it can
be referenced in a later statement) and an iteration cap on `while` loops (default: 100
iterations). Distinct from any individual Evaluator — the engine manages control flow; evaluators
handle expression evaluation.

*See also: DSL, Evaluator, Rules Registry, Sub-rule*

---

## F

**Factory**
*Also: Critter Factory*

The component that takes a Critter YAML and a PluginContext (obtained from PluginManager) and
produces an XState machine configuration (`createMachine(config)`). The factory applies Plugin
YAML creature biases to baseline stats and wires rule type tags to their registry entries. It
produces the machine config; it does not run the machine. Within TacticalMelee, the Factory is a
sub-component of the CritterRegistry within BattleEngine; it is also used independently by
TMCritterMaker in its own process, with the shared implementation living in a common module.

*See also: Critter YAML, PluginContext, PluginManager, Resolver, Critter Machine, CritterRegistry*

---

**Formation**

The spatial arrangement of combatants on the hex grid, managed by the Geomancer actor.
Formation state feeds into Bout initialization (hex distance determines opening measure for
ranged-triggered Bouts) and may influence stage eligibility and movement costs.

*See also: Geomancer, Bout Formation, Measure*

---

**Freestyle**
*Code forms: `freestyle-armed`, `freestyle-grapple`, `freestyle-unarmed`*

An adaptive, unlearned combat mode available to any combatant when they do not (or cannot)
execute a honed-war-form package. Freestyle modes bypass WPP profile requirements. On offense,
freestyle represents improvised armed or grapple action; on defense, it represents reactive
resistance without a learned form. A combatant whose wager exchange falls back from an
incompatible package reverts to `freestyle-armed` or `freestyle-grapple`. The Wager mechanic
is not available in freestyle modes.

*See also: Honed War Form, Package, Wager*

---

## G

**Geomancer**

The Actor responsible for spatial state — hex positions, ranges, facing, and movement. The
Geomancer is consulted at Bout Formation to determine hex distance for ranged-triggered Bouts,
and may influence stage options throughout the Skirmish.

*See also: Formation, Bout Formation, Skirmish*

---

**GenericWeaponPatternParameterCatalogue**
*File: `GenericWeaponPatternParameterCatalogue.yaml` · Abbreviation: GWPPC*

The YAML catalog defining WPP profiles — the parameter sets that govern how a weapon pattern
behaves mechanically (wager_allowance, wager_balance, wager_riposte, commitment_scaling, defense
and hit modifiers, etc.). Each entry is a named profile referenced by attack packages in the
WeaponSpecificTieredPackageCatalogue via `profile_id`. One profile may be shared across multiple
packages and multiple weapon types.

*Under umbrella term: see WPP, Weapon Pattern*
*See also: WeaponSpecificTieredPackageCatalogue, WPP*

---

**Group HUD**

The shared display visible to all players and the GM during a Skirmish. The central area
displays active Bout Cards grouped by PC. Distinct from individual player dashboards — the Group
HUD is designed for table-level visibility, functioning as both a declaration confirmation aid
and a play-by-play narration surface.

*See also: Bout Card, Battle Ledger, Declaration Window*

---

## H

**Honed War Form**
*Code form: `honed-war-form`*

A specific, learned attack package executed with skill and intentionality. Honed war form
packages are drawn from the WeaponSpecificTieredPackageCatalogue and require a linked WPP
profile. Only honed-war-form declarations are eligible for the Wager mechanic (subject to the
package's `wager_allowance`). Contrast with Freestyle modes.

*See also: Package, WPP, Wager, Freestyle, WeaponSpecificTieredPackageCatalogue*

---

## I

**Initial Measure Contest**
*Rule tag: `initial_measure_contest`*

The algorithm that determines the opening Measure of a melee-closure Bout. The Bout engine
passes weapon physical facts (reach and inertia as ordinals from WeaponReferenceData) and
combatant dex stats to the Rules Registry, which evaluates the `initial_measure_contest` rule
and returns a Reaction Score ∈ [-1, 1]. The Bout then converts that score to a Measure enum
value via the Score-to-Measure algorithm. Ranged Bouts do not use this contest — their opening
measure is read from hex distance via the Geomancer.

*See also: Measure, Score-to-Measure, Reaction Score, Bout Formation, Rules Registry,
WeaponReferenceData*

---

## M

**Machine**
*Also: XState Machine, State Machine*

An XState state machine definition. In TacticalMelee, machines are defined by the Factory from
Critter YAML + PluginContext. A Machine is the blueprint; an Actor is the running instance.
XState v5 produces a machine via `createMachine(config)`.

*See also: Actor, Factory, XState, Critter Machine*

---

**mathjs**

The mathematical expression evaluation library used as one of the DSL Evaluators. Provides
arithmetic, comparison, and math functions (`min`, `max`, `clamp`, etc.) with its own variable
scope mechanism. Variables in scope (declared inputs + variables assigned earlier in the rule
body) are seeded into the mathjs scope and resolved natively — no `{...}` syntax required for
locally-scoped values. String-template substitution is still applied first for plugin-level stat
tokens not in the local scope.

*See also: Evaluator, DSL, Token Substitution, string-template*

---

**Measure**

The distance-and-reach relationship between two combatants in a Bout — specifically, how well
each combatant's weapon reach matches the current engagement distance. Measure is an enum stored
in Bout actor context and may evolve during an exchange. The full enum value set is
**provisional**: known values include `very_short`, `short`, `mid_reach`, `long`, `very_long`
(pending design finalization). Each combatant's WPP profile defines an "optimal," "viable," and
"weak" measure position relative to these enum values.

*See also: Initial Measure Contest, Score-to-Measure, Bout Formation, WPP*

---

## N

**NPC**
*Non-Player Character*

Any combatant not controlled by a player. NPCs share the same Critter Machine architecture as
PCs. Regular NPCs cannot wager; Boss NPCs can. NPC declarations are resolved by the engine, not
a player UI.

*See also: PC, Boss NPC, Critter*

---

## P

**Package**
*Also: Attack Package, Defense Package*

A specific, named action that a combatant declares for an exchange. Packages are the vocabulary
of combat choices. Honed-war-form packages are drawn from the WeaponSpecificTieredPackageCatalogue
and linked to WPP profiles; freestyle packages are unlisted and unlinked. Sub-types:

- **Attack package** — the offensive action declared for the exchange (e.g., a longsword thrust,
  a half-swording bind). Code form: `honed-war-form` when a learned technique.
- **Guard package** (`war-honed-guard`) — a skilled, learned defensive form declared for the
  exchange.
- **Evasion package** (`war-honed-evasion`) — a skilled, mobile defensive response.

*Under umbrella term: see WeaponSpecificTieredPackageCatalogue*
*See also: Honed War Form, Freestyle, WPP, WeaponSpecificTieredPackageCatalogue*

---

**Parallel State**

An XState state where all child states are active simultaneously. Used in TacticalMelee for
Body Part Groups — all body parts (head, torso, limbs) run concurrently so each can maintain
its own damage tier independently. Contrast with Compound State.

*See also: Compound State, Body Part Group, XState*

---

**PC**
*Player Character*

A combatant controlled by a human player. PCs have access to the Wager mechanic (subject to
package eligibility) and interact with the engine through the player dashboard UI. At the
machine level, PCs are Critters like any other combatant.

*See also: NPC, Critter, Wager*

---

**Plugin YAML**

The YAML file that configures a specific game system on top of the TacticalMelee engine.
Processed by PluginManager. Defines: DSL rules, creature types with critter class references
and stat biases, condition effects, threshold trigger values, wager configuration, and
(eventually) the stage pipeline. The engine is game-system-neutral; the Plugin YAML makes it
concrete for a specific RPG. Currently replaced by the hardcoded `ActivePlugin.ts`.

*See also: Critter YAML, PluginContext, ActivePlugin, Rules Registry, CreatureMappingRegistry*
*Design reference: `plugin-manager-design.md`*

---

**PluginContext**

The normalized, validated runtime object produced by the Resolver from a Plugin YAML + Critter
YAML pair. Contains: resolved critter type biases, compiled Rules Registry reference, condition
effect definitions, threshold mappings, wager configuration, action economy values, and slot
manager configuration. Consumed by the Factory to generate Critter Machine configs. TypeScript
interface not yet formally defined.

*See also: Plugin YAML, Resolver, Factory, Rules Registry*

---

**PluginManager**

The contained sub-system within BattleEngine that is the **sole interface** between BattleEngine
and all game-system-specific configuration. BattleEngine never reads plugin YAML content directly
— it calls PluginManager exclusively via rule tags (`pluginManager.evaluate(tag, args) → result`).
The rule tag vocabulary is the stable contract between PluginManager and the rest of BattleEngine:
a game designer changes plugin YAML; nothing else in BattleEngine changes.

PluginManager owns: the Resolver, the compiled Rules Registry, the PluginContext, the
CreatureMappingRegistry (game-world creature names → critter class IDs + biases), condition
effect definitions, threshold mappings, and wager configuration. The current stand-in for
PluginManager is `ActivePlugin.ts`.

*Intended design — not yet implemented.*

*See also: ActivePlugin, Plugin YAML, Rules Registry, Resolver, PluginContext, BattleEngine,
Rule Type Tag, CreatureMappingRegistry*
*Design reference: `battle-model-architecture.md` · `plugin-manager-design.md`*

---

**Primitive State**
*Also: Primitive*

A leaf state in a Critter Machine — a state with no child states. Primitives represent atomic,
indivisible conditions (e.g., a specific health tier value, a specific wound state). The full
enumeration of primitives for the standard critter class is not yet complete.

*See also: Compound State, Parallel State, Critter Machine*

---

## R

**Reaction Score**

The numeric value ∈ [-1, 1] returned by the `initial_measure_contest` DSL rule. Positive scores
favor combatant A (the declaring combatant); negative scores favor combatant B; 0 is neutral.
The score is passed to the Score-to-Measure algorithm for probabilistic conversion to a Measure
enum value. The reaction score is an intermediate computation artifact and is not stored in actor
context.

*See also: Initial Measure Contest, Score-to-Measure, Measure*

---

**Resolver**

The component that takes a raw Plugin YAML and a Critter YAML, validates them, and produces a
PluginContext. Validates that every ID referenced in the Critter YAML (threshold IDs, condition
effect IDs, rule type tags) is defined in the Plugin YAML. Compiles rules into the Rules Registry
with topological sort. Not yet implemented; design is TBD.

*See also: PluginContext, Plugin YAML, Rules Registry, Factory*

---

**Riposte**

A probabilistic counterattack that triggers when a wagering combatant's exchange fails — either
directly (the package fails despite compatibility) or after a freestyle fallback. Not guaranteed:
probability is influenced by the opponent's stats and level, and by the wager amount. The
attacker's current Defensive Position does not mitigate riposte — the risk was accepted at wager
time.

*See also: Wager, Wager Riposte, Commitment Scaling, Bout*

---

**Round**

A complete cycle of all combat stages. Divided into Stages; each stage costs a defined number
of Beats. Round structure is currently hardcoded in `ActivePlugin.ts` and will eventually be
defined in Plugin YAML.

*See also: Stage, Beat, Plugin YAML*

---

**rpg-dice-roller**

The dice notation parsing library used as the `dice` Evaluator in the DSL. Supports standard RPG
notation: `3d6`, `2d20kh1` (roll 2d20 keep highest), `1d100`, `4d6d1` (roll 4d6 drop lowest),
etc. String-template substitution is applied to the expression before the parser runs.

*See also: Evaluator, DSL, Token Substitution*

---

**Rules Registry**

The singleton service holding all compiled DSL rules for the active plugin. Produced by the
Resolver at plugin load time. Actors hold a registry key, not the registry itself, keeping
XState snapshots serializable. The registry is passed into the Factory and made available to
all machine actions and guards via XState v5's `input` mechanism. Enforces topological sort
over the inter-rule call graph at load time.

*See also: DSL, Resolver, PluginContext, Rule Type Tag, Topological Sort, Sub-rule*

---

**Rule Type Tag**
*Also: dispatch tag*

The string ID that links a Critter YAML state/transition reference to a specific rule in the
Rules Registry. Critter YAML tags a state's `on_enter` or a transition with a `rule_type`
identifier matching the rule's `id`; the registry dispatches the matching rule at runtime. This
indirection keeps the Critter YAML vocabulary stable even when the plugin swaps in a different
formula.

*See also: Rules Registry, DSL, Critter YAML, Plugin YAML*

---

## S

**Score-to-Measure**

The probabilistic algorithm that converts a numeric Reaction Score ∈ [-1, 1] into a Measure
enum value. Three-step process:

1. Roll d100 vs. (|score| × 100) — if success, the favored combatant gets their **optimal**
   measure.
2. Roll d100 vs. (|score| × 100) — if success, the favored combatant gets their **viable**
   measure.
3. 50/50 — A's **weak** or B's **weak** measure.

A score of exactly 0 skips directly to step 3: "fate refuses to favour either combatant; assigns
the consequence equally." A score of ±1.0 is deterministic (optimal guaranteed); viable peaks
at |score| = 0.5 (P = 25%).

*See also: Measure, Reaction Score, Initial Measure Contest*

---

**Skirmish**

The top-level Actor representing an entire combat session. Manages overall round structure, stage
progression, and the collection of active Bouts. The parent context within which all Bout actors
and Critter actors operate. A Skirmish begins when combat is initiated and ends when all
hostilities are resolved.

*See also: Bout, Stage, Round, Battle Ledger*

---

**Stage**

A named phase within a combat Round, costed in Beats. Stages define the structure of a round —
which actions are available, in what sequence, and at what Beat cost. Currently hardcoded in
`ActivePlugin.ts`; the future Plugin YAML design will allow different game systems to define
different round structures.

*See also: Round, Beat, Plugin YAML, ActivePlugin*

---

**string-template**

The first layer of Token Substitution in the DSL pipeline. Replaces `{token}` syntax in
expression strings with live values resolved from actor state before the string is passed to an
Evaluator. Handles plugin-level stat tokens (e.g., `{str}`, `{attacker.str_mod}`,
`{combatant.level}`) that are ambient facts known to the plugin but not passed as explicit
rule inputs.

*See also: Token Substitution, DSL, Evaluator, mathjs*

---

**Sub-rule**

A DSL rule invoked by another rule via a `call` statement. Sub-rules are declared as ordinary
rules in Plugin YAML and are referenced by `id`. The Execution Engine resolves sub-rule outputs
into the calling rule's local variable scope for use in subsequent statements. The Rules Registry
enforces that no sub-rule call introduces a cycle (inter-rule topological sort at load time).

*See also: Rules Registry, Execution Engine, Topological Sort, DSL*

---

## T

**Threshold**

A named pool-crossing event declared in Critter YAML as vocabulary and given trigger values in
Plugin YAML. When a resource pool (e.g., hit points) crosses a threshold, the Critter Machine
broadcasts a `POOL_THRESHOLD` event using the threshold's named ID, which may trigger state
transitions or condition effects. Trigger value schema (fixed number, fraction of pool maximum,
expression) is TBD (PY-OQ-2).

*See also: Condition Effect, Plugin YAML, Critter YAML*

---

**TMCritterMaker**

A standalone Electron subproject within the TacticalMelee repository. A YAML-driven critter
state machine designer and test harness. Game designers use it to author Critter YAML, preview
the resulting machine topology, and run simulation tests. Uses the same Resolver and Factory
pipeline as the main TacticalMelee app.

*See also: Critter YAML, Resolver, Factory*
*Design reference: `tmcrittermaker-design-state.md`*

---

**Token Substitution**

The replacement of `{token}` placeholders in DSL expression strings with live values before
evaluation. Operates in two layers: (1) **string-template substitution** — applied universally
before any Evaluator runs; resolves plugin-level stat tokens from actor state via the actor
references passed by the Bout engine or other callers; (2) **mathjs scope substitution** —
mathjs seeds its own evaluation scope with all local variables (declared inputs + earlier assigns)
and resolves them natively without `{...}` syntax. Both layers can coexist in a single expression.

*See also: string-template, mathjs, DSL, Evaluator*

---

**Topological Sort**

The algorithm applied by the Rules Registry at load time to establish the correct execution order
for inter-rule dependencies. If rule A calls rule B, B is compiled and available before A runs.
Cycles (rule A → rule B → rule A) are detected and reported as load-time errors. Order of rule
declaration in Plugin YAML is irrelevant — the sort determines the execution order automatically.

*See also: Rules Registry, Sub-rule, DSL*

---

## W

**Wager**

An optional resource commitment a PC (or Boss NPC) may place on a honed-war-form exchange.
Represents psychological commitment to a strategy. A wager of 0 is always valid and risk-free.
A wager > 0 introduces upside (bonus to hit chance or damage, per the package's Wager Balance)
and downside (Riposte risk on failure). Not available in Freestyle modes or on packages with
`wager_allowance: none`. The wager resource pool and global cap are defined in Plugin YAML;
per-package wager behavior is defined in WPP profiles.

*See also: Wager Allowance, Wager Balance, Wager Riposte, Commitment Scaling, Riposte,
Boss NPC, Honed War Form*

---

**Wager Allowance**
*WPP field: `wager_allowance`*

Per-package WPP profile field controlling whether and at what scale a combatant may wager on a
given package. Values: `none` (wagering prohibited), `small`, `medium`, `large`. Sets a
per-package ceiling combined with the plugin-level global cap: effective cap =
min(global_cap × pool_current, allowance_cap × pool_current).

*See also: Wager, WPP, Plugin YAML*

---

**Wager Balance**
*WPP field: `wager_balance`*

Per-package WPP profile field that determines how the wager bonus is distributed between hit
chance and damage. Values: `hitOverDamage` (wager primarily buys success probability),
`damageOverHit` (wager primarily buys damage amplification), `balanced` (split), `remiseOnly`
(wager only empowers a follow-up action if the first step is parried). Profile-determined — the
player cannot override the distribution for a given package.

*See also: Wager, WPP*

---

**Wager Riposte**
*WPP field: `wager_riposte`*

Per-package WPP profile field that determines how the riposte benefit is weighted when a wager
exchange fails. Values: `hitOverDamage`, `damageOverHit`, `balanced`. Distinct from Wager
Balance, which governs the offensive wager benefit; Wager Riposte governs the counterattack
benefit the opponent receives on failure.

*See also: Wager, Riposte, WPP*

---

**WeaponRegistry**

The engine-internal sub-component of BattleEngine that loads all three weapon YAML files at
startup into indexed in-memory structures and serves read-only weapon data to BattleEngine
components. Accessed directly — not mediated by PluginManager — because weapon physical data
(reach, inertia, size, damage type) describes facts about how weapons behave in the world,
independent of any particular game system. Data is held in memory as plain `Map` objects indexed
by id; no database is used (the data is static, read-only, and small).

Distinct from the individual YAML files it loads — WeaponRegistry is the runtime query interface;
the YAMLs are the source data. Query interface:
`getWeaponPhysicalData(weaponId)` · `getPackage(weaponId, tier, packageId)` · `getWppProfile(profileId)`

*Intended design — not yet implemented.*

*Specializations: WeaponReferenceData (physical weapon facts), WeaponSpecificTieredPackageCatalogue
(package catalog), GenericWeaponPatternParameterCatalogue (WPP profiles)*
*See also: WeaponReferenceData, WeaponSpecificTieredPackageCatalogue,
GenericWeaponPatternParameterCatalogue, BattleEngine*
*Design reference: `battle-model-architecture.md`*

---

**Weapon Pattern**
*Also: Weapon Profile (current synonym — see note)*

A named, specific attack or defense technique associated with a weapon type and tier. Weapon
patterns are catalogued in the WeaponSpecificTieredPackageCatalogue and reference a WPP profile
for their mechanical parameters. "Weapon Pattern" and "Weapon Profile" are currently used
interchangeably. Minor variant: "Weapon Profile" may occasionally refer specifically to the
basic physical weapon data (reach, inertia, damage type) that is common across all patterns for
a weapon — this narrower usage appears in WeaponReferenceData context.

*See also: Package, WPP, WeaponSpecificTieredPackageCatalogue, WeaponReferenceData*

---

**WeaponReferenceData**
*File: `yaml/WeaponReferenceData.yaml`*

A YAML catalog of basic physical properties for each weapon type: size, inertia, maneuverability,
reach, damage_primary, damage_secondary. Used by the Bout engine to pass weapon facts (reach and
inertia as ordinals) to the `initial_measure_contest` rule. Properties are consistent across all
packages for a given weapon type (verified across 395 profiles). 18 weapon types currently
defined: dagger, short_sword, longsword, great_sword, shield, war_hammer, hammer, axe,
battle_axe, spear, halberd, bow, longbow, recurve_bow, flail, mace, staff, grapple.

*Under umbrella term: see Weapon Pattern (minor variant — basic weapon physical data)*
*See also: Initial Measure Contest, WeaponSpecificTieredPackageCatalogue*

---

**WeaponSpecificTieredPackageCatalogue**
*File: `WeaponSpecificTieredPackageCatalogue_rich.yaml` · Abbreviation: WSTPC*

The YAML catalog of all honed-war-form attack and defense packages, organized by weapon type
and tier. Each entry names a package and references a WPP profile by `profile_id`. This catalogue
is the source of all declared honed-war-form options during a Bout. Packages are cross-referenced
against WeaponReferenceData for consistency.

*Under umbrella term: see Weapon Pattern, Package*
*See also: GenericWeaponPatternParameterCatalogue, WPP, Honed War Form*

---

**WPP**
*Weapon Pattern Parameter · Also: Weapon Profile Parameter (current synonym)*

The set of mechanical parameters governing how a specific weapon pattern behaves in combat —
wager eligibility, wager bonus distribution, riposte weighting, commitment scaling, and
defense/hit modifiers. WPP data lives in the GenericWeaponPatternParameterCatalogue. Each attack
package in the WeaponSpecificTieredPackageCatalogue references a WPP profile by `profile_id`.

*Specializations: GenericWeaponPatternParameterCatalogue (the profile catalogue),
WeaponSpecificTieredPackageCatalogue (the packages that reference WPP profiles)*
*See also: Weapon Pattern, Wager Allowance, Wager Balance, Wager Riposte, Commitment Scaling*

---

## X

**XState**

The state machine library used throughout TacticalMelee. Version 5 (v5) is in use — architecturally
distinct from v4: actors replace services; `input` replaces context injection at actor creation;
snapshots replace serialized state. All Critter Machines, Bout actors, and Skirmish actors are
XState machines.

*See also: Machine, Actor, Critter Machine*

---

*See also (document-level): `system-architecture.md` · `battle-model-architecture.md` ·
`plugin-manager-design.md` · `critter-registry-design.md` · `tmcrittermaker-design-state.md` ·
`bout-resolution-decision-tree.md` · `combat-mechanics-and-group-hud.md` ·
`beat-mechanics-and-battle-ledger.md`*
