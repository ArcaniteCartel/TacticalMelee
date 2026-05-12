# Combat Exchange Resolution — Hierarchical Decision Tree
*Experimental — 2026-04-30*

> **EXPERIMENTAL DOCUMENT**: This decision tree is a design experiment. No part of it is finalized.
> It exists to make resolution logic concrete enough to evaluate, find gaps, and identify what still
> needs to be designed. Anything marked *[A:n]* is an inference or invention keyed to the
> Assumptions section — it requires explicit design review.

---

## A. Facts and Sources

Every node in this tree draws facts from specific actors or documents. The tables below list
every fact referenced, its source, and its type.

### A.1 — Bout Actor Facts

| Fact | Source | Type | Notes |
|---|---|---|---|
| `bout.measure` | Bout actor state | enum: `close_in` \| `mid_reach` \| `long_reach` \| `far_reach` | Current distance |
| `bout.elevation` | Bout orientation (parallel) | enum: `level` \| `pc_above` \| `pc_below` | Which combatant is elevated |
| `bout.pc_adjacent` | Bout orientation (parallel) | enum: 6 exposure planes | Which of PC's planes faces NPC |
| `bout.npc_adjacent` | Bout orientation (parallel) | enum: 6 exposure planes | Which of NPC's planes faces PC |
| `bout.bind_state` | Bout actor state | enum: `none` \| `weak` \| `moderate` \| `strong` | Current blade contact state *[A:1]* |
| `bout.initiative` | Bout actor state | enum: `pc` \| `npc` \| `neutral` | Who drives exchange tempo |
| `bout.advantage` | Bout actor state | enum: `pc` \| `npc` \| `neutral` | Current positional superiority *[A:1]* |

*Source: `battle-model-architecture.md`. bind_state and advantage are implied by the Pattern Library
13-step algorithm but not explicitly declared as Bout fields — see Assumption A:1.*

---

### A.2 — Combatant Machine Facts (PC; NPC is symmetrical — replace `pc.` with `npc.`)

| Fact | Source | Type | Notes |
|---|---|---|---|
| `pc.offense_mode` | PC critter machine state | enum: 3 modes | Active offensive mode |
| `pc.offense_ctx.weapon_id` | PC critter machine context | string \| null | Weapon being used (null in freestyle-grapple) |
| `pc.offense_ctx.package_id` | PC critter machine context | string \| null | Selected package (null in freestyle modes) |
| `pc.offense_ctx.profile_id` | PC critter machine context | string \| null | WPP profile ID (null in freestyle modes) |
| `pc.defensive_position` | PC critter machine state | enum: 4 modes | Active defensive mode |
| `pc.defense_ctx.weapon_id` | PC critter machine context | string \| null | Weapon in defensive use |
| `pc.defense_ctx.guard_package_id` | PC critter machine context | string \| null | Guard package (war-honed-guard only) |
| `pc.defense_ctx.evasion_package_id` | PC critter machine context | string \| null | Evasion technique (war-honed-evasion only) |
| `pc.defense_ctx.profile_id` | PC critter machine context | string \| null | Defensive WPP profile ID |
| `pc.commitment` | PC critter machine state | enum: `normal` \| `defensiveSacrifice` | Whether defensive sacrifice was made |
| `pc.wager_amount` | PC critter machine context | integer ≥ 0 | Current wager (0 = no wager) |
| `pc.wager_pool_ref` | PC critter machine context | string | Which resource pool backs the wager |
| `pc.carried_weapon_group[id].state` | PC critter machine state | enum: weapon state hierarchy | State of each weapon slot |
| `pc.action_economy.actions_remaining` | PC critter machine state | integer | Unspent actions this turn |
| `pc.action_economy.reactions_remaining` | PC critter machine state | integer | Unspent reactions this turn |
| `pc.life_state` | PC critter machine state | compound state | alive / wounded / critical / dead |
| `pc.body_part[name].tier` | PC critter machine state | compound state | Damage tier per body part |
| `pc.movement_state` | PC critter machine state | compound state | Elevation mode + movement points |
| `pc.known_packages` | PC critter machine context | string[] | Package IDs the combatant has learned |

*Source: `tmcrittermaker-design-state.md`.*

---

### A.3 — Pattern Library / WPP Profile Facts (loaded at exchange time via profile_id)

**Integer encoding rule:** When BattleEngine passes enum parameter values to the Plugin/Rules
Registry at runtime, they are transmitted as integers. Values are numbered left-to-right
starting at 0, incrementing by 5. The 5-unit increment reserves insertion space — if a new
value must be added between two existing ones, a gap is already available without renumbering.
Free text token fields are not encoded as integers. Where implementation requires comparing
values across parameters of the same semantic type (e.g., all three `measure_profile` fields
share the same measure-position concept), a shared constants definition should ensure the
integer for a given string value is the same across all parameters of that type.

