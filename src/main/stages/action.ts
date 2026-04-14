/**
 * Action Stage Handler
 *
 * Handles stages of type 'action'.
 * The primary player-decision window each round. Players declare their intended
 * actions within the countdown. Undeclared players are subject to default outcomes.
 * Active every round.
 *
 * Core responsibilities (future):
 *   - Present available action options to each player (per initiative order)
 *   - Collect and validate player declarations within the countdown
 *   - Track per-player decision state and push live updates to the Group HUD
 *   - Apply default action to any player who does not declare in time
 *
 * Current state: hooks stubbed. Future responsibilities noted in TODOs.
 */

import type { StageHandler } from './StageHandler'
import { logger } from '../logger'

export const ActionHandler: StageHandler = {
  type: 'action',

  onEnter(config, context): void {
    console.log(`[Stage:action] onEnter — "${config.name}" (round ${context.round}, timer ${config.timerSeconds}s)`)
    logger.info(
      {
        hook: 'onEnter',
        stageType: 'action',
        stageName: config.name,
        round: context.round,
        timerSeconds: config.timerSeconds,
        beats: config.beats,
      },
      'Action stage entered'
    )
    // TODO: query available actions per combatant from initiative list
    // TODO: push action option sets to individual player HUDs
    // TODO: initialise per-player decision tracking for this stage
  },

  onTick(config, context): void {
    console.log(`[Stage:action] onTick — "${config.name}" (round ${context.round}, ${context.timerSecondsRemaining}s remaining)`)
    logger.debug(
      {
        hook: 'onTick',
        stageType: 'action',
        stageName: config.name,
        round: context.round,
        timerSecondsRemaining: context.timerSecondsRemaining,
        beatsRemaining: context.beatsRemaining,
      },
      'Action stage tick'
    )
    // TODO: check for completed player decisions and update HUD status per player
    // TODO: warn players approaching time limit
  },

  onExit(config, context): void {
    console.log(`[Stage:action] onExit — "${config.name}" (round ${context.round})`)
    logger.info(
      {
        hook: 'onExit',
        stageType: 'action',
        stageName: config.name,
        round: context.round,
        timerSecondsRemaining: context.timerSecondsRemaining,
        beatsRemaining: context.beatsRemaining,
      },
      'Action stage exited'
    )
    // TODO: finalise all action declarations (treat undeclared as default/no-action)
    // TODO: pass collected action declarations to Resolution stage
  },
}
