# Battle Model Architecture
*As of 2026-04-30*

## Terminology Note
From a battle model perspective, participants are referred to as **combatants**.
A combatant is equivalent to a **critter** — the same XState actor, the same machine.
"Critter" is the term used in TMCritterMaker when designing the entity class.
"Combatant" is used here when discussing that entity's role and relationships within
the battle system.

---

## Overview
A TacticalMelee battle is composed of a set of XState actors joined into a common
XState system. The Skirmish is the top-level coordinator. Beneath it, Bouts and
Formations manage pairwise and group engagements. A Geomancer actor manages the
physical geography of the battlefield. All actors subscribe to relevant state changes
from other actors and determine internally what matters.

```
Skirmish actor
  ├── Geomancer actor      — singular; battlefield geography and smart objects
  ├── Bout actor(s)        — one per combatant pair; measure, mutual orientation
  ├── Formation actor(s)   — one per allied group in formation; multi-combatant
  └── Combatant actor(s)   — individual internal state (= critter machine)
```

---

## BattleEngine — Code Organization

*Intended design — not yet implemented. To be introduced when the Skirmish actor is first built.*

All battle-related runtime state and subsystems are encapsulated in a single **`BattleEngine`**
class (`src/main/battle/BattleEngine.ts`). The main process coordinator (`index.ts`) creates
one `BattleEngine` instance and subscribes to it for state change notifications. Neither the
GM Dashboard nor the Group HUD interact with `BattleEngine` directly — they receive pushed
state snapshots from `index.ts` via IPC and WebSocket, as today.

### Observable Interface

`BattleEngine` is an observable. `index.ts` subscribes via callback registration:

```typescript
battleEngine.onStateChange(callback: (snapshot: BattleSnapshot) => void): void
```

`index.ts` holds no references to individual actors or sub-components inside `BattleEngine`.
All inbound commands from the GM Dashboard (IPC messages) are forwarded to `BattleEngine`
via method calls on the instance.

### What BattleEngine Owns

```
BattleEngine
  ├── PluginManager      ← game-system configurability layer (see below)
  ├── WeaponRegistry     ← engine-internal weapon data; accessed directly (see below)
  ├── CritterRegistry    ← machine-level critter infrastructure; Critter YAML, parser, Factory (see below)
  ├── Skirmish actor     ← top-level combat coordinator; owns all subordinate actors
  └── BattleLedger       ← snapshot/log (currently at src/main/battle/BattleLedger.ts)
```

### PluginManager

`PluginManager` is a contained sub-system within `BattleEngine`. It is the **sole interface**
between `BattleEngine` and all game-system-specific configuration. Nothing in `BattleEngine`
reads plugin YAML content directly — it always calls `PluginManager` via rule tags.

**`PluginManager` owns:**
- Plugin YAML loading and processing (Resolver)
- Rules Registry — compiled DSL rules, topologically sorted
- PluginContext — the normalized output consumed by the Critter Factory
- Critter type definitions and biases
- Condition effect definitions
- Threshold mappings
- Wager configuration

**The interface — rule tags:**

```typescript
pluginManager.evaluate(tag: string, args: Record<string, unknown>): unknown
```

The rule tag vocabulary is the stable contract between `PluginManager` and the rest of
`BattleEngine`. A game designer changes plugin YAML; nothing else in `BattleEngine` changes.
The engine is game-system-neutral at runtime — the plugin makes it concrete.

**Who configures what:**

| Layer | Role | Configures |
|---|---|---|
| GMs | Operate the combat tool; manage encounters and sessions | Runtime controls only — not YAML |
| Game designers | Define the game system's mechanical behaviour | Plugin YAML (rules, critter types, conditions, thresholds, wager config) |
| Engine data | Weapon mechanics, critter machine topology | Weapon YAMLs, critter YAMLs — maintained as engine or data-package artifacts |

GMs work within the weapon and critter set the RPG system provides. They do not modify plugin
YAML. Game designers configure how the engine interprets and resolves combat — but not the
internal mechanics of individual weapons.

### WeaponRegistry