| Fact | Source | Type |
|---|---|---|
| `wpp.tier_profile` | GenericWeaponPatternParameterCatalog_rich.yaml | enum: `single`(0) \| `bilayer`(5) \| `trilayer`(10) |
| `wpp.pattern[n]` | WPP profile | enum[]: `real`(0) \| `deceptive`(5) per step |
| `wpp.intent` | WPP profile | enum: `land`(0) \| `provoke`(5) \| `control`(10) *(reposition, defend not found in YAML)* |
| `wpp.measure_profile.optimal` | WPP profile | enum: `close`(0) \| `middle`(5) \| `long`(10) |
| `wpp.measure_profile.viable` | WPP profile | enum: `close`(0) \| `middle`(5) \| `long`(10) |
| `wpp.measure_profile.weak` | WPP profile | enum: `close`(0) \| `long`(5) |
| `wpp.range_profile.reach` | WPP profile | enum: `very_short`(0) \| `short`(5) \| `medium`(10) \| `long`(15) \| `very_long`(20) |
| `wpp.range_profile.minimum_effective_measure` | WPP profile | enum: `close`(0) \| `middle`(5) \| `long`(10) |
| `wpp.line_profile.primary_line` | WPP profile | enum: `high`(0) \| `low`(5) \| `inside`(10) \| `outside`(15) \| `center`(20) |
| `wpp.line_profile.secondary_line` | WPP profile | enum: `high`(0) \| `low`(5) \| `inside`(10) \| `outside`(15) \| `center`(20) |
| `wpp.target_profile.primary_target` | WPP profile | free text token |
| `wpp.target_profile.secondary_target` | WPP profile | free text token |
| `wpp.timing_profile.speed` | WPP profile | enum: `fast`(0) \| `moderate`(5) \| `slow`(10) |
| `wpp.timing_profile.commitment` | WPP profile | enum: `medium`(0) \| `high`(5) |
| `wpp.timing_profile.recovery` | WPP profile | enum: `fast`(0) \| `moderate`(5) \| `slow`(10) |
| `wpp.contact_profile.bind_quality` | WPP profile | enum: `none`(0) \| `weak`(5) \| `moderate`(10) \| `strong`(15) |
| `wpp.contact_profile.grapple_compatibility` | WPP profile | enum: `poor`(0) \| `fair`(5) \| `good`(10) \| `excellent`(15) |
| `wpp.contact_profile.shield_interaction` | WPP profile | enum: `poor`(0) \| `fair`(5) \| `good`(10) \| `excellent`(15) |
| `wpp.threat_profile.armor_effectiveness` | WPP profile | enum: `fair`(0) \| `good`(5) \| `excellent`(10) |
| `wpp.threat_profile.unarmored_effectiveness` | WPP profile | enum: `good`(0) \| `excellent`(5) |
| `wpp.threat_profile.control_effectiveness` | WPP profile | enum: `poor`(0) \| `fair`(5) \| `good`(10) \| `excellent`(15) |
| `wpp.risk_profile.close_risk` | WPP profile | enum: `low`(0) \| `medium`(5) \| `high`(10) |
| `wpp.risk_profile.overcommit_risk` | WPP profile | enum: `medium`(0) \| `high`(5) |
| `wpp.risk_profile.miss_recovery_risk` | WPP profile | enum: `low`(0) \| `medium`(5) \| `high`(10) |
| `wpp.weapon_size_profile.size` | WPP profile | enum: `very_small`(0) \| `small`(5) \| `medium`(10) \| `large`(15) |
| `wpp.weapon_size_profile.inertia` | WPP profile | enum: `low`(0) \| `medium`(5) \| `high`(10) |
| `wpp.weapon_size_profile.maneuverability` | WPP profile | enum: `low`(0) \| `medium`(5) \| `high`(10) |
| `wpp.damage_type_profile.primary` | WPP profile | enum: `cutting`(0) \| `piercing`(5) \| `blunt`(10) \| `mixed`(15) |
| `wpp.damage_type_profile.secondary` | WPP profile | enum: `none`(0) \| `cutting`(5) \| `piercing`(10) \| `blunt`(15) |
| `wpp.damage_type_profile.armor_interaction_bias` | WPP profile | enum: `bypass`(0) \| `deform`(5) \| `balanced`(10) *(glance not found in YAML)* |
| `wpp.weapon_control_profile.control_of_opponent` | WPP profile | enum: `poor`(0) \| `fair`(5) \| `good`(10) \| `excellent`(15) |
| `wpp.weapon_control_profile.bind_dominance` | WPP profile | enum: `none`(0) \| `weak`(5) \| `moderate`(10) \| `strong`(15) |
| `wpp.weapon_control_profile.resistance_to_control` | WPP profile | enum: `poor`(0) \| `fair`(5) \| `good`(10) \| `excellent`(15) |
| `wpp.grapple_profile.entry_capability` | WPP profile | enum: `poor`(0) \| `fair`(5) \| `good`(10) \| `excellent`(15) |
| `wpp.grapple_profile.control_capability` | WPP profile | enum: `poor`(0) \| `fair`(5) \| `good`(10) \| `excellent`(15) |
| `wpp.grapple_profile.anti_grapple` | WPP profile | enum: `poor`(0) \| `fair`(5) \| `good`(10) \| `excellent`(15) |
| `wpp.wager_profile.wager_allowance` | WPP profile | enum: `none`(0) \| `medium`(5) \| `large`(10) *(small not found in YAML)* |
| `wpp.wager_profile.wager_balance` | WPP profile | enum: `balanced`(0) \| `damageOverHit`(5) *(hitOverDamage, remiseOnly not found in YAML)* |
| `wpp.wager_profile.wager_riposte` | WPP profile | enum: `balanced`(0) \| `damageOverHit`(5) |
| `wpp.wager_profile.commitment_scaling` | WPP profile | enum: `low`(0) \| `high`(5) *(medium not found in YAML)* |
| `wpp.prediction_profile.expects` | WPP profile | free text token |
| `wpp.prediction_profile.exploits` | WPP profile | free text token |
| `wpp.state_effects.on_success` | WPP profile | free text token |
| `wpp.state_effects.on_failure` | WPP profile | free text token |

*Source: `GenericWeaponPatternParameterCatalog_rich.yaml`, `Longsword-Attack-Pattern-Library.md`.*

---

### A.4 — Geomancer Facts *(all TBD — Geomancer interface not yet designed, OQ-5)*

| Fact | Source | Type | Notes |
|---|---|---|---|
| `geo.hex_distance(pc, npc)` | Geomancer actor state | integer | Distance in hexes at Bout formation |
| `geo.bout_trigger_type` | Skirmish / Geomancer | enum: `ranged` \| `melee_closure` | How the Bout was initiated |
| `geo.elevation_delta` | Geomancer actor state | integer (TBD) | Elevation difference between hexes |
| `geo.terrain[hex]` | Geomancer actor state | token (TBD) | Terrain type at each hex |
| `geo.cover[hex]` | Geomancer actor state | token (TBD) | Cover type available |
| `geo.smart_objects[hex]` | Geomancer actor state | object list | Interactive objects nearby |

---

### A.5 — Plugin / Rules Registry Facts

