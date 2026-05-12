# Tiered Flat Package Combat System (Longsword)

## Overview

This system models combat not as isolated moves or abstract decision trees, but as **learned, executable pattern packages**. Each package represents a trained sequence of actions tied to expected opponent reactions.

Instead of:
- Choosing a “first intention,” then deciding a “second intention” dynamically

The system assumes:
- Fighters execute **pre-trained behavioral chains** under pressure

This reflects how real skill develops:
- Beginners learn **individual actions**
- Intermediates learn **paired responses**
- Advanced fighters execute **multi-step chains**
- Experts apply **adaptive, conditional patterns**

---

## Core Concept

> Combat is modeled as **trained responses to predictable reactions**, not ad hoc decision-making.

Each package encodes:
- An initial action (or provocation)
- A predicted opponent response
- A follow-up action
- (Optionally) a final resolution

---

# Tier Structure

---

## Tier 1 — Single Intention (Atomic Actions)

**Definition:**  
A single action with a clear purpose. No assumed follow-up.

### Types:
- **REAL actions** — intended to land
- **DECEPTIVE actions** — intended to provoke

### Examples:
- Direct thrust (REAL)
- Oberhau (REAL)
- High feint (DECEPTIVE)
- Invitation (DECEPTIVE)

### Learning Goal:
- Understand **lines**, **distance**, and **intent**

---

## Tier 2 — Bilayer Packages

**Definition:**  
A trained **two-step pattern**:
> Action → Reaction-based follow-up

### Types:
- REAL → REAL
- REAL → DECEPTIVE
- DECEPTIVE → REAL
- DECEPTIVE → DECEPTIVE

### Examples:
- Thrust → Disengage thrust
- High feint → Low strike
- Zornhau → Feint thrust
- High feint → Low feint

### Learning Goal:
- React to opponent behavior with **pre-learned continuations**

---

## Tier 3 — Trilayer Packages

**Definition:**  
A complete **three-step chain**:
> Initial action → Reaction handling → Final resolution

### Types:
- REAL → REAL → REAL
- REAL → DECEPTIVE → REAL
- DECEPTIVE → REAL → REAL
- DECEPTIVE → DECEPTIVE → REAL

### Examples:
- Zornhau → Wind → Duplieren
- Thrust → Feint re-thrust → Slice
- High feint → Low strike → Grapple
- High feint → Low feint → High strike

### Learning Goal:
- Execute **full combat sequences** without pause

---

## Tier 4 — Adaptive Packages (Advanced)

**Definition:**  
A **branching pattern** with multiple possible continuations based on opponent behavior.

### Structure:
- Action →
  - If parried → response A
  - If resisted → response B
  - If distance collapses → response C


### Learning Goal:
- Recognize patterns and adapt fluidly

---

# Intent Types

---

## REAL

**Definition:**  
An action intended to successfully strike or control the opponent.

**Characteristics:**
- Structurally sound
- Fully committed
- Threatens immediate resolution

**Purpose:**
- Force a **defensive reaction**
- End the exchange if unopposed

---

## DECEPTIVE

**Definition:**  
An action intended **not to land**, but to provoke a predictable response.

**Characteristics:**
- Must appear indistinguishable from REAL
- Limited commitment
- Designed to shape opponent expectation

**Purpose:**
- Manipulate opponent behavior
- Create openings for subsequent actions

---

# Core Mechanics

---

## Reaction Model

Every action produces one of several outcomes:
- hit
- parried
- ignored
- distance_change
- bind_forms


These outcomes determine which package step activates next.

---

## Resolution Types

All packages ultimately resolve into one of the following:

### 1. Line Exploitation
Opponent defends one line → attack another

### 2. Timing Exploitation
Opponent reacts too early/late → strike in tempo

### 3. Distance Collapse
Opponent closes or freezes → enter grapple/control

### 4. Bind Dominance
Blade contact occurs → control or redirect

### 5. Expectation Exploitation
Opponent predicts incorrectly → punish commitment

---

# System Flow

At runtime, the system behaves as:
- Execute Package →
  - Step 1 (REAL or DECEPTIVE) →
    - Observe Reaction →
  - Step 2 →
    - Observe Reaction →
  - Step 3 →
    - Resolution


---

# Design Principles

---

## 1. Flat Package Execution

- No dynamic intention selection mid-chain
- Entire sequence is **pre-learned and executed**
- Reduces cognitive load

---

## 2. Mechanical Continuity

- Each step flows naturally into the next
- No resets between actions

---

## 3. Predictive Structure

