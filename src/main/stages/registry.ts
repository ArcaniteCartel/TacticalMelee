/**
 * Stage Registry
 *
 * Maps stage type identifiers to their system-owned handler implementations.
 * This is the authoritative index of all stage types the system supports.
 *
 * Adding a new stage type:
 *   1. Create a handler module in src/main/stages/ implementing StageHandler
 *   2. Import it here and add one entry to the map
 *   Nothing else needs to change.
 *
 * Plugins select from these types by name — they never contain executable logic.
 */

import type { StageHandler } from './StageHandler'
import { GmReleaseHandler }              from './gmRelease'
import { TimedHandler }                  from './timed'
import { SurpriseDeterminationHandler }  from './surpriseDetermination'
import { InitiativeDeterminationHandler } from './initiativeDetermination'
import { ActionHandler }                 from './action'
import { ResponseHandler }               from './response'
import { ResolutionHandler }             from './resolution'

export const StageRegistry: Record<string, StageHandler> = {
  'gm-release':               GmReleaseHandler,
  'timed':                    TimedHandler,
  'surprise-determination':   SurpriseDeterminationHandler,
  'initiative-determination': InitiativeDeterminationHandler,
  'action':                   ActionHandler,
  'response':                 ResponseHandler,
  'resolution':               ResolutionHandler,
}