| Fact | Source | Type |
|---|---|---|
| `plugin.wager_cap` | Plugin YAML | number (pool fraction) |
| `plugin.wager_pool_type` | Plugin YAML | enum: `survival` \| `courage` |
| `plugin.rules[tag]` | Rules Registry | DSL formula |
| `plugin.rules['initial_measure_contest']` | Rules Registry | DSL formula — inputs: `reach_a`, `inertia_a`, `reach_b`, `inertia_b` (ordinals), combatant actorRefs; returns numeric reaction score |
| `plugin.stat[name]` | Plugin YAML DSL (evaluated) | number |
| `plugin.condition_effects[id]` | Plugin YAML | effect definition |

*Source: `tmcrittermaker-design-state.md` (Rules Registry), `combat-mechanics-and-group-hud.md`.*

---

## B. Assumptions

Design gaps filled with inferences to make the tree executable. Each must be accepted, rejected,
or replaced by explicit design.

**A:1** `bout.bind_state` and `bout.advantage` are tracked as Bout actor state. The 13-step
resolution algorithm implies them; `battle-model-architecture.md` does not declare them explicitly.

**A:2** Measure enum mapping: `bout.close_in` → WPP `close`, `bout.mid_reach` → WPP `middle`,
`bout.long_reach` → WPP `long`. `far_reach` has no WPP counterpart — all packages are at minimum
`weak` at far reach. Ranged attacks (deferred) are the only fully viable far_reach option.

**A:3** A running integer `advantage_score` accumulates during each exchange. Modifier values
used throughout this tree (+1 optimal measure, -2 blocked, etc.) are design placeholders pending
game-mechanical calibration. Final score maps to the ±3 outcome scale from the Pattern Library.

**A:4** Combatant package knowledge (`pc.known_packages`) lives in critter machine context as a
list of package IDs. Plugin YAML populates it at instantiation. `freestyle-grapple` and
`freestyle-armed` are always available regardless of learned packages.

**A:5** A package is "compatible" when the defender's actual behavior matches the attacker's
`wpp.prediction_profile.expects` token. Compatibility is checked by the Bout machine. The exact
token-to-behavior mapping is not yet designed (see DTQ-3).

**A:6** Freestyle defense provides baseline partial coverage modeled via a plugin DSL formula
(e.g., `{dex_mod} + {combat_training}`) with no line-specific advantage. Structured positions
(war-honed-guard, war-honed-evasion) use their WPP profile for line comparison: if the
defensive profile's `primary_line` covers the attacker's `primary_line`, active coverage exists.

**A:7** Enum ordinal rankings for comparison: Speed: `fast > moderate > slow`. Quality enums
(`bind_quality`, `grapple`, etc.): `excellent > good > fair > poor`. Commitment: `high > medium > low`
(higher = harder to abort, more riposte risk). Size: `very_large > large > medium > small > very_small`.

**A:8** Damage resolves into four outcomes: `hit` (full damage to body part), `glance` (reduced),
`blocked` (none), `bypass` (armor ineffective — full damage, location specific).
Armor coverage per body part is plugin-defined reference data; body_part.tier tracks structural damage.

**A:9** NPC defensive position is declared by the GM or AI before the declaration window closes.
Boss NPCs follow the same wager process as PCs. Regular NPCs never wager.

**A:10** Fresh Bout starts at `bout.initiative = neutral`, `bout.advantage = neutral`.
Initial `bout.measure` depends on how the Bout was triggered:
- **Ranged declaration**: mapped from `geo.hex_distance(pc, npc)` via threshold table
  (1 hex → `close_in`; 2–3 → `mid_reach`; 4–5 → `long_reach`; 6+ → `far_reach`).
- **Melee closure**: `initial_measure_contest` DSL returns a score ∈ [-1, 1]; converted
  via a three-step probabilistic algorithm — (1) roll |score|% for favored combatant's
  optimal; (2) roll |score|% for viable; (3) 50/50 between A-weak and B-weak. Score = 0
  skips to step 3. The step-3 50/50 assigns the weak position to one combatant regardless
  of weapon profiles — fate is neutral; asymmetric consequences are the profiles' business.
  See `battle-model-architecture.md` for full algorithm and design rationale.

**A:11** Wager allowance tier numerical ceilings: `small` = 20% of pool current, `medium` = 35%,
`large` = 50%. Placeholder values pending WM-OQ-1 calibration.

**A:12** `wpp.prediction_profile.expects` and `wpp.state_effects` values are free text tokens.
A formal vocabulary and dispatch table mapping tokens to machine events is required (see DTQ-2, DTQ-3).

**A:13** Geomancer elevation delta applies as a flat modifier: PC above → `advantage_score += +1`;
NPC above → `advantage_score += -1`. Exact mechanism TBD pending OQ-5.

**A:14** The exchange is modeled from the initiative holder's perspective as the primary attacker.
At `initiative = neutral`, both combatants attack simultaneously; mutual strike outcomes are possible.

**A:15** `defensiveSacrifice` costs 1 additional action beyond the standard defense cost.
Requires `actions_remaining >= 2`. Exact action economy costs are deferred.

**A:16** Weapon physical facts (reach, inertia) at Bout formation are read from
`yaml/WeaponReferenceData.yaml` — a dedicated weapon reference catalog generated by
scanning all 395 WPP profiles across 18 weapon types. All physical property fields
confirmed consistent per weapon type; no inconsistencies found. OQ-7 updated accordingly.

---

## C. The Decision Tree

> Notation:
> - `[?]` — decision node (comparison)
> - `[→]` — consequence / state update
> - `[END]` — terminal outcome
> - `{source.fact}` — fact reference
> - *[A:n]* — assumption number

---

### Phase 0 — Bout Initialization

*Runs once when Skirmish spawns a new Bout actor.*