- Packages assume **likely opponent reactions**
- Not all branches are modeled—only probable ones

---

## 4. Progressive Complexity
- Atomic Actions → Bilayer → Trilayer → Adaptive


Each tier builds on the previous one.

---

## 5. Composability

- Trilayer packages are built from bilayer primitives
- Bilayer packages are built from single actions

---

# Example Progression
- Beginner:
  - High Feint

- Trained:
  - High Feint → Low Strike

- Veteran:
  - High Feint → Low Strike → Grapple

- Master:
  - High Feint → Low Strike
  - If parried → Thrust
  - If closed → Grapple


---

# Conceptual Model

This system can be abstracted as:

- Action →
- Reaction →
- Prediction →
- Exploit


Where:
- REAL actions force reactions
- DECEPTIVE actions shape expectations
- Final actions exploit mismatches

---

# Final Insight

This system transforms combat from:

> A sequence of isolated decisions

into:

> A library of trained behavioral responses under uncertainty

The result is:
- Greater realism
- Clear progression
- Structured complexity
- Strong mechanical cohesion

# Generic Weapon Pattern Parameter Library — Phase 1

This document defines the generic, weapon-neutral parameter profiles used by the weapon-specific package catalogue. A package name may be weapon-specific, but the resolution engine reads the neutral parameter profile.

## Full Parameter Layout Diagram

```yaml
id: WPP_###
tier_profile: single | bilayer | trilayer
pattern: [real | deceptive]
intent: land | provoke | control | reposition | defend
measure_profile:
  optimal: long | middle | close
  viable: long | middle | close
  weak: long | middle | close
range_profile:
  reach: very_short | short | medium | long | very_long
  minimum_effective_measure: close | middle | long
line_profile:
  primary_line: high | mid | low | inside | outside | center
  secondary_line: high | mid | low | inside | outside | center
target_profile:
  primary_target: free_text_token
  secondary_target: free_text_token
timing_profile:
  speed: fast | moderate | slow
  commitment: low | medium | high
  recovery: fast | moderate | slow
contact_profile:
  bind_quality: none | weak | moderate | strong
  grapple_compatibility: poor | fair | good | excellent
  shield_interaction: poor | fair | good | excellent
threat_profile:
  armor_effectiveness: poor | fair | good | excellent
  unarmored_effectiveness: poor | fair | good | excellent
  control_effectiveness: poor | fair | good | excellent
risk_profile:
  close_risk: low | medium | high
  overcommit_risk: low | medium | high
  miss_recovery_risk: low | medium | high
weapon_size_profile:
  size: very_small | small | medium | large | very_large
  inertia: low | medium | high
  maneuverability: low | medium | high
damage_type_profile:
  primary: cutting | piercing | blunt | mixed
  secondary: cutting | piercing | blunt | mixed | none
  armor_interaction_bias: bypass | deform | glance | balanced
weapon_control_profile:
  control_of_opponent: poor | fair | good | excellent
  resistance_to_control: poor | fair | good | excellent
  bind_dominance: none | weak | moderate | strong
grapple_profile:
  entry_capability: poor | fair | good | excellent
  control_capability: poor | fair | good | excellent
  anti_grapple: poor | fair | good | excellent
wager_profile:
  wager_allowance: none | small | medium | large
  wager_balance: hitOverDamage | damageOverHit | balanced | remiseOnly
  wager_riposte: hitOverDamage | damageOverHit | balanced
  commitment_scaling: low | medium | high
prediction_profile:
  expects: free_text_token
  exploits: free_text_token
state_effects:
  on_success: free_text_token
  on_failure: free_text_token
```

## Value Notes

**REAL** means the action is intended to land, control, displace, or otherwise succeed directly. **DECEPTIVE** means the action is intended to provoke, misdirect, invite, or condition the opponent so that a later action can succeed.

**Measure** describes present distance: `long` favors reach and ranged weapons, `middle` favors most full weapon actions, and `close` favors grappling, shield pressure, dagger work, pommel work, body control, and short attacks.

**Reach** describes the natural operating length of the weapon or package. `minimum_effective_measure` describes the closest band in which the package can still function without severe degradation.

**Timing** controls speed, commitment, and recovery. Commitment is especially important for wager mechanics, because a wager represents voluntary exposure and dedication to the action.

**Contact and weapon control** separate weapon-on-weapon contact from body control. A weapon may have strong bind value yet poor grapple value, or excellent grapple value yet weak bind value.

