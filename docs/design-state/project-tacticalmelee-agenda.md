---
name: TacticalMelee — Design Agenda
description: Current design frontier for TacticalMelee. Five areas in priority order. Established 2026-05-12.
type: project
originSessionId: d5073ff7-af44-43d0-91b4-fa0b4eba9ef2
---
# TacticalMelee — Design Agenda
*Established: 2026-05-12*

Five design areas that need to be worked through before implementation begins. All are design-only — no code is being written yet.

---

## 1. Bout Resolution — Finish the Decision Tree
`docs/bout-resolution-decision-tree.md`

The 13-step decision tree algorithm exists but key design decisions within the steps have not been made. Need to go through each phase and nail down the choices.

---

## 2. Critter YAML — Complete the Primitive Set
`docs/critter-registry-design.md`

- **CR-OQ-1**: Stat type taxonomy — where is "strength is an accumulator" declared? (Critter YAML vs Plugin YAML/CreatureMappingRegistry vs shared schema). Must resolve before Factory implementation.
- **CR-OQ-2**: Primitive enumeration is incomplete — more primitives likely undiscovered.
- **CR-OQ-3**: Weapon state transitions — not yet designed (deferred until primitives complete).
- **CR-OQ-4**: Explicit declarative YAML vocabulary — the escape-hatch form not yet designed.
- **PY-OQ-1**: Condition effect schema — what can a condition effect do mechanically? (Blocks body part tier finalization.)
- **PY-OQ-2**: Threshold trigger value schema — fixed number, fraction, expression, bidirectional?

---

## 3. CreatureMappingRegistry / Plugin YAML Creature Section
`docs/plugin-manager-design.md`

- Full creature type schema in plugin YAML (what fields beyond name/class/biases?)
- Stat definitions: how does the game designer declare that `strength` is an `accumulator` in a `humanoid`?
- Ties directly to CR-OQ-1 above — must resolve together.

---

## 4. DSL Token Scope (Cross-Cutting)
`docs/plugin-manager-design.md` · `docs/tmcrittermaker-design-state.md` OQ-1, OQ-2

When a rule references `{attacker.str_mod}` vs `{defender.armor}`, who resolves the binding and how? The Bout engine passes actor references into the registry call, but the exact binding convention is not yet designed. This affects:
- How the Resolver validates token references at load time
- How the Rules Registry receives attacker/defender context at runtime
- Whether XState v5's `system` construct is the right mechanism for cross-actor access

---

## 5. PluginContext TypeScript Interface
`docs/plugin-manager-design.md` (PluginContext Interface section, currently TBD)

The formal TypeScript interface definition for PluginContext. This is the deliverable that closes areas 2 and 3 — it cannot be defined until the Critter YAML primitives, creature type schema, and stat type taxonomy are resolved.

---

## Not Yet Started (explicitly deferred)
- Stage pipeline in plugin YAML (currently hardcoded in ActivePlugin.ts)
- Resolver design (follows from PluginContext interface)
- Ranged weapons (different slot/state model)
- Multi-hex critter geometry
- AI behavior state machines (separate project)
- Guard/evasion package and profile formal ID schemes