```
BOUT INITIALIZATION
│
├── [→] bout.initiative = neutral
├── [→] bout.advantage = neutral
├── [→] bout.bind_state = none
├── [→] bout.elevation    = derived from geo.elevation_delta
├── [→] bout.pc_adjacent  = derived from Geomancer hex orientation
├── [→] bout.npc_adjacent = derived from Geomancer hex orientation
│
├── [?] geo.bout_trigger_type?  [A:10]
│   │
│   ├── ranged
│   │   ├── [→] Read geo.hex_distance(pc, npc)
│   │   └── [→] bout.measure = threshold_table(hex_distance):
│   │               1     → close_in
│   │               2–3   → mid_reach
│   │               4–5   → long_reach
│   │               6+    → far_reach
│   │
│   └── melee_closure
│       ├── [→] Read weapon physical facts from WeaponReferenceData.yaml  [A:16]
│       │     reach_a, inertia_a  (ordinals: very_short=1…very_long=5; low=1,med=2,high=3)
│       │     reach_b, inertia_b
│       │
│       ├── [→] Call rules_registry.evaluate(
│       │         'initial_measure_contest',
│       │         { combatant_a: actorRef, combatant_b: actorRef,
│       │           reach_a, inertia_a, reach_b, inertia_b }
│       │       )
│       │     Plugin reads combatant stats via actorRefs, evaluates DSL,
│       │     returns score ∈ [-1, 1]
│       │     (positive = favors a, negative = favors b, 0 = neutral)
│       │
│       └── [→] score_to_measure(score):  [A:10]
│             │
│             ├── score < 0 → apply symmetric algorithm treating B as the favored side
│             │
│             ├── [?] score == 0?
│             │   └── YES → skip to Step 3
│             │
│             ├── Step 1: roll d100 vs (|score| × 100)
│             │   ├── success → bout.measure = A's measure_profile.optimal  ✓
│             │   └── failure → Step 2
│             │
│             ├── Step 2: roll d100 vs (|score| × 100)
│             │   ├── success → bout.measure = A's measure_profile.viable  ✓
│             │   └── failure → Step 3
│             │
│             └── Step 3 — 50/50 roll (fate assigns the weak position):
│                 ├── < 50 → bout.measure = A's measure_profile.weak
│                 └── ≥ 50 → bout.measure = B's measure_profile.weak
│
└── [→] Subscribe to pc and npc state snapshots; notify Skirmish on state change
```

---

### Phase 1 — Exchange Opening: Load Combat State

*Runs at the start of each exchange (before declaration window).*

```
LOAD COMBAT STATE
│
├── From Bout actor:
│   ├── bout.measure, bout.initiative, bout.advantage, bout.bind_state
│   └── bout.elevation, bout.pc_adjacent, bout.npc_adjacent
│
├── From PC critter machine:
│   ├── pc.life_state
│   ├── pc.action_economy.actions_remaining, pc.action_economy.reactions_remaining
│   ├── pc.body_part[*].tier  (all parts)
│   ├── pc.carried_weapon_group[*].state  (all slots)
│   └── pc.known_packages
│
├── From NPC critter machine:
│   └── (symmetrical)
│
└── From Geomancer:  [A:13 — interface TBD]
    └── geo.terrain, geo.cover, geo.elevation_delta, geo.smart_objects
```

---

### Phase 2 — Action Economy Check

*Before any declaration — verify both combatants can act.*

```
[?] pc.action_economy.actions_remaining > 0?
├── YES → PC may declare offense
└── NO  → PC cannot initiate; offense forced to freestyle-unarmed (can still defend)
          [→] bout.initiative shifts to npc if pc.actions == 0

[?] npc.action_economy.actions_remaining > 0?
├── YES → NPC may declare offense
└── NO  → NPC cannot initiate; offense forced to freestyle-unarmed
          [→] bout.initiative shifts to pc if npc.actions == 0

[?] Both combatants have zero actions?
└── YES → [END exchange — no declarations; skip to Phase 15 with advantage_score = 0]
```

---

### Phase 3 — Declaration Window

*Both combatants select packages simultaneously. Hidden from opponent until reveal (HUD-OQ-1 Option A).*

#### 3A — PC Offense Declaration

```
PC OFFENSE DECLARATION
│
├── [?] PC selects offense_mode:
│   │
│   ├── freestyle-grapple
│   │   ├── [→] pc.offense_mode = freestyle-grapple; pc.offense_ctx = {}
│   │   └── (always valid; no package check required)
│   │
│   ├── freestyle-armed
│   │   ├── [?] pc.carried_weapon_group[weapon_id].state ∈ {readied.*}?
│   │   │   ├── YES → [→] pc.offense_mode = freestyle-armed; pc.offense_ctx.weapon_id = weapon_id
│   │   │   └── NO  → REJECT; must choose another mode
│   │   └── (no package validation required)
│   │
│   └── honed-war-form
│       ├── PC selects: weapon_id, package_id, profile_id
│       ├── [?] package_id ∈ pc.known_packages?
│       │   ├── NO  → REJECT; forced to freestyle-armed  [A:4]
│       │   └── YES → continue
│       ├── [?] pc.carried_weapon_group[weapon_id].state ∈ {readied.*}?
│       │   ├── NO  → REJECT; forced to freestyle-armed
│       │   └── YES → continue
│       ├── [→] Load WPP profile from catalog via profile_id
│       └── [→] pc.offense_mode = honed-war-form
│               pc.offense_ctx = { weapon_id, package_id, profile_id }
```

#### 3B — PC Defense Declaration

```
PC DEFENSE DECLARATION
│
├── [?] PC selects defensive_position:
│   │
│   ├── freestyle-unarmed
│   │   └── [→] pc.defensive_position = freestyle-unarmed; pc.defense_ctx = {}
│   │
│   ├── freestyle-armed
│   │   ├── [?] pc.carried_weapon_group[weapon_id].state ∈ {readied.*}?
│   │   │   ├── YES → [→] pc.defensive_position = freestyle-armed; pc.defense_ctx.weapon_id = weapon_id
│   │   │   └── NO  → REJECT; fall back to freestyle-unarmed
│   │   └── continue
│   │
│   ├── war-honed-guard
│   │   ├── [?] guard_package_id ∈ pc.known_packages?
│   │   ├── [?] pc.carried_weapon_group[weapon_id].state ∈ {readied.*}?
│   │   └── [→] pc.defensive_position = war-honed-guard; load guard WPP profile
│   │
│   └── war-honed-evasion
│       ├── [?] evasion_package_id ∈ pc.known_packages?
│       └── [→] pc.defensive_position = war-honed-evasion; load evasion profile
│
└── [?] PC declares defensiveSacrifice?
    ├── YES
    │   ├── [?] pc.action_economy.actions_remaining >= 2?  [A:15]
    │   │   ├── YES → [→] pc.commitment = defensiveSacrifice; spend 1 extra action
    │   │   └── NO  → REJECT; commitment = normal
    │   └── continue
    └── NO → [→] pc.commitment = normal
```