**Damage type** supports armor modeling. `bypass` favors gaps, thrusts, and precision; `deform` favors blunt trauma and crushing; `glance` indicates a tendency to slide or be deflected; `balanced` means no single armor interaction dominates.

**Wager profile** governs whether a player can risk hit points to empower execution. `wager_allowance` limits scale. `wager_balance` says whether the wager primarily improves hit chance, damage, both, or only a follow-up/remise. `wager_riposte` defines what the opponent gains if the wagered action fails.

## Resolution Decision Tree

```text
START EXCHANGE
│
├── 1. Load Combat State
│   ├── measure: long | middle | close
│   ├── bind: none | weak | moderate | strong
│   ├── initiative: player | npc | neutral
│   ├── advantage: player | npc | neutral
│   └── optional: orientation | balance | guard | armor state
│
├── 2. Each Combatant Selects Package
│   ├── player_package
│   └── npc_package
│
├── 3. Validate Package Availability
│   ├── known by combatant?
│   ├── weapon-compatible?
│   ├── state-compatible?
│   └── wager allowed if player chooses a wager?
│
├── 4. Check Measure and Range
│   ├── optimal measure → +1
│   ├── viable measure → +0
│   ├── weak measure → -2
│   ├── too far → cannot reach or severe penalty
│   └── too close → close_quarters_penalty unless package supports close
│
├── 5. Apply Optional Player Wager
│   ├── wager_allowance = none → no wager
│   ├── wager within allowance?
│   │   ├── yes → apply wager bonus according to wager_balance
│   │   └── no → cap or reject wager
│   └── increase commitment / riposte exposure according to wager_profile
│
├── 6. Resolve Current Step
│   ├── REAL vs REAL
│   │   ├── compare line, timing, reach, initiative, armor interaction
│   │   └── shift advantage / state
│   │
│   ├── REAL vs DECEPTIVE
│   │   ├── does REAL action punish the deception before it matures?
│   │   └── if yes, REAL side gains initiative / advantage
│   │
│   ├── DECEPTIVE vs REAL
│   │   ├── did REAL action match the expected response?
│   │   ├── if yes, DECEPTIVE side gains prediction advantage
│   │   └── if no, REAL side may seize initiative
│   │
│   └── DECEPTIVE vs DECEPTIVE
│       ├── does one deception exploit the other?
│       └── otherwise neutral / hesitation / reset
│
├── 7. Resolve Contact Subsystems
│   ├── bind formed?
│   │   └── compare bind_quality and bind_dominance
│   ├── shield involved?
│   │   └── compare shield_interaction
│   ├── close measure or body entry?
│   │   └── compare grapple_profile and control_of_opponent
│   └── opponent attempts weapon control?
│       └── compare resistance_to_control against opponent control capability
│
├── 8. Armor and Damage Interaction
│   ├── compare damage_type_profile to armor state
│   ├── apply armor_effectiveness
│   └── determine hit, glance, deform, bypass, or control outcome
│
├── 9. Update State
│   ├── advantage
│   ├── initiative
│   ├── measure
│   ├── bind
│   ├── balance/control
│   └── wound / armor / stamina effects
│
├── 10. Early Resolution Check
│   ├── decisive hit → END
│   ├── decisive control → END
│   ├── wager failure creates riposte window → resolve riposte
│   └── otherwise continue
│
├── 11. Adaptive Doctrine Check, if available
│   ├── master-level doctrine present?
│   ├── trigger condition met?
│   ├── switch/abort allowed?
│   └── apply switch cost or continue fixed package
│
├── 12. Repeat Steps 6–11 for remaining package steps
│
└── 13. Final Resolution
    ├── player +3 or higher → player decisive success
    ├── player +1 to +2 → player success
    ├── 0 → neutral bind/reset/mutual guard
    ├── npc +1 to +2 → npc success
    └── npc +3 or higher → npc decisive success
```


# Library of Patterns, Sampler

There is a complete librarty of patterns available for each weapon type, broken accross two yaml files located at:
- yaml/WeaponSpecificTieredPackageCatalogue_rich.yaml
- yaml/GenericWeaponPatternParameterCatalogue.yaml

