/**
 * Application Logger
 *
 * Pino logger instance for the main process.
 * - Dev:  pretty-printed to stdout with colour
 * - Prod: structured JSON (suitable for log aggregators)
 */

import pino from 'pino'
import pretty from 'pino-pretty'
import { is } from '@electron-toolkit/utils'

// Use pino-pretty as a synchronous stream in dev — avoids worker threads,
// which require Node 19.9+ (tracingChannel) not available in Electron 28 / Node 18.
export const logger = pino(
  {
    name: 'tactical-melee',
    level: is.dev ? 'debug' : 'info',
  },
  is.dev
    ? pretty({ colorize: true, sync: true })
    : undefined
)