#### 3C — NPC Declaration

Symmetrical to 3A and 3B. GM or AI selects NPC offense, defense, and commitment.

---

### Phase 4 — Wager Declaration

```
WAGER DECLARATION
│
├── [?] pc.offense_mode == honed-war-form?
│   ├── NO  → pc.wager_amount = 0; skip
│   └── YES → continue
│
├── [?] Is PC a player combatant OR flagged as boss NPC?  [A:9]
│   ├── NO  → pc.wager_amount = 0; skip
│   └── YES → continue
│
├── [?] wpp.wager_profile.wager_allowance ≠ none?
│   ├── NO  → pc.wager_amount = 0; skip (package prohibits wagering)
│   └── YES → continue
│
├── [→] Compute wager ceiling:
│   pool_current = pc.resource_pool[pc.wager_pool_ref].current
│   plugin_cap   = plugin.wager_cap × pool_current
│   allowance_cap:
│     small  → 0.20 × pool_current  [A:11]
│     medium → 0.35 × pool_current
│     large  → 0.50 × pool_current
│   wager_ceiling = min(plugin_cap, allowance_cap)
│
├── [?] PC declares wager_amount ∈ [0, wager_ceiling]?
│   ├── YES → [→] pc.wager_amount = declared amount
│   └── NO  → [→] clamp to wager_ceiling
│
└── [→] Record wager_amount in critter machine context
```

---

### Phase 5 — Simultaneous Reveal

```
[→] Declaration window closes
[→] HUD: flip both Bout card sub-cards simultaneously (HUD-OQ-1 Option A)
[→] Initialize exchange_score = 0  [A:3]
[→] Begin exchange resolution
```

---

### Phase 6 — Measure-to-Package Compatibility Check

*For each combatant in honed-war-form, compare current measure to package measure_profile.*

```
MEASURE CHECK (run once per honed-war-form combatant)
│
├── [→] Map bout.measure to WPP measure vocabulary:  [A:2]
│     close_in  → 'close'
│     mid_reach → 'middle'
│     long_reach → 'long'
│     far_reach → (no WPP counterpart)
│
├── [?] bout.measure == far_reach?
│   └── YES → exchange_score += -2; treat as 'long' for remaining checks  [A:3]
│
├── [?] mapped_measure < wpp.range_profile.minimum_effective_measure?  [A:7]
│   └── YES → package cannot function; exchange_score += -2
│              [→] offense_mode reverts to freestyle-armed for this exchange
│
├── [?] mapped_measure == wpp.measure_profile.optimal?
│   └── YES → exchange_score += +1  [A:3]
│
├── [?] mapped_measure == wpp.measure_profile.viable?
│   └── YES → exchange_score += 0 (no change)
│
└── [?] mapped_measure == wpp.measure_profile.weak?
    └── YES → exchange_score += -1  [A:3]
```

---

### Phase 7 — Orientation and Line Availability

```
ORIENTATION CHECK
│
├── [?] bout.pc_adjacent ∈ {front, front-left, front-right}?
│   ├── YES → PC attack eligible
│   └── NO  → PC cannot attack; pc.offense_mode forced to freestyle-unarmed
│               exchange_score += -1  [A:3]
│
├── [?] bout.npc_adjacent ∈ {front, front-left, front-right}?
│   ├── YES → NPC attack eligible
│   └── NO  → NPC cannot attack; npc.offense_mode forced to freestyle-unarmed
│
├── [?] Approach direction bonus (PC attacking NPC):
│   npc_adjacent == rear              → exchange_score += +2  [A:3]
│   npc_adjacent ∈ {rear-left, rear-right} → exchange_score += +1
│   npc_adjacent == front            → no bonus
│
├── [?] bout.elevation?
│   pc_above → exchange_score += +1  [A:13]
│   pc_below → exchange_score += -1
│   level    → no change
│
└── [?] Does wpp.line_profile.primary_line target a body part exposed on npc_adjacent plane?
    ├── YES → [→] Record target body part for Phase 11 damage
    └── NO  → [→] Must use secondary_line or accept penalty
              exchange_score += -1
```

---

### Phase 8 — Package Compatibility Check

*Determines whether the honed package's predicted outcome matches what the defender actually does.*

```
COMPATIBILITY CHECK  [A:5, A:12]
│
├── [→] Load attacker's wpp.prediction_profile.expects token
│
├── [?] Is defender in freestyle mode (freestyle-unarmed or freestyle-armed)?
│   ├── YES
│   │   ├── Freestyle defender has no structured prediction; reacts instinctively
│   │   ├── [?] attacker's expects token is a generic reaction token?  [A:12]
│   │   │   ├── YES → partial compatibility; exchange_score += +1
│   │   │   └── NO  → neutral; exchange_score += 0
│   │   └── Package proceeds (never fully incompatible vs freestyle)
│   │
│   └── NO (structured: war-honed-guard or war-honed-evasion)
│       ├── [→] Load defender's defensive WPP profile
│       ├── [?] attacker's expects token matches defender's behavior token?  [A:5, A:12]
│       │   ├── YES → COMPATIBLE
│       │   │   └── exchange_score += +1 (prediction confirmed)
│       │   └── NO  → INCOMPATIBLE
│       │       ├── [→] Attacker's honed package does not match this defensive position
│       │       ├── [?] Is attacker currently honed-war-form?
│       │       │   ├── YES → revert to freestyle-armed (or freestyle-grapple if no weapon)
│       │       │   │   pc.offense_mode = freestyle-armed
│       │       │   │   pc.offense_ctx = { weapon_id }
│       │       │   │   exchange_score += -1  [A:3]
│       │       │   └── NO  → already freestyle; no change
│       │       └── continue with resolved offense_mode
│       └── continue
```

---

### Phase 9 — Step-by-Step Exchange Resolution

*Iterates over each package step. Single package: 1 iteration. Bilayer: 2. Trilayer: 3.*
*Both combatants attack simultaneously. The initiative holder is the "primary attacker"*
*in each step; the other's counter-offense resolves in the same step at lower priority [A:14].*

