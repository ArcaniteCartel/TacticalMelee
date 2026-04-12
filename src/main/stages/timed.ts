/**
 * Timed Stage Handler
 *
 * Handles stages of type 'timed'.
 * These stages advance automatically when the countdown reaches zero,
 * or early via GM pass / player pass (if canPass is set).
 *
 * Core responsibility: time-pressured decision window (e.g. Pre-Encounter).
 * Players and GM act within a shared countdown. Individual inaction has consequences
 * defined per stage by the plugin (e.g. drop to next initiative tier).
 *
 * Current state: hooks stubbed. Future responsibilities noted in TODOs.
 */

import type { StageHandler } from './StageHandler'
import { logger } from '../logger'

export const TimedHandler: StageHandler = {
  type: 'timed',

  onEnter(config, context): void {
    console.log(`[Stage:timed] onEnter — "${config.name}" (round ${context.round}, timer ${config.timerSeconds}s)`)
    logger.info(
      {
        hook: 'onEnter',
        stageType: 'timed',
        stageName: config.name,
        round: context.round,
        timerSeconds: config.timerSeconds,
        beats: config.beats,
      },
      'Timed stage entered'
    )
    // TODO: invoke Choco to determine available pre-encounter actions for each player
    // TODO: push available action sets to individual player HUDs
    // TODO: initialise per-player decision tracking for this stage
  },

  onTick(config, context): void {
    console.log(`[Stage:timed] onTick — "${config.name}" (round ${context.round}, ${context.timerSecondsRemaining}s remaining)`)
    logger.debug(
      {
        hook: 'onTick',
        stageType: 'timed',
        stageName: config.name,
        round: context.round,
        timerSecondsRemaining: context.timerSecondsRemaining,
        beatsRemaining: context.beatsRemaining,
      },
      'Timed stage tick'
    )
    // TODO: check for completed player decisions and update HUD status per player
    // TODO: trigger tier-demotion logic for players who exhaust their window (initiative stages)
  },

  onExit(config, context): void {
    console.log(`[Stage:timed] onExit — "${config.name}" (round ${context.round})`)
    logger.info(
      {
        hook: 'onExit',
        stageType: 'timed',
        stageName: config.name,
        round: context.round,
        timerSecondsRemaining: context.timerSecondsRemaining,
      },
      'Timed stage exited'
    )
    // TODO: finalise all player decisions for this stage (treat undecided as no-action)
    // TODO: pass collected decisions/outcomes to the next stage via context or event payload
  },
}
