/**
 * Resolution Stage Handler
 *
 * Handles stages of type 'resolution'.
 * Resolves all declared actions and responses into concrete outcomes.
 * This is the system's core combat mathematics stage. Active every round.
 * Auto-advances to spin (no manual trigger required).
 *
 * Core responsibilities (future):
 *   - Apply declared actions against declared responses (attack vs. defence, etc.)
 *   - Compute damage, status effects, resource changes per combatant
 *   - Evaluate win/loss/continuation conditions
 *   - Broadcast round outcome summary to Group HUD and all player HUDs
 *
 * Current state: hooks stubbed. Future responsibilities noted in TODOs.
 */

import type { StageHandler } from './StageHandler'
import { logger } from '../logger'

export const ResolutionHandler: StageHandler = {
  type: 'resolution',

  onEnter(config, context): void {
    console.log(`[Stage:resolution] onEnter — "${config.name}" (round ${context.round})`)
    logger.info(
      { hook: 'onEnter', stageType: 'resolution', stageName: config.name, round: context.round },
      'Resolution stage entered'
    )
    // TODO: retrieve collected action and response declarations from context
    // TODO: invoke combat resolution engine (damage, status effects, resource changes)
    // TODO: evaluate win/loss/continuation conditions
    // TODO: broadcast round outcome summary to Group HUD and all player HUDs
    // TODO: send SPIN_COMPLETE when async resolution finishes
  },

  onTick(config, context): void {
    // resolution has no timer — this hook should not fire under normal operation
    console.log(`[Stage:resolution] onTick — "${config.name}" (round ${context.round}) [unexpected]`)
    logger.warn(
      { hook: 'onTick', stageType: 'resolution', stageName: config.name, round: context.round },
      'Resolution stage received a tick — this is unexpected'
    )
  },

  onExit(config, context): void {
    console.log(`[Stage:resolution] onExit — "${config.name}" (round ${context.round})`)
    logger.info(
      { hook: 'onExit', stageType: 'resolution', stageName: config.name, round: context.round },
      'Resolution stage exited'
    )
    // TODO: confirm all outcomes are committed before pipeline advances to next round
  },
}