```
FOR EACH step n IN [1 .. wpp.tier_steps]:

  ├── [→] step_intent = wpp.pattern[n]  (real | deceptive)
  │
  ├─────────── REAL STEP ─────────────────────────────────────────────
  │ (if step_intent == real)
  │
  │   ├── [?] Is defender in structured position (war-honed-guard or war-honed-evasion)?
  │   │   │
  │   │   ├── YES — Structured Defense
  │   │   │   ├── [?] defender WPP.line_profile covers attacker WPP.line_profile.primary_line?  [A:6]
  │   │   │   │   ├── YES → defender has active guard on this line
  │   │   │   │   │         → enter REAL-vs-ACTIVE-GUARD sub-tree (below)
  │   │   │   │   └── NO  → attacker exploits uncovered line
  │   │   │   │             exchange_score += +1
  │   │   │   │             → proceed to Phase 11 (Damage)
  │   │   │   │
  │   │   │   └── Timing comparison:
  │   │   │       attacker.wpp.timing.speed vs defender.wpp.timing.speed  [A:7]
  │   │   │       ├── attacker faster → may beat guard setup; exchange_score += +1
  │   │   │       ├── defender faster → guard completes first; exchange_score += -1
  │   │   │       └── equal           → no shift
  │   │   │
  │   │   └── NO — Freestyle Defense  [A:6]
  │   │       ├── [→] Evaluate DSL: plugin.rules['freestyle_defense_rating']  [A:4, DTQ-4]
  │   │       │     with {defender.stat} tokens vs attacker attack rating
  │   │       ├── [?] formula: defense_rating > attack_rating?
  │   │       │   ├── YES → partial defense; glance or block
  │   │       │   └── NO  → attack gets through; exchange_score += +1
  │   │       │             → proceed to Phase 11 (Damage)
  │   │       └── continue
  │   │
  │   └── REAL-vs-ACTIVE-GUARD sub-tree:
  │       │
  │       ├── [?] pc.wager_amount > 0 AND wpp.wager_balance == hitOverDamage?
  │       │   └── YES → [→] add wager hit bonus to attack rating  [A:11]
  │       │
  │       ├── Binding comparison:
  │       │   attacker.wpp.contact_profile.bind_quality vs
  │       │   defender.wpp.weapon_control_profile.resistance_to_control  [A:7]
  │       │   ├── bind_quality > resistance → bind forms → Phase 10A (Bind)
  │       │   ├── resistance > bind_quality → attack redirected; exchange_score += -1
  │       │   └── equal → contested; neutral bind → Phase 10A
  │       │
  │       └── Final REAL step outcome:
  │           ├── Lands    → exchange_score += +1; → Phase 11 (Damage)
  │           ├── Blocked  → exchange_score += 0
  │           └── Deflected → exchange_score += -1; defender may seize initiative
  │
  ├─────────── DECEPTIVE STEP ─────────────────────────────────────────
  │ (if step_intent == deceptive)
  │
  │   ├── Determine whether defender reacts to the deception:
  │   │   │
  │   │   ├── Structured defender:
  │   │   │   check defender WPP.prediction_profile.expects against this step's action
  │   │   │   ├── defender expects deception → holds guard; NO REACTION
  │   │   │   └── defender expects real action → commits guard; FULL REACTION
  │   │   │
  │   │   └── Freestyle defender:  [A:6]
  │   │       [→] Evaluate DSL: plugin.rules['deception_detection_rating']  [DTQ-4]
  │   │       ├── detection > attacker's deception rating → defender holds; NO REACTION
  │   │       └── detection ≤ deception rating → FULL REACTION
  │   │
  │   ├── CASE: Defender REACTS (commits guard/movement to the deception)
  │   │   ├── [→] Deception succeeds; defender position compromised
  │   │   ├── exchange_score += +1
  │   │   ├── [?] Is this the final step in the package?
  │   │   │   ├── YES → attacker extended without a real follow-up; state_effects.on_success applied
  │   │   │   │         advantage maintained for next exchange; no direct damage
  │   │   │   └── NO  → proceed to step n+1 with defender in open position
  │   │   └── continue
  │   │
  │   ├── CASE: Defender IGNORES (does not react)
  │   │   ├── exchange_score += 0 (neutral; attacker exposed briefly)
  │   │   ├── [?] wpp.timing.commitment == high?
  │   │   │   └── YES → attacker over-committed; risk_profile.overcommit_risk applies
  │   │   │             exchange_score += -1  [A:3]
  │   │   └── continue; deception failed to draw reaction
  │   │
  │   └── CASE: Defender COUNTER-ATTACKS (punishes deception timing window)
  │       ├── exchange_score += -1  [A:3]
  │       ├── [→] Defender seizes initiative; bout.initiative shifts
  │       ├── [→] Resolve NPC counter-offense as a nested Phase 9 step  [DTQ-7]
  │       └── continue (nested depth-bounded)
```

---

### Phase 10 — Contact Subsystems

*Triggered when weapons or bodies make contact during a REAL step.*

#### 10A — Bind Resolution

```
BIND CHECK
│
├── [?] wpp.contact_profile.bind_quality == none?
│   └── YES → skip bind; no contact formed
│
├── Compare (ordinal):  [A:7]
│   attacker.wpp.contact_profile.bind_quality vs
│   defender.wpp.weapon_control_profile.resistance_to_control
│
├── bind_quality > resistance → BIND FORMS
│   ├── [→] bout.bind_state = attacker.wpp.contact_profile.bind_quality
│   ├── [→] attacker carried_weapon: → locked_as_binder
│   ├── [→] defender carried_weapon: → locked_in_bind
│   └── exchange_score += +1
│
├── resistance > bind_quality → BIND DEFLECTED
│   ├── [→] bout.bind_state unchanged (or none)
│   └── exchange_score += -1
│
└── equal → CONTESTED BIND
    ├── [→] bout.bind_state = moderate
    ├── [→] both weapons → locked_as_binder (mutual)
    └── exchange_score += 0
```

#### 10B — Grapple Entry

