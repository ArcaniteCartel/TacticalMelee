/**
 * ActivePlugin
 *
 * The single source of truth for the currently loaded game mechanic plugin.
 * Right now returns hardcoded Standard plugin data from memory.
 * Later: reads from the database / YAML module.
 *
 * All other modules query this class — never access plugin data directly.
 */

import type { PluginConfig, StageDefinition } from '../../shared/types'

export class ActivePlugin {
  private static readonly STANDARD_CONFIG: PluginConfig = {
    pluginName: 'TacticalMelee Standard',
    beatsPerTC: 72,
    stages: [
      {
        id: 'gm-narrative',
        name: 'GM Narrative',
        type: 'gm-release',
        beats: 0,
        canPass: true,
        description:
          'The GM is setting the scene. Listen for narrative context before the encounter begins.',
        roundVisibility: [],
        spinTime: 0,
      },
      {
        id: 'pre-encounter',
        name: 'Pre-Encounter',
        type: 'timed',
        beats: 4,
        timerSeconds: 20,
        canPass: true,
        description:
          'Make pre-combat adjustments — swap weapons, consume items, or declare readiness. 4 beats remain.',
        roundVisibility: ['A1', 'I2'],
        spinTime: 3,
      },
      {
        id: 'surprise-determination',
        name: 'Surprise Determination',
        type: 'surprise-determination',
        beats: 0,
        canPass: true,
        description:
          'The system is determining surprise conditions for this encounter.',
        roundVisibility: ['A1', 'I2'],
        spinTime: 3,
      },
      {
        id: 'initiative-determination',
        name: 'Initiative Determination',
        type: 'initiative-determination',
        beats: 0,
        canPass: true,
        description:
          'The system is calculating initiative order for all combatants.',
        roundVisibility: [],
        spinTime: 3,
      },
      {
        id: 'action',
        name: 'Action',
        type: 'action',
        beats: 6,
        timerSeconds: 30,
        canPass: true,
        description:
          'Declare your action for this round. You have 30 seconds.',
        roundVisibility: [],
        spinTime: 1,
      },
      {
        id: 'response',
        name: 'Response',
        type: 'response',
        beats: 4,
        timerSeconds: 30,
        canPass: true,
        description:
          'Declare your response to the current situation. You have 30 seconds.',
        roundVisibility: [],
        spinTime: 1,
      },
      {
        id: 'resolution',
        name: 'Resolution',
        type: 'resolution',
        beats: 0,
        description:
          'The system is resolving all declared actions and responses.',
        roundVisibility: [],
        spinTime: 3,
      },
    ],
  }

  getConfig(): PluginConfig {
    return ActivePlugin.STANDARD_CONFIG
  }

  getStages(): StageDefinition[] {
    return ActivePlugin.STANDARD_CONFIG.stages
  }

  getBeatsPerTC(): number {
    return ActivePlugin.STANDARD_CONFIG.beatsPerTC
  }
}