The former contains the definitions of all the patterns at the explicit weapon name level, but the parameters for the weapons pattern live in the generic weapons profiles, which are in the later yaml file. All of the weapons in the former have references to their corresponding profiles by profile id. And the profiles have a field that is a collection of all the back references (more for human readability). Below, these both will be presented, an excerpt from both files.
```
  # ============================================================
  # LONGSWORD
  # ============================================================
  - weapon: longsword
    packages:

      # ------------------------------------------------------------
      # SINGLE PACKAGES
      # ------------------------------------------------------------

      # DECEPTIVE
      - id: LS_SD_01
        weapon: longsword
        tier: single
        pattern:
        - deceptive
        name: High Feint
        description: High Feint is a longsword combat package in which the fighter threatens the high line to draw an upward guard response. It is trained
          as a repeatable tactical pattern rather than improvised moment by moment, so the user can commit to the sequence while the resolution engine
          evaluates measure, timing, prediction, control, and risk.
        actions:
        - threaten_high_line_without_commitment
        profile_id: WPP_0031


      # ------------------------------------------------------------
      # BILAYER PACKAGES
      # ------------------------------------------------------------

      # DECEPTIVE → DECEPTIVE
      - id: LS_DD_01
        weapon: longsword
        tier: bilayer
        pattern:
        - deceptive
        - deceptive
        name: High Feint → Low Feint
        description: High Feint → Low Feint is a longsword combat package in which the fighter moves attention high, then threatens low to compound
          uncertainty. It is trained as a repeatable tactical pattern rather than improvised moment by moment, so the user can commit to the sequence
          while the resolution engine evaluates measure, timing, prediction, control, and risk.
        actions:
        - high_feint
        - low_feint
        profile_id: WPP_0043

```
```
  # ------------------------------------------------------------
  # WPP_0031 — used by: LS_SD_01
  # ------------------------------------------------------------
  - id: WPP_0031
    tier: single
    pattern:
    - deceptive
    intent: provoke
    measure_profile:
      optimal: middle
      viable: close
      weak: long
    range_profile:
      reach: medium
      minimum_effective_measure: middle
    line_profile:
      primary_line: high
      secondary_line: center
    target_profile:
      primary_target: head
      secondary_target: guard
    timing_profile:
      speed: moderate
      commitment: medium
      recovery: moderate
    contact_profile:
      bind_quality: strong
      grapple_compatibility: good
      shield_interaction: fair
    threat_profile:
      armor_effectiveness: fair
      unarmored_effectiveness: excellent
      control_effectiveness: good
    risk_profile:
      close_risk: medium
      overcommit_risk: medium
      miss_recovery_risk: medium
    weapon_size_profile:
      size: medium
      inertia: medium
      maneuverability: medium
    damage_type_profile:
      primary: cutting
      secondary: piercing
      armor_interaction_bias: balanced
    weapon_control_profile:
      control_of_opponent: good
      resistance_to_control: good
      bind_dominance: strong
    grapple_profile:
      entry_capability: good
      control_capability: good
      anti_grapple: good
    wager_profile:
      wager_allowance: none
      wager_balance: balanced
      wager_riposte: balanced
      commitment_scaling: low
    prediction_profile:
      expects: opponent_defends_high
      exploits: raised_guard
    state_effects:
      on_success: opponent_reacts
      on_failure: ignored
    used_by:
    - LS_SD_01

 # ------------------------------------------------------------
  # WPP_0043 — used by: LS_DD_01
  # ------------------------------------------------------------
  - id: WPP_0043
    tier: bilayer
    pattern:
    - deceptive
    - deceptive
    intent: provoke
    measure_profile:
      optimal: middle
      viable: close
      weak: long
    range_profile:
      reach: medium
      minimum_effective_measure: middle
    line_profile:
      primary_line: high
      secondary_line: low
    target_profile:
      primary_target: head
      secondary_target: lower_line
    timing_profile:
      speed: moderate
      commitment: medium
      recovery: moderate
    contact_profile:
      bind_quality: strong
      grapple_compatibility: good
      shield_interaction: fair
    threat_profile:
      armor_effectiveness: fair
      unarmored_effectiveness: excellent
      control_effectiveness: good
    risk_profile:
      close_risk: medium
      overcommit_risk: medium
      miss_recovery_risk: medium
    weapon_size_profile:
      size: medium
      inertia: medium
      maneuverability: medium
    damage_type_profile:
      primary: cutting
      secondary: piercing
      armor_interaction_bias: balanced
    weapon_control_profile:
      control_of_opponent: good
      resistance_to_control: good
      bind_dominance: strong
    grapple_profile:
      entry_capability: good
      control_capability: good
      anti_grapple: good
    wager_profile:
      wager_allowance: none
      wager_balance: balanced
      wager_riposte: balanced
      commitment_scaling: low
    prediction_profile:
      expects: opponent_reacts_high
      exploits: overcorrection
    state_effects:
      on_success: opponent_overcorrects
      on_failure: stabilizes
    used_by:
    - LS_DD_01

```