`WeaponRegistry` is an engine-internal sub-component of `BattleEngine`, accessed **directly**
by `BattleEngine` components — not mediated by `PluginManager`. The weapon YAMLs describe
physical weapon mechanics: facts about how weapons behave in the world, not game-system
interpretations of them. A longsword's reach and inertia are the same regardless of which
RPG system plugin is loaded.

`WeaponRegistry` loads all three weapon YAMLs at `BattleEngine` startup into indexed
in-memory structures. No database is used — the data is static, read-only, and small enough
for trivial in-memory storage (plain `Map` objects indexed by id).

| YAML file | Indexed by |
|---|---|
| `yaml/WeaponReferenceData.yaml` | weapon type |
| `yaml/WeaponSpecificTieredPackageCatalog_rich.yaml` | weapon type + tier + package_id |
| `yaml/GenericWeaponPatternParameterCatalog_rich.yaml` | profile_id |

**Query interface (read-only):**

```typescript
weaponRegistry.getWeaponPhysicalData(weaponId)        // → reach, inertia, size, maneuverability, damage
weaponRegistry.getPackage(weaponId, tier, packageId)  // → package definition with profile_id
weaponRegistry.getWppProfile(profileId)               // → full WPP profile
```

**Future weapon customization:** Plugin YAML may eventually expose a limited, curated hook for
defining new weapon types as named variants of existing types with bias overrides — analogous
to critter type biases. This is low priority. The full WPP parameter structure will not be
exposed directly to game designers or GMs.

### CritterRegistry

`CritterRegistry` is an engine-internal sub-component of `BattleEngine`. It owns all
machine-level critter infrastructure: Critter YAML files, the YAML parser, and the Critter
Factory. It is the counterpart to PluginManager's `CreatureMappingRegistry`.

**The CritterRegistry / CreatureMappingRegistry split:**

| Layer | Owned by | Vocabulary |
|---|---|---|
| **Critter** (machine class blueprint) | CritterRegistry (BattleEngine) | `humanoid`, `giant_kind` — machine structure |
| **Creature** (game-world named type) | CreatureMappingRegistry (PluginManager) | `dwarf`, `elf`, `goblin` — game-world names + biases |
| **Combatant** (battle-model role) | Bout, Skirmish | PC, NPC, Boss NPC — participant role |

`CritterRegistry` knows nothing about game-world identity — it operates at the level of critter
class blueprints and machine topology. `CreatureMappingRegistry` (in PluginManager) maps
game-world creature names to critter class IDs and provides the stat biases that flesh out
each class at instantiation time.

**`CritterRegistry` owns:**
- Critter YAML files (one per critter class: `humanoid.yaml`, `giant_kind.yaml`, etc.)
- YAML parser — parses and validates Critter YAML against the Critter YAML spec
- Critter Factory — takes a Critter YAML + PluginContext → XState machine config
- In-memory critter class registry — indexed by `critter_type` identifier

**Critter Factory:** Takes a Critter YAML (from CritterRegistry) and a `PluginContext`
(from PluginManager) and produces an XState machine configuration. Used by `BattleEngine`
to instantiate Combatant actors at session start and whenever new combatants enter the
Skirmish. The same Factory implementation is also used by TMCritterMaker in its own Electron
process — the shared implementation lives in a common module; `BattleEngine` is the runtime
owner within TacticalMelee.

*Full CritterRegistry design and Critter YAML spec: `critter-registry-design.md`.*

---

## Skirmish

The top-level actor representing the entire battle.

- Contains all combatants as participants
- Directly subscribes to state changes of combatants not currently in a Bout or Formation
- Creates and tears down Bout actors as combatants engage and disengage
- Creates and tears down Formation actors as allies join together
- When a Bout or Formation is created, Skirmish switches its direct subscription
  from the relevant combatants to the new actor
- Subscribes to state changes of all active Bout, Formation, and Geomancer actors
- Is the current top level — no Battlefield layer above it in scope

> A hypothetical Battlefield layer organizing multiple Skirmishes (e.g. tournament play
> with multiple teams) is out of scope for the foreseeable future.

---

## Geomancer

A singular XState actor representing the physical geography of the Skirmish battlefield.

- One Geomancer per Skirmish
- Owns and manages the battlefield layout — hex grid, terrain, elevations
- Contains **smart objects**: interactive environmental elements such as:
  - Walls (can be knocked down)
  - High ground areas (can grant elevation advantage, may be teleported to)
  - Obstacles, cover, hazardous zones
