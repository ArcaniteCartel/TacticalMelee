/**
 * Response Stage Handler
 *
 * Handles stages of type 'response'.
 * The reactive player-decision window each round. Players declare responses
 * to declared actions (counter-moves, reactions, defensive preparations).
 * Active every round.
 *
 * Core responsibilities (future):
 *   - Present available response options triggered by declared actions
 *   - Collect and validate response declarations within the countdown
 *   - Track per-player response state and push live updates to the Group HUD
 *   - Apply default (no response) to any player who does not declare in time
 *
 * Current state: hooks stubbed. Future responsibilities noted in TODOs.
 */

import type { StageHandler } from './StageHandler'
import { logger } from '../logger'

export const ResponseHandler: StageHandler = {
  type: 'response',

  onEnter(config, context): void {
    console.log(`[Stage:response] onEnter — "${config.name}" (round ${context.round}, timer ${config.timerSeconds}s)`)
    logger.info(
      {
        hook: 'onEnter',
        stageType: 'response',
        stageName: config.name,
        round: context.round,
        timerSeconds: config.timerSeconds,
        beats: config.beats,
      },
      'Response stage entered'
    )
    // TODO: derive available response options from declared actions
    // TODO: push response option sets to individual player HUDs
    // TODO: initialise per-player response tracking for this stage
  },

  onTick(config, context): void {
    console.log(`[Stage:response] onTick — "${config.name}" (round ${context.round}, ${context.timerSecondsRemaining}s remaining)`)
    logger.debug(
      {
        hook: 'onTick',
        stageType: 'response',
        stageName: config.name,
        round: context.round,
        timerSecondsRemaining: context.timerSecondsRemaining,
        beatsRemaining: context.beatsRemaining,
      },
      'Response stage tick'
    )
    // TODO: check for completed player responses and update HUD status per player
  },

  onExit(config, context): void {
    console.log(`[Stage:response] onExit — "${config.name}" (round ${context.round})`)
    logger.info(
      {
        hook: 'onExit',
        stageType: 'response',
        stageName: config.name,
        round: context.round,
        timerSecondsRemaining: context.timerSecondsRemaining,
        beatsRemaining: context.beatsRemaining,
      },
      'Response stage exited'
    )
    // TODO: finalise all response declarations (treat undeclared as no-response)
    // TODO: pass collected responses alongside action declarations to Resolution stage
  },
}
