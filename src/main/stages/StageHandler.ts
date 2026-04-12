/**
 * StageHandler Interface
 *
 * The contract every stage type registered in the StageRegistry must satisfy.
 * System logic for a stage type lives in its handler — not in the plugin.
 * The plugin supplies the StageDefinition (config); the handler supplies the behaviour.
 */

import type { StageDefinition } from '../../shared/types'
import type { TCContext } from '../tc/tcMachine'

export interface StageHandler {
  /** The stage type string this handler is responsible for. Must match StageDefinition.type. */
  readonly type: string

  /**
   * Called when a stage of this type becomes active.
   * Use for setup: trigger calculations, push initial state to HUDs, start external processes.
   */
  onEnter: (config: StageDefinition, context: TCContext) => void

  /**
   * Called on each timer tick while this stage is active.
   * Only fires for timed stages under normal operation.
   * Use for per-second work: polling player decisions, updating derived state.
   */
  onTick: (config: StageDefinition, context: TCContext) => void

  /**
   * Called when a stage of this type completes (for any reason: timer expiry, GM release, pass).
   * Use for teardown: finalise results, write outcomes, pass data to the next stage.
   */
  onExit: (config: StageDefinition, context: TCContext) => void
}