- Informs the Skirmish about geographical state and local conditions
- Is part of the Skirmish XState system
- Exact design — how smart objects are modelled, how geography informs combat,
  how combatants query or interact with it — is TBD (see OQ-5)

---

## Bout

An actor representing the active engagement between exactly two combatants.

- Always 1v1 — one Bout per combatant pair
- A combatant fighting multiple opponents participates in multiple simultaneous Bouts
- Subscribes to all state changes of both combatants
- Spawned and torn down by the Skirmish actor
- Ends when one combatant dies or successfully disengages (see OQ-3)

> A Formation may potentially serve as one of the two parties in a Bout,
> allowing a group to engage a single combatant or another group as a unit.
> This requires further design (see OQ-6).

### Bout Formation

A Bout is created by the Skirmish when one combatant declares engagement with another.
Two triggers exist:

**Trigger 1 — Ranged declaration**
A combatant targets an opponent from a distance without closing to melee range. The Skirmish
creates the Bout immediately. Initial measure is derived directly from hex distance between
the two combatants at the moment of declaration:

| Hex distance | Initial `bout.measure` |
|---|---|
| 1 (adjacent) | `close_in` |
| 2–3 | `mid_reach` |
| 4–5 | `long_reach` |
| 6+ | `far_reach` |

*Thresholds are design placeholders pending calibration.*

**Trigger 2 — Melee closure**
A combatant moves adjacent to an opponent (or an opponent enters adjacency). Hex adjacency
is binary — but the opening combat measure is not simply `close_in`. A halberd wielder
facing a closing dagger user may be able to keep the opponent at `long_reach` before they
can enter; a very fast, agile combatant may be able to close to `close_in` before a slow
polearm can respond. Initial measure is determined by a **contested opening**.

#### Initial Measure Contest (Melee Closure)

The Bout engine does not inspect combatant stats directly. It passes actor references and
weapon physical facts to the rules registry; the plugin resolves the stat-dependent
calculation; the Bout converts the result to a measure enum.

**Step 1 — Bout engine reads weapon physical facts** for each combatant from weapon reference
data (see *Weapon Physical Facts Source* below):
- `reach` (`range_profile.reach`) — how far the weapon can threaten
- `inertia` (`weapon_size_profile.inertia`) — how quickly the weapon can be brought to bear

**Step 2 — Bout engine calls rules registry:**
```
rules_registry.evaluate(
  'initial_measure_contest',
  {
    combatant_a: actorRef,   combatant_b: actorRef,
    reach_a:     ordinal,    reach_b:     ordinal,
    inertia_a:   ordinal,    inertia_b:   ordinal
  }
)
```
Reach and inertia are passed as ordinal integers so the DSL formula can do arithmetic
(`very_short=1` … `very_long=5`; `low=1`, `medium=2`, `high=3`).

**Step 3 — Plugin resolves the formula.** The plugin knows the stat mappings for the active
game system. Using the actor references, it reads the relevant combatant stats (e.g., reaction
speed, initiative — whatever the game system defines under the `initial_measure_contest` tag)
and passes all resolved values to the DSL evaluator. The Bout engine receives only a numeric
reaction score per combatant.

**Step 4 — Bout engine converts score to measure enum** using a probabilistic algorithm.
The score is a value in `[-1, 1]`. Positive favors combatant A; negative favors combatant B;
zero is neutral. For score < 0, the algorithm is symmetric with A and B swapped.

**Algorithm (score ≥ 0, favoring A):**

1. Roll against `score` as a percentage chance:
   - **Success** → `bout.measure` = A's `measure_profile.optimal` — done.
   - **Failure** → proceed to step 2.
2. Roll again against `score` as a percentage chance:
   - **Success** → `bout.measure` = A's `measure_profile.viable` — done.
   - **Failure** → proceed to step 3.
3. 50/50 roll:
   - **< 50%** → `bout.measure` = A's `measure_profile.weak`
   - **≥ 50%** → `bout.measure` = B's `measure_profile.weak`

**Score = 0** → skip steps 1 and 2; go directly to step 3.

