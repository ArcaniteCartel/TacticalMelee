/**
 * GM Release Stage Handler
 *
 * Handles stages of type 'gm-release'.
 * These stages advance only when the GM explicitly releases them — no timer.
 * Core responsibility: GM narrative window. The GM controls the pace entirely.
 *
 * Current state: hooks stubbed. Future responsibilities noted in TODOs.
 */

import type { StageHandler } from './StageHandler'
import { logger } from '../logger'

export const GmReleaseHandler: StageHandler = {
  type: 'gm-release',

  onEnter(config, context): void {
    console.log(`[Stage:gm-release] onEnter — "${config.name}" (round ${context.round})`)
    logger.info(
      { hook: 'onEnter', stageType: 'gm-release', stageName: config.name, round: context.round },
      'GM Release stage entered'
    )
    // TODO: push scene/narrative context to Group HUD message area
    // TODO: notify player HUDs that a GM narrative window is open
  },

  onTick(config, context): void {
    // gm-release stages have no timer — this hook should not fire under normal operation
    console.log(`[Stage:gm-release] onTick — "${config.name}" (round ${context.round}) [unexpected]`)
    logger.warn(
      { hook: 'onTick', stageType: 'gm-release', stageName: config.name, round: context.round },
      'GM Release stage received a tick — this is unexpected'
    )
  },

  onExit(config, context): void {
    console.log(`[Stage:gm-release] onExit — "${config.name}" (round ${context.round})`)
    logger.info(
      { hook: 'onExit', stageType: 'gm-release', stageName: config.name, round: context.round },
      'GM Release stage exited'
    )
    // TODO: finalise any narrative state before advancing
  },
}
