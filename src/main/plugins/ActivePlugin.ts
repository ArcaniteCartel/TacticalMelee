/**
 * ActivePlugin
 *
 * The single source of truth for the currently loaded game mechanic plugin.
 * Right now returns hardcoded Standard plugin data from memory.
 * Later: reads from the database / YAML module.
 *
 * All other modules query this class — never access plugin data directly.
 *
 * Beat budget rationale (Standard plugin, 60 beats per TC):
 *   Pre-Encounter  4b  — short window; players already know their loadouts
 *   Action         4b  — the primary decision window
 *   Response       4b  — reactive; options are narrower than a full action
 *   System stages  0b  — computation only; no in-world time is consumed
 *   Action Tier    8b  — Action + Response per tier; 7 tiers fit exactly in 56b (60 − 4 preamble)
 *
 * Timer rationale:
 *   Pre-Encounter  20s  — enough for a simple swap or consumption decision
 *   Action         30s  — enough to read the board and pick a meaningful action
 *   Response       30s  — same window as action; responses can be complex
 */

import type { PluginConfig, StageDefinition } from '../../shared/types'

export class ActivePlugin {
  private static readonly STANDARD_CONFIG: PluginConfig = {
    pluginName: 'TacticalMelee Standard',
    // 60 beats represents one full in-world Tactical Cycle (~1 minute of combat time)
    beatsPerTC: 60,
    // StagePlanner will never pro-rate an Action/Response timer below this value.
    // 5 s is the practical floor: shorter than this gives players no meaningful decision window.
    minAdjustedTimerSeconds: 5,
    stages: [
      {
        id: 'gm-narrative',
        name: 'GM Narrative',
        type: 'gm-release',
        beats: 0,           // narrative time is free — does not charge the beat clock
        canPass: true,      // GM can pass (same effect as release — 0 beats either way)
        description:
          'The GM is setting the scene. Listen for narrative context before the encounter begins.',
        roundVisibility: [], // active every round — GM always has an opening narrative window
        spinTime: 0,         // no post-completion pause; advance immediately on release
      },
      {
        id: 'pre-encounter',
        name: 'Pre-Encounter',
        type: 'timed',
        beats: 4,           // 4b of in-world time consumed (players adjusting gear, positioning)
        timerSeconds: 20,   // 20 real seconds = 1 beat every 5s
        canPass: true,
        description:
          'Make pre-combat adjustments — swap weapons, consume items, or declare readiness. 4 beats remain.',
        roundVisibility: ['A1', 'I2'], // round 1 only — subsequent rounds begin mid-combat, no setup window
        spinTime: 3,        // 3s for surprise/initiative system stages to begin queuing
      },
      {
        id: 'surprise-determination',
        name: 'Surprise Determination',
        type: 'surprise-determination',
        beats: 0,           // system computation — no in-world time passes
        canPass: true,      // GM can skip if surprise is not relevant to the encounter
        description:
          'The system is determining surprise conditions for this encounter.',
        roundVisibility: ['A1', 'I2'], // round 1 only — surprise only applies at encounter start
        spinTime: 3,        // computation window for awareness/concealment evaluation
      },
      {
        id: 'initiative-determination',
        name: 'Initiative Determination',
        type: 'initiative-determination',
        beats: 0,           // system computation — no in-world time passes
        canPass: true,      // GM can skip if initiative order is already established
        description:
          'The system is calculating initiative order for all combatants.',
        roundVisibility: [], // every round — initiative can change each TC
        spinTime: 3,        // computation window for initiative rolling and ordering
      },
      {
        id: 'action',
        name: 'Action',
        type: 'action',
        beats: 4,           // 4b — matches Response; each tier costs 8b total (Action + Response)
        timerSeconds: 30,   // 30s player clock; GM hold phase precedes this (see stageGMHold)
        canPass: true,      // GM can skip if no meaningful action is possible this round
        description:
          'Declare your action for this round. You have 30 seconds.',
        roundVisibility: [], // every round
        spinTime: 1,        // brief pause before resolution begins; enough to feel like a beat
      },
      {
        id: 'response',
        name: 'Response',
        type: 'response',
        beats: 4,           // 4b — less than action; responses are reactive and more constrained
        timerSeconds: 30,   // same 30s window as action
        canPass: true,      // GM can skip if no responses are applicable
        description:
          'Declare your response to the current situation. You have 30 seconds.',
        roundVisibility: [], // every round
        spinTime: 1,        // brief pause before resolution begins
      },
      {
        id: 'resolution',
        name: 'Resolution',
        type: 'resolution',
        beats: 0,           // resolution is instantaneous in-world; math happens outside time
        description:
          'The system is resolving all declared actions and responses.',
        roundVisibility: [], // every round
        spinTime: 3,        // resolution can be computationally intensive; 3s minimum window
        // Note: no canPass — resolution is mandatory and cannot be skipped
      },
    ],
  }

  /** Returns the full plugin configuration including all stage definitions. */
  getConfig(): PluginConfig {
    return ActivePlugin.STANDARD_CONFIG
  }

  /** Returns the ordered stage definitions for the current plugin. */
  getStages(): StageDefinition[] {
    return ActivePlugin.STANDARD_CONFIG.stages
  }

  /** Returns the number of beats per Tactical Cycle (e.g. 72 for the Standard plugin). */
  getBeatsPerTC(): number {
    return ActivePlugin.STANDARD_CONFIG.beatsPerTC
  }
}