**Properties:**
- Score ±1.0 → deterministic: winning combatant gets their optimal with certainty.
- Viable probability peaks at `|score| = 0.5` (P = 25%).
- When both weapons share the same `measure_profile.weak` value, step 3 always produces
  the same measure — graceful degeneration for identical or very similar weapon profiles.
- When B's `measure_profile.weak` coincides with A's `measure_profile.optimal` (e.g., dagger
  vs. halberd), that measure value is reachable via two paths and will occur more often than
  the viable middle. This is a property of weapon profile geometry, not a bias in the algorithm.

**On the neutral case — design rationale:**

> When the contest returns zero, fate refuses to favor either combatant — so it assigns the
> consequence equally: one of them will open at their weak measure, and the 50/50 roll
> determines who. Whether that assignment helps or hurts each combatant is entirely a function
> of their weapon profiles, not of fate's arbitration. A neutral opening is not a comfortable
> equilibrium where everyone finds their footing — it is an unstable scramble where someone
> will be disadvantaged from the first moment, and neither combatant knows who until the dust
> settles. The alternative — defaulting to the viable tier for both — would re-examine weapon
> profiles that the DSL already processed, implicitly double-counting that information.
> Fate is fair; it gave both combatants an equal chance to draw the weak position.

**Ownership summary:**

| Layer | Owns |
|---|---|
| Bout engine | Weapon physical facts + actor references + measure enum conversion |
| Plugin / Rules Registry | Stat mappings, formula under tag, DSL evaluation |
| DSL evaluator | Arithmetic on resolved values |

#### Weapon Physical Facts Source

Weapon reach and inertia are physical properties of the weapon, not technique-specific.
Two options for sourcing this data at Bout formation time (before any package is selected):

The dedicated weapon reference catalog now exists: `yaml/WeaponReferenceData.yaml`.
It was generated by scanning all 395 WPP profiles across 18 weapon types and confirmed
that `weapon_size_profile` and `range_profile` fields are fully consistent across all
packages for every weapon. The Bout engine reads reach and inertia from this file at
formation time. WPP profiles should be updated to reference this catalog rather than
duplicating the data — see OQ-7.

### Measure (distance between combatants)

Discrete states — exact distance value also kept in context for ranged attack calculations:

| State | Description |
|---|---|
| `close_in` | Very short range — grappling, short weapons, daggers |
| `mid_reach` | Standard melee range |
| `long_reach` | Extended weapons — spears, polearms |
| `far_reach` | Edge of melee; transition to ranged combat |

### Mutual Orientation

The Bout tracks which exposure plane of each combatant is adjacent to the other.
Represented as a parallel region within the Bout machine:

```
orientation (parallel)
  ├── elevation:    level | pc_above | pc_below
  ├── pc_adjacent:  front | front-left | front-right | rear | rear-left | rear-right
  └── npc_adjacent: front | front-left | front-right | rear | rear-left | rear-right
```

- `pc_adjacent` — which of the PC's exposure planes is adjacent to the NPC
- `npc_adjacent` — which of the NPC's exposure planes is adjacent to the PC
- 36 orientations per elevation tier × 3 tiers = **108 total orientation states**

#### Attack eligibility (derived property)

Attack eligibility requires no separate state — it is derived from the adjacency values:
- PC can attack if `pc_adjacent` ∈ {`front`, `front-left`, `front-right`}
- NPC can attack if `npc_adjacent` ∈ {`front`, `front-left`, `front-right`}

Within same elevation, the 36 orientations partition into four quadrants:

|  | NPC front (3) | NPC rear (3) |
|---|---|---|
| **PC front (3)** | 9 — mutual attack | 9 — PC only |
| **PC rear (3)** | 9 — NPC only | 9 — neither |

#### Body part targeting

The `pc_adjacent` value determines which body parts of the NPC are targetable,
cross-referenced against each body part's `exposure_planes[]` in the critter YAML.
A body part is only targetable if its declared exposure plane matches the attacker's
current `pc_adjacent` or `npc_adjacent` value.

#### Elevation notes

`(level, pc_above, pc_below)` — the `pc_above`/`pc_below` tiers capture elevated combat
(inclines, platforms, cliffs). The `above`/`below` horizontal exposure planes come into
play when one combatant is elevated directly above the other (e.g. firing arrows straight
down, grappling from a ledge).

