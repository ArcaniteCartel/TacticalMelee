/**
 * Surprise Determination Stage Handler
 *
 * Handles stages of type 'surprise-determination'.
 * Determines whether any combatants are surprised at the start of the encounter.
 * Active only in round 1.
 *
 * Core responsibilities (future):
 *   - Evaluate each combatant's awareness vs. concealment conditions
 *   - Apply surprised status to applicable combatants
 *   - Broadcast surprise results to HUDs
 *
 * Current state: hooks stubbed. Future responsibilities noted in TODOs.
 */

import type { StageHandler } from './StageHandler'
import { logger } from '../logger'

export const SurpriseDeterminationHandler: StageHandler = {
  type: 'surprise-determination',

  onEnter(config, context): void {
    console.log(`[Stage:surprise-determination] onEnter — "${config.name}" (round ${context.round})`)
    logger.info(
      { hook: 'onEnter', stageType: 'surprise-determination', stageName: config.name, round: context.round },
      'Surprise Determination stage entered'
    )
    // TODO: query combatant awareness and concealment states
    // TODO: compute and apply surprised status per combatant
    // TODO: broadcast surprise results to Group HUD and player HUDs
  },

  onTick(config, context): void {
    // surprise-determination has no timer — this hook should not fire under normal operation
    console.log(`[Stage:surprise-determination] onTick — "${config.name}" (round ${context.round}) [unexpected]`)
    logger.warn(
      { hook: 'onTick', stageType: 'surprise-determination', stageName: config.name, round: context.round },
      'Surprise Determination stage received a tick — this is unexpected'
    )
  },

  onExit(config, context): void {
    console.log(`[Stage:surprise-determination] onExit — "${config.name}" (round ${context.round})`)
    logger.info(
      { hook: 'onExit', stageType: 'surprise-determination', stageName: config.name, round: context.round },
      'Surprise Determination stage exited'
    )
    // TODO: finalise surprise outcomes before pipeline advances
  },
}
