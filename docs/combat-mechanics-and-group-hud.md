# Combat Mechanics and Group HUD
*Started: 2026-05-02 — Placeholder document. Ideas to be developed.*

---

## Purpose

This document captures the intersection of combat mechanics design and Group HUD presentation.
Topics collected here span how combat state is computed, surfaced to the GM, and displayed
to players during a bout.

---

## Topics (to be developed)

---

## The Bout Card Display (Central HUD Area)

### Overview

The central area of the Group HUD — currently empty — will be populated during combat
with **Bout cards**: one card per active Bout, displayed in a vertically scrolling region.
Each Bout card is a combined, horizontally-oriented card showing both combatants side by
side. It serves as a visual confirmation aid for players and a play-by-play display for
the table.

The display has two functions:
1. **Declaration confirmation** — players can see their own choice and verify it was
   registered correctly before resolution
2. **Play-by-play narration** — as the exchange resolves, the card populates with
   outcomes, making the mechanics legible to everyone at the table

---

### Bout Card Layout

Each Bout card is horizontally oriented, divided into two sub-cards:

```
┌─────────────────────────────────────────────────────────┐
│  [PC Sub-card]              │  [NPC Sub-card]            │
│                             │                            │
│  Combatant name / identity  │  Combatant name / identity │
│  Package chosen             │  Package chosen            │
│  Defensive position         │  Defensive position        │
│  Wager amount               │  (Boss: wager amount)      │
│  ── plugin DSL fields ──    │  ── plugin DSL fields ──   │
│                             │                            │
│  ══════════ Resolution ══════════════════════════════    │
│  Outcome · Damage · Riposte · Wager result               │
└─────────────────────────────────────────────────────────┘
```

The PC combatant always appears on the left; the NPC opponent on the right.
The resolution strip spans the full width of the card and populates after both
sides have declared and the exchange has resolved.

**Plugin DSL fields**: The probabilistic input fields shown on each sub-card are
defined by the plugin YAML as a DSL. Different game systems can surface different
stats (e.g., strength modifier, skill rating, fatigue level). The card layout
provides a flexible field area; the plugin controls what appears in it.

---

### Central Area Arrangement

Bout cards are stacked vertically in a scrollable region, **grouped by PC**.
Each PC's Bout (or Bouts, if a combatant is engaged in multiple simultaneously)
appears together. Within a group, Bouts are ordered by declaration sequence.

```
┌── [PC 1] ────────────────────────────────────────────┐
│  Bout card: PC1 vs. NPC-A                            │
└──────────────────────────────────────────────────────┘
┌── [PC 2] ────────────────────────────────────────────┐
│  Bout card: PC2 vs. NPC-B                            │
└──────────────────────────────────────────────────────┘
┌── [PC 3] ────────────────────────────────────────────┐
│  Bout card: PC3 vs. NPC-C                            │
│  Bout card: PC3 vs. NPC-D  (second simultaneous Bout)│
└──────────────────────────────────────────────────────┘
```

**Design note — NPC appearing in multiple groups**: If one NPC is simultaneously in
a Bout with two different PCs, that NPC's sub-card will appear in both groups. This
is intentional — each Bout is independent — but it means the same NPC may show
different states in each group depending on how each exchange resolves.

---

### Open Questions

**HUD-OQ-1: Declaration reveal timing (important — affects both UX and fairness)**

When and how do the package choices become visible on the Bout card? Options:

