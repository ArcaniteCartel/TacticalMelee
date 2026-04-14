/**
 * Initiative Determination Stage Handler
 *
 * Handles stages of type 'initiative-determination'.
 * Calculates and establishes the initiative order for all combatants each round.
 * Active every round.
 *
 * Core responsibilities (future):
 *   - Roll and evaluate initiative for each combatant
 *   - Resolve ties using tiebreaker rules defined by the plugin
 *   - Publish the ordered initiative list to the Group HUD and player HUDs
 *
 * Current state: hooks stubbed. Future responsibilities noted in TODOs.
 */

import type { StageHandler } from './StageHandler'
import { logger } from '../logger'

export const InitiativeDeterminationHandler: StageHandler = {
  type: 'initiative-determination',

  onEnter(config, context): void {
    console.log(`[Stage:initiative-determination] onEnter — "${config.name}" (round ${context.round})`)
    logger.info(
      { hook: 'onEnter', stageType: 'initiative-determination', stageName: config.name, round: context.round },
      'Initiative Determination stage entered'
    )
    // TODO: roll initiative for all combatants using plugin-defined formula
    // TODO: resolve ties per plugin tiebreaker rules
    // TODO: publish ordered initiative list to Group HUD and all player HUDs
  },

  onTick(config, context): void {
    // initiative-determination has no timer — this hook should not fire under normal operation
    console.log(`[Stage:initiative-determination] onTick — "${config.name}" (round ${context.round}) [unexpected]`)
    logger.warn(
      { hook: 'onTick', stageType: 'initiative-determination', stageName: config.name, round: context.round },
      'Initiative Determination stage received a tick — this is unexpected'
    )
  },

  onExit(config, context): void {
    console.log(`[Stage:initiative-determination] onExit — "${config.name}" (round ${context.round})`)
    logger.info(
      { hook: 'onExit', stageType: 'initiative-determination', stageName: config.name, round: context.round },
      'Initiative Determination stage exited'
    )
    // TODO: finalise initiative order and pass to Action stage context
  },
}