```
GRAPPLE CHECK
│
├── [?] bout.measure == close_in OR grapple_compatibility == excellent?
│   ├── NO → skip
│   └── YES → continue
│
├── [?] Does attacker intend to grapple? (player choice / NPC AI intent)
│   ├── NO → skip
│   └── YES → continue
│
├── Compare (ordinal):  [A:7]
│   attacker.wpp.grapple_profile.entry_capability vs
│   defender.wpp.grapple_profile.anti_grapple
│
├── entry > anti_grapple → GRAPPLE ENTERED
│   ├── [→] attacker.carried_weapon[weapon_id].state → grappling_opponent
│   ├── [→] bout.measure = close_in (confirmed)
│   └── exchange_score += +1
│
├── anti_grapple > entry → GRAPPLE REPELLED
│   ├── [→] measure may widen; exchange_score += -1
│   └── [→] attacker exposed (wpp.risk_profile.close_risk applies)
│
└── equal → CONTESTED GRAPPLE
    └── [→] Evaluate DSL stat formula  [A:6, DTQ-4]
```

#### 10C — Shield Interaction

```
SHIELD CHECK
│
├── [?] Defender has shield in readied state?
│   ├── NO → skip
│   └── YES → continue
│
├── Check attacker.wpp.contact_profile.shield_interaction:  [A:7]
│   poor      → shield blocks; exchange_score += -1
│   fair      → partial deflection; exchange_score += 0
│   good      → attack angles around shield; exchange_score += 0
│   excellent → attacker leverages shield against defender; exchange_score += +1
```

---

### Phase 11 — Damage and Armor Interaction

*Triggered when a REAL step resolves as a hit.*

```
DAMAGE RESOLUTION  [A:8]
│
├── [→] Target body part = determined in Phase 7 (line_profile → npc_adjacent exposure plane)
│
├── [→] Load npc.body_part[target].tier  (structural damage context)
│
├── [?] attacker.wpp.damage_type_profile.armor_interaction_bias:
│   │
│   ├── bypass   → armor circumvented; full damage
│   │   [→] outcome = bypass
│   │   [→] DSL: plugin.rules['bypass_damage'] with attacker stats
│   │
│   ├── deform   → blunt trauma through/under armor
│   │   [→] outcome = deform
│   │   [→] DSL: plugin.rules['deform_damage']
│   │
│   ├── glance   → attack slides off
│   │   [→] outcome = glance (reduced or no damage)
│   │   [→] DSL: plugin.rules['glance_damage']
│   │
│   └── balanced → apply threat_profile.armor_effectiveness:
│       excellent → full hit
│       good      → standard hit with minor reduction
│       fair      → partial; may glance
│       poor      → likely deflected; outcome = glance
│
├── [→] Apply outcome to body_part:
│   ├── Significant damage → advance body_part.tier one step
│   │   (intact → grazed → wounded → critical → destroyed)
│   ├── Tier transition → fire on_enter effects (APPLY_CONDITION_EFFECT events)
│   └── body_part destroyed → hosted natural weapon becomes disarmed
│
├── [?] Damage crosses life_state pool threshold? (POOL_THRESHOLD event)
│   ├── YES → [→] life_state transitions; APPLY_CONDITION_EFFECT for new life_state
│   └── NO  → record damage; continue exchange
│
└── exchange_score += +1 to +3 depending on severity  [A:3]
```

---

### Phase 12 — Wager Resolution

*Triggered after Phase 11 if pc.wager_amount > 0.*

```
WAGER RESOLUTION
│
├── [?] pc.wager_amount == 0?
│   └── YES → skip entirely
│
├── [?] Did the wagered step succeed?
│   │
│   ├── YES — WAGER SUCCESS
│   │   ├── [?] wpp.wager_balance:
│   │   │   ├── hitOverDamage  → bonus was pre-applied to hit chance in Phase 9; no further effect
│   │   │   ├── damageOverHit  → [→] DSL: plugin.rules['wager_damage_bonus'] with wager_amount
│   │   │   ├── balanced       → [→] split bonus (partial hit + partial damage)
│   │   │   └── remiseOnly     → [?] Was this step parried?
│   │   │                         ├── YES → remise bonus activates for next available action
│   │   │                         └── NO  → remise bonus forfeited (step landed; remise not needed)
│   │   └── [→] Wager consumed; no riposte triggered
│   │
│   └── NO — WAGER FAILURE
│       ├── [→] Riposte window opens for opponent
│       ├── Riposte probability influenced by:  [A:3, A:11]
│       │   ├── opponent stats → DSL: plugin.rules['riposte_probability']
│       │   ├── wpp.wager_riposte (weights riposte hit vs damage)
│       │   └── wpp.commitment_scaling × pc.wager_amount (amplifies riposte risk)
│       │
│       ├── [?] Riposte succeeds (probabilistic roll):
│       │   ├── YES — RIPOSTE LANDS
│       │   │   ├── [→] Riposte damage = f(wager_amount, wager_riposte)  [A:3]
│       │   │   ├── [→] NOT mitigated by pc.defensive_position
│       │   │   ├── [→] Apply damage via Phase 11 (riposte attacker = NPC)
│       │   │   └── exchange_score += -2 to -3
│       │   │
│       │   └── NO — RIPOSTE MISSES
│       │       └── exchange_score += -1 (wager failure, no riposte)
│       │
│       └── [→] pc.wager_amount = 0 (consumed regardless of riposte outcome)
```

---

### Phase 13 — Post-Step State Update

*After each step, propagate results to Bout and combatant machine states.*

```
STATE UPDATE
│
├── [→] bout.advantage:
│   ├── step delta > 0 → shifts toward attacker
│   ├── step delta < 0 → shifts toward defender
│   └── step delta == 0 → unchanged
│
├── [→] bout.initiative:
│   ├── REAL succeeded → initiative stays with attacker
│   ├── REAL blocked / deflected → initiative may shift to defender
│   ├── DECEPTIVE succeeded → attacker retains tempo
│   └── DECEPTIVE ignored / punished → initiative shifts to defender
│
├── [→] bout.bind_state (from Phase 10A outcome)
│
├── [→] bout.measure (if distance changed):
│   ├── Grapple entry → close_in
│   ├── Retreat / disengage → increment one step  [DTQ-5]
│   └── Advance / chase → decrement one step (if geometry allows)
│
├── [→] pc/npc carried_weapon states (from Phase 10 outcomes)
│
├── [→] body_part.tier and life_state (from Phase 11 damage)
│
└── [→] Apply wpp.state_effects tokens  [A:12, DTQ-2]
    on_success or on_failure → dispatch to machine event table (TBD)
```