*Option A — Simultaneous blind reveal (recommended)*
Both sub-cards appear face-down as each side declares. When the declaration
window closes, both flip simultaneously. This is the fairest approach (no late
declarer can react to opponent's choice) and creates a dramatic reveal moment
at the table. Recommended as the default.

*Option B — Sequential reveal (attacker first)*
The attacker's card flips when they declare; the defender then has a brief
adjustment window before their card flips. This gives defenders a tactical
advantage — intentional if the game design favours reactive defense, but it
breaks the simultaneity principle of the beat mechanic.

*Option C — Fully hidden until resolution*
Neither card is visible until the full exchange resolves. Removes the
confirmation function and the dramatic reveal; not recommended.

**Recommendation**: Option A as default. Option B as a plugin-configurable
variant for game designers who want to favour reactive play.

---

**HUD-OQ-2: Temporal card states and presentation sequence**

A Bout card passes through several distinct visual states during an exchange.
The exact sequence, timing, and animation between states needs to be designed.
Suggested state sequence:

| State | Description |
|---|---|
| `empty` | Bout slot exists but no declarations yet; shows combatant names only |
| `declaring` | One or both sides have submitted; submitted sub-card shows face-down |
| `revealed` | Declaration window closed; both sub-cards flip simultaneously; packages visible |
| `resolving` | System computing outcome; plugin DSL fields populate (possibly animated) |
| `resolved` | Full result displayed — outcome, damage, riposte, wager result |
| `archived` | Card fades or collapses after a display hold period; entry moves to Battle Log |

Questions within this: How long is the hold on `resolved` before archiving? Is there
a manual GM dismiss, or auto-timeout? Can the GM expand an archived card from the
Battle Log? Does the resolution animate field-by-field or appear all at once?

---

**HUD-OQ-3: Card field content for freestyle exchanges**

When a combatant is in `freestyle-grapple`, `freestyle-armed`, or `freestyle-unarmed`
defense, the WPP profile fields will be absent and the package name area shows only the
mode name. What does a freestyle sub-card look like visually? A greyed-out card? A
minimal card with just the combatant name and the mode label? This should feel distinct
from a skilled `honed-war-form` declaration without looking like an error state.

---

*See also: The Wager Mechanic section for how wager amount and riposte results
are surfaced in the resolution strip.*

---

## The Wager Mechanic

### Overview

When a PC (or boss NPC) selects a `honed-war-form` attack package, they may optionally
wager a quantity of a designated resource pool against the outcome of the exchange. The
wager represents psychological commitment: how motivated the combatant is to execute this
particular strategy.

A wager of 0 is always valid and carries no risk. Wagering above 0 introduces both upside
and downside.

Wagering is not available in `freestyle-grapple` or `freestyle-armed` offense modes — only
when a specific learned package has been selected. Additionally, wagering is gated at the
**WPP profile level**: each package's linked `GenericWeaponPatternParameterCatalogue` profile
carries a `wager_profile` block that may restrict or prohibit wagering entirely for that
package (see Wager Profile below).

---

### Eligibility

| Combatant type | Can wager? |
|---|---|
| PC | Yes, if package's WPP `wager_allowance` ≠ `none` |
| NPC flagged as boss | Yes, same profile-level restriction applies |
| Regular NPC | No |

Two-gate model: the combatant type must be eligible **and** the selected package's WPP
profile must permit wagering. A PC selecting a package with `wager_allowance: none` (e.g.,
High Feint / WPP_0031) cannot wager on that exchange.

---

### The Wager Resource Pool

The plugin YAML specifies which pool backs the wager, and the global wager cap.
*Definitive plugin YAML schema for wager configuration: `plugin-manager-design.md`.*

Two pool type options:

| Pool type | Description |
|---|---|
| Survival pool | Hit points or equivalent — wagering is existentially costly |
| Courage / morale pool | A separate resource that may refill — lower existential stakes, different feel |

The pool identity and the wager cap (maximum wager as a fraction of remaining pool,
default: half) are both specified in plugin YAML.

---

### Wager Amount

Declared at the same time as package selection, before the exchange resolves.
Range: `0` to `min(wagerCap, remainingPool, profileAllowanceCap)`.

- `wagerCap` — plugin YAML global limit (default: half remaining pool)
- `profileAllowanceCap` — per-package ceiling set by WPP `wager_allowance` (`none` | `small` | `medium` | `large`)

The wager amount is stored in **critter machine context**, not as a machine state.

---

### Wager Profile (WPP)

Each package in `WeaponSpecificTieredPackageCatalogue_rich.yaml` references a profile in
`GenericWeaponPatternParameterCatalogue.yaml` via `profile_id`. The profile's `wager_profile`
block governs wager behavior for that package:

| Field | Values | Meaning |
|---|---|---|
| `wager_allowance` | `none` · `small` · `medium` · `large` | Whether wagering is permitted and at what scale. `none` prohibits wagering entirely. |
| `wager_balance` | `hitOverDamage` · `damageOverHit` · `balanced` · `remiseOnly` | How the wager bonus is distributed — hit chance vs. damage vs. both vs. follow-up only. **Profile-determined, not probabilistic.** |
| `wager_riposte` | `hitOverDamage` · `damageOverHit` · `balanced` | How the riposte benefit is weighted on wager failure. |
| `commitment_scaling` | `low` · `medium` · `high` | How steeply wager exposure scales with commitment level. High means a large wager creates dramatically higher riposte risk. |

**`wager_balance` resolves WM-OQ-1** — the bonus split between hit chance and damage is
not probabilistic; it is determined by the package's WPP profile. A player choosing a
`hitOverDamage` package who wagers is primarily buying success probability; a `damageOverHit`
package buys damage amplification. `remiseOnly` means the wager only empowers a follow-up
action if the first step is parried rather than landing.

---

### Resolution Paths

#### Path 1 — Wager = 0
Package executes normally. No riposte risk regardless of outcome. Wager has no effect
on success or damage.

#### Path 2 — Wager > 0, package compatible with opponent's action
The system determines probabilistically how the wager benefits the attacker:
- As a bonus to the success roll
- As a bonus to damage dealt
- As both

Exact probability distribution: **TBD** (open design question — see below).

If the package **fails** despite compatibility (math goes against the attacker):
→ Riposte triggered (see Riposte below).

#### Path 3 — Wager > 0, package incompatible with opponent's action
System falls back to the `freestyle-armed` (or `freestyle-grapple`) mode.
- Freestyle **succeeds** → no riposte. Wager has no effect.
- Freestyle **fails** → Riposte triggered (see Riposte below).

---

### Riposte

Triggered when a wager > 0 exchange fails (either directly or after naive fallback).

- **Probabilistic** — not guaranteed to succeed
- **Influenced by** opponent stats and level
- **Wager affects** both riposte probability and riposte damage
- **Not mitigated** by the attacker's current `defensive_position` — the risk was
  accepted at wager time; the player could always have wagered 0

On a successful riposte: wager amount (or a function of it, per plugin rules) is
added to damage dealt to the wagering combatant.

---

### Design Notes

- The mechanic rewards tactical confidence — committing to a strategy and backing it
  with resources — while creating genuine downside for miscalculation
- A 0 wager is always available, making the mechanic opt-in per exchange
- Boss NPCs having access to this creates asymmetric threat — a boss that wagers
  signals escalation and makes the exchange feel meaningfully different
- The same pool can back both survival and wager loss, making HP management a
  dual-purpose concern for aggressive players
- `wager_allowance: none` on a WPP profile is a meaningful design signal — some
  packages are inherently too tentative (feints, invitations) or too recovery-sensitive
  to support wagering; the profile enforces this rather than relying on player judgment
- `wager_balance: remiseOnly` creates a distinct tactical flavor: the wager doesn't
  help the primary action land but supercharges the follow-up if it's parried

---

### Open Questions

**WM-OQ-1: ~~Probabilistic bonus allocation~~ — RESOLVED**
The bonus split is **profile-determined**, not probabilistic. The WPP `wager_balance`
field (`hitOverDamage` | `damageOverHit` | `balanced` | `remiseOnly`) specifies how the
wager is applied for each package. Players cannot override this — the package's profile
dictates the wager flavor. Remaining question: the exact numerical scaling (how much does
a `small` vs. `large` wager amount shift the modifier?) still needs defining.

**WM-OQ-2: Boss flag mechanics**
How does the GM set the boss flag on an NPC? Plugin YAML? Runtime GM action in the
dashboard? Does the flag persist across the session or can it be toggled mid-combat?

**WM-OQ-3: Wager declaration timing and visibility**
Is the wager declared blind (simultaneously with opponent defense selection) or
sequentially? What is visible to other players and the GM on the Group HUD during
the declaration window?

**WM-OQ-4: Wager and the naive fallback**
When a package is incompatible and falls back to naive, does the player know this
happened before the naive resolves, or only after? Does knowing affect the feel
of the mechanic?

---

*See also: `Longsword-Attack-Pattern-Library.md`, `tmcrittermaker-design-state.md`, `battle-model-architecture.md`*
