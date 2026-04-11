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
        description:
          'The GM is setting the scene. Listen for narrative context before the encounter begins.',
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