---

### Phase 14 — Early Resolution Check

```
EARLY RESOLUTION CHECK
│
├── [?] Either combatant dead (life_state == dead)?
│   └── YES → [END] Bout ends; Skirmish tears down Bout actor
│
├── [?] exchange_score cumulative ≥ +3?
│   └── YES → [END] PC decisive success → Phase 15 (Final Scoring)
│
├── [?] exchange_score cumulative ≤ -3?
│   └── YES → [END] NPC decisive success → Phase 15 (Final Scoring)
│
├── [?] This is the final package step (n == tier_steps)?
│   └── YES → Phase 15 (Final Scoring)
│
├── [?] Tier 4 adaptive package — trigger condition met?  [A:3 — Tier 4 not yet designed]
│   └── YES → apply adaptive branch (see Phase 14A)
│
└── NO → loop: increment n; return to Phase 9 for next step
```

#### Phase 14A — Adaptive Doctrine (Tier 4 Only)

```
[?] attacker's package tier == adaptive (Tier 4)?
├── NO → skip
└── YES → [?] trigger condition met? (e.g., step 1 parried, distance collapsed)
    ├── NO → continue fixed package path
    └── YES → [?] attacker knows adaptive branch for this trigger?
        ├── YES → switch to adaptive branch; restart Phase 9 from that branch's step 1
        └── NO  → fall back to freestyle-armed for remaining steps
```

---

### Phase 15 — Final Scoring and Bout Continuation

```
FINAL SCORING
│
├── [→] Read cumulative exchange_score
│
├── Map to outcome scale:  [A:3]
│   exchange_score ≥ +3  → PC decisive success  (+3)
│   exchange_score == +2 → PC strong success     (+2)
│   exchange_score == +1 → PC success            (+1)
│   exchange_score == 0  → Neutral               (0) — bind / reset / mutual guard
│   exchange_score == -1 → NPC success           (-1)
│   exchange_score == -2 → NPC strong success    (-2)
│   exchange_score ≤ -3  → NPC decisive success  (-3)
│
├── Apply outcome consequences:
│   │
│   ├── PC decisive success:
│   │   ├── [→] Damage applied to NPC target body part (if not applied step-by-step)
│   │   ├── [→] bout.initiative = pc
│   │   ├── [→] bout.advantage = pc
│   │   └── [→] State effects and condition events applied
│   │
│   ├── Neutral (0):
│   │   ├── [→] Bind persists or both reset
│   │   ├── [→] bout.initiative = neutral
│   │   └── [→] bout.measure may adjust (tactical repositioning)
│   │
│   └── NPC decisive success:
│       ├── [→] Damage applied to PC target body part
│       ├── [→] bout.initiative = npc
│       └── [→] bout.advantage = npc
│
├── [→] HUD: populate resolution strip on Bout card
│     (outcome label, damage, riposte result if any, wager result)
│
├── [?] Either combatant dead?
│   └── YES → [END] Bout ends; Skirmish tears down Bout actor
│
├── [?] Successful combatant chooses to disengage?  (OQ-3 — mechanics TBD)
│   └── YES → [END] Bout ends (costs TBD: action, exposure, move points)
│
└── NO → [→] Exchange complete; Skirmish notified
              [→] Await next exchange (TURN_START or GM trigger)
              [→] Return to Phase 1 when next exchange begins
```

---

## D. Questions Surfaced by This Tree

These gaps became apparent during construction and are not in the existing open question lists.

**DTQ-1** — `bout.bind_state` and `bout.advantage` are implied by the 13-step algorithm but not
declared in `battle-model-architecture.md`. They should be added as explicit Bout actor state fields.

**DTQ-2** — `wpp.state_effects.on_success / on_failure` are free text tokens (e.g., `hit`,
`opponent_reacts`, `control_established`). A token vocabulary and dispatch table mapping these to
XState events must be designed before the resolution engine can consume them.

**DTQ-3** — `wpp.prediction_profile.expects` tokens (e.g., `opponent_defends_high`, `first_defended`)
need a formal vocabulary. The Bout machine needs a token-to-defensive-behavior mapping table to
evaluate compatibility in Phase 8.

**DTQ-4** — Freestyle defense and deception detection use DSL rule tags (`freestyle_defense_rating`,
`deception_detection_rating`) that don't exist yet. These formulas must be defined in plugin YAML
and tagged in critter YAML before Phase 9 can execute.

**DTQ-5** — Measure changes mid-exchange (grapple entry collapses distance; retreat opens it) require
the Bout machine to emit measure-change events during the live exchange. The event protocol between
Bout and critter machines during an active exchange is not designed.

**DTQ-6** — How much advantage does a wager of size N actually provide? WM-OQ-1 (numerical scaling
of `small` / `medium` / `large` allowance tiers) directly affects Phase 12. Without this, wager bonus
magnitudes are not computable.

**DTQ-7** — Counter-attack resolution (Phase 9 DECEPTIVE CASE 3) re-enters Phase 9 with roles
reversed. This loop must be bounded. A maximum counter-attack depth, or a priority resolution rule
preventing recursive re-entry, is needed.

**DTQ-8** — Geomancer facts appear in Phase 7 as flat modifiers, but no Geomancer-to-exchange
interface exists. OQ-5 covers general Geomancer design; the resolution tree specifically needs
a defined list of which Geomancer signals are queried during a live exchange and at which phase.

---

*See also: `battle-model-architecture.md` · `tmcrittermaker-design-state.md` ·
`combat-mechanics-and-group-hud.md` · `Longsword-Attack-Pattern-Library.md` ·
`WeaponSpecificTieredPackageCatalog_rich.yaml` · `GenericWeaponPatternParameterCatalog_rich.yaml`*