---

## Formation

An actor representing a group of allied combatants fighting in a coordinated formation.

- Created by the Skirmish when allies join together into a formation
- Not limited to two — any number of allied combatants may participate
- Only allies may join a formation (no mixed-allegiance formations)
- Subscribes to state changes of all member combatants
- Spawned and torn down by the Skirmish actor

### Purpose and capabilities (vision — exact design TBD, see OQ-6)

Formations leverage the orientation system to enable strategic coordinated fighting:

- **Shield wall** — members align adjacent planes to form a contiguous front,
  reducing or eliminating rear exposure planes for those inside
- **Fighting wedge** — members arranged to concentrate force at a point
- **Back-to-back** — two combatants share no rear-plane vulnerability between them
- Spans multiple hex prisms; has a collective shape usable strategically
- Can shield specific exposure planes of member combatants
- May allow the Formation to act as a single unit — potentially serving as
  one of the two parties in a Bout (see OQ-6)

---

## Combatant

The leaf actor. Individual internal state of one participant. Equivalent to a **critter**
machine — see `tmcrittermaker-design-state.md` for the full critter design.

- Reacts to events from its Bout(s), Formation (if any), Geomancer, and Skirmish
- Does not track orientation or measure — those live in the Bout
- A combatant in multiple Bouts receives events from each Bout independently
- TURN_START and similar turn-management events originate from the Skirmish

---

## Subscription Model

All subscriptions use XState v5's full snapshot subscription — the subscriber receives
every state change from the subscribed actor and decides internally what matters.
This keeps coupling one-directional:

- Bout and Formation know about combatant state changes; combatants do not know
  about Bout or Formation internals
- Skirmish knows about all actor state changes; subordinate actors do not know
  about Skirmish internals

---

## Hex Prism Spatial Model

Each combatant occupies a **hex prism**. The 8 standardized exposure plane labels form a
fixed enum used across critter YAML body part declarations and Bout orientation tracking:

- **Vertical (6):** `front`, `front-left`, `rear-left`, `rear`, `rear-right`, `front-right`
- **Horizontal (2):** `above`, `below`

Large combatants (e.g. dragon) occupy multiple hex prisms joined at faces. Geometry for
multi-hex combatants is TBD; the majority of critter classes occupy a single hex prism.

---

## Open Questions

**OQ-3: Bout disengagement mechanics**
Under what conditions can a combatant voluntarily leave a Bout? What prevents disengagement
(e.g., opponent holds initiative, weapon locked in a bind, grappled, specific stance)? Are
there costs to disengaging (action economy, movement, exposure to a free attack)? What
happens to a combatant's state when their Bout ends by opponent death vs voluntary exit?
Exact mechanics TBD.

**OQ-4: Formation fighting — full design**
How are formations declared and managed? How do they mechanically benefit members —
which exposure planes are shielded, under what conditions? How does formation shape
interact with the hex grid? Can members act individually within a formation or only as
a unit? How does a Formation interact with the Bout system (see OQ-6)?

**OQ-5: Geomancer — design and interface**
How are smart objects modelled within the Geomancer actor? How does the Geomancer
communicate geographical state to the Skirmish and to individual combatants? How do
combatants query or interact with environmental objects (knocking down a wall,
claiming high ground)? What events does the Geomancer publish and to whom?

**OQ-6: Formation as a Bout participant**
Can a Formation serve as one of the two combatants in a Bout, allowing the group to
engage a single opponent or another Formation as a unit? If so, how is measure and
orientation defined between a Formation (spanning multiple hexes) and a single combatant
or another Formation? This fundamentally extends the Bout model and requires careful design.

**OQ-7: WPP profile cross-referencing to WeaponReferenceData**
`yaml/WeaponReferenceData.yaml` now exists as the authoritative source for physical weapon
properties (reach, size, inertia, maneuverability, damage type). The score-to-measure
probabilistic algorithm is also defined (see *Initial Measure Contest* above). Remaining
work: WPP profiles should be updated to reference `WeaponReferenceData` by weapon key
rather than duplicating the physical property fields inline, and the ordinal mappings for
reach and inertia (used as DSL inputs) should be formally specified in a shared constants
file rather than left as documentation-only.
