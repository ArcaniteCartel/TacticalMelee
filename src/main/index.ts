import { app, shell, BrowserWindow, session, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createActor } from 'xstate'
import { tcMachine } from './tc/tcMachine'
import { ActivePlugin } from './plugins/ActivePlugin'
import { createLanServer, LAN_PORT } from './server/lanServer'
import { StageRegistry } from './stages/registry'
import { filterStagesForRound, validateStagesRoundVisibility } from './stages/roundVisibilityUtils'
import { logger } from './logger'
import type { TCStatePayload } from '../shared/types'
import { isTimedStageType } from '../shared/types'

// ── Singletons ──────────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null
let hudWindow:  BrowserWindow | null = null

const activePlugin = new ActivePlugin()
const tcActor     = createActor(tcMachine)
const lanServer   = createLanServer()

let tickInterval:     ReturnType<typeof setInterval> | null = null
let spinTickInterval: ReturnType<typeof setInterval> | null = null

// Tracks previous subscription state to detect enter/exit/tick transitions
let prevMachineState: string | null = null
let prevStageIndex: number = -1

// ── Timer management ─────────────────────────────────────────────────────────

function startSpinTicker(): void {
  if (spinTickInterval) return
  spinTickInterval = setInterval(() => tcActor.send({ type: 'SPIN_TICK' }), 1000)
}

function stopSpinTicker(): void {
  if (spinTickInterval) {
    clearInterval(spinTickInterval)
    spinTickInterval = null
  }
}

// ── Dev log bridge ───────────────────────────────────────────────────────────
// Forwards stage hook log lines to the renderer DevTools console (dev only).
// Eliminates the need to watch both the terminal and DevTools during development.
function devLog(message: string): void {
  if (is.dev) {
    mainWindow?.webContents.send('tm:dev-log', message)
  }
}

// ── GM Alert ────────────────────────────────────────────────────────────────
// Surfaces critical errors to the GM's console UI, the pino log, and stderr.
// Used for plugin configuration errors detected at startup (e.g. a stage that
// is always inactive). The renderer shows these as a dismissable red banner.
function gmAlert(message: string): void {
  mainWindow?.webContents.send('tm:gm-alert', message)
  logger.error({ alert: message }, 'GM Alert')
  console.error(`[GM ALERT] ${message}`)
}

// ── Timer management ────────────────────────────────────────────────────────

function startTicker(): void {
  if (tickInterval) return
  tickInterval = setInterval(() => tcActor.send({ type: 'TICK' }), 1000)
}

function stopTicker(): void {
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }
}

// ── XState subscription ─────────────────────────────────────────────────────

tcActor.subscribe((snapshot) => {
  const state = String(snapshot.value)

  // Skip the transient checkAdvance state — it resolves immediately
  if (state === 'checkAdvance') return

  const { stages, currentStageIndex } = snapshot.context
  const currentStage = stages[currentStageIndex]

  // ── Stage Registry hook dispatch ─────────────────────────────────────────
  //
  // Detect lifecycle transitions by comparing against previous snapshot state.
  //
  // "In stage" = stageActive OR stageGMHold (both represent an active stage).
  // entering: just entered an in-stage state for a new stage index
  //           stageGMHold → stageActive on the SAME stage does NOT re-fire onEnter
  // exiting:  was in-stage and is now leaving (or advancing to next stage)
  // ticking:  staying in stageActive, same index (a TICK just fired)

  const isInStage  = state === 'stageActive' || state === 'stageGMHold'
  const wasInStage = prevMachineState === 'stageActive' || prevMachineState === 'stageGMHold'

  const entering = isInStage && (!wasInStage || prevStageIndex !== currentStageIndex)
  const exiting  = wasInStage && (!isInStage || prevStageIndex !== currentStageIndex)

  const ticking = state === 'stageActive' &&
    prevMachineState === 'stageActive' &&
    prevStageIndex === currentStageIndex

  if (exiting && prevStageIndex >= 0) {
    const prevStage = stages[prevStageIndex]
    if (prevStage) {
      const handler = StageRegistry[prevStage.type]
      if (handler) {
        devLog(`[Stage:${prevStage.type}] onExit — "${prevStage.name}" (round ${snapshot.context.round})`)
        handler.onExit(prevStage, snapshot.context)
      }
    }
  }

  if (entering && currentStage) {
    const handler = StageRegistry[currentStage.type]
    if (handler) {
      devLog(`[Stage:${currentStage.type}] onEnter — "${currentStage.name}" (round ${snapshot.context.round})`)
      handler.onEnter(currentStage, snapshot.context)
    }
  }

  if (ticking && currentStage) {
    const handler = StageRegistry[currentStage.type]
    if (handler) {
      devLog(`[Stage:${currentStage.type}] onTick — "${currentStage.name}" (round ${snapshot.context.round}, ${snapshot.context.timerSecondsRemaining}s remaining)`)
      handler.onTick(currentStage, snapshot.context)
    }
  }

  prevMachineState = state
  prevStageIndex   = currentStageIndex

  // ── Timer management ─────────────────────────────────────────────────────
  if (state === 'stageActive' && currentStage && isTimedStageType(currentStage.type)) {
    startTicker()
  } else {
    stopTicker()
  }

  if (state === 'stageSpin') {
    startSpinTicker()
  } else {
    stopSpinTicker()  // also stops when entering stageSpinPaused
  }

  // ── Broadcast ────────────────────────────────────────────────────────────
  const payload: TCStatePayload = {
    machineState:          state,
    round:                 snapshot.context.round,
    stages:                snapshot.context.stages,
    currentStageIndex:     snapshot.context.currentStageIndex,
    timerSecondsRemaining: snapshot.context.timerSecondsRemaining,
    spinSecondsRemaining:  snapshot.context.spinSecondsRemaining,
    backgroundOpsComplete: snapshot.context.backgroundOpsComplete,
    beatsRemaining:        snapshot.context.beatsRemaining,
    totalBeats:            snapshot.context.totalBeats,
  }

  mainWindow?.webContents.send('tc:state-update', payload)
  lanServer.broadcast({ type: 'TC_STATE', payload })

  logger.debug(
    { machineState: state, round: snapshot.context.round, stageIndex: currentStageIndex },
    'TC state broadcast'
  )
})

tcActor.start()

// ── IPC handlers ────────────────────────────────────────────────────────────
// All handlers are fire-and-forget (one-way from renderer to main).
// The renderer sends these via window.api.* (see preload/index.ts).
// Responses travel back via tc:state-update broadcasts from tcActor.subscribe.

// Filter stages for round 1 and start the machine. beatsPerTC initialises
// the beat ledger (beatsRemaining = beatsAtStageEntry = beatsPerTC).
ipcMain.on('tc:start-combat', () => {
  const allStages  = activePlugin.getStages()
  const beatsPerTC = activePlugin.getBeatsPerTC()
  const stages     = filterStagesForRound(allStages, 1)
  tcActor.send({ type: 'START_COMBAT', stages, beatsPerTC })
})

// In stageGMHold: starts the player countdown. In stageActive: ends stage early (partial beats).
// In stageSpin: ends spin early (only when backgroundOpsComplete is true).
ipcMain.on('tc:gm-release', () => tcActor.send({ type: 'GM_RELEASE' }))

// Skips the current stage — zero beats consumed, beatsRemaining restored to stage-entry value.
ipcMain.on('tc:pass',       () => tcActor.send({ type: 'PASS' }))

// Freezes the active timer (stageActive → stagePaused, stageSpin → stageSpinPaused).
ipcMain.on('tc:pause',      () => tcActor.send({ type: 'PAUSE' }))

// Resumes from either paused state back to its respective active state.
ipcMain.on('tc:resume',     () => tcActor.send({ type: 'RESUME' }))

// Increments round, reloads round-filtered stage list, resets beat ledger to totalBeats.
ipcMain.on('tc:next-round', () => {
  const nextRound = tcActor.getSnapshot().context.round + 1
  const stages    = filterStagesForRound(activePlugin.getStages(), nextRound)
  tcActor.send({ type: 'NEXT_ROUND', stages })
})

// Transitions to battleEnded — all timers stop, HUD shows end screen.
ipcMain.on('tc:end-battle', () => tcActor.send({ type: 'END_BATTLE' }))

// Full reset to idle — clears all context including round, stages, and beat ledger.
ipcMain.on('tc:reset',      () => tcActor.send({ type: 'RESET' }))

// Opens the Group HUD window (1920×1080, no preload — read-only WebSocket client).
// If already open, focuses it rather than creating a second instance.
ipcMain.on('tc:launch-hud', () => {
  if (hudWindow) {
    hudWindow.focus()
    return
  }

  hudWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    title: 'TacticalMelee — Group HUD',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // No preload: the HUD connects via WebSocket (port 3001), not IPC.
    },
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    hudWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/hud.html`)
  } else {
    hudWindow.loadFile(join(__dirname, '../renderer/hud.html'))
  }

  hudWindow.on('closed', () => {
    hudWindow = null
  })
})

// ── Window creation ─────────────────────────────────────────────────────────

/** Creates the GM Dashboard window. Hidden until ready-to-show to avoid a white flash. */
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'TacticalMelee — GM Dashboard',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => mainWindow!.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── App lifecycle ───────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.tacticalmelee.app')

  // Content Security Policy injected on every response.
  // Dev relaxes script-src (unsafe-inline/eval for Vite HMR) and connect-src
  // (ws/http localhost for the dev server and LAN WebSocket).
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const csp = is.dev
      ? `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://localhost:* http://localhost:*; img-src 'self' data:; font-src 'self' data:`
      : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:`
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  // Validate plugin configuration after window is ready so alerts can reach the GM console
  mainWindow?.once('ready-to-show', () => {
    const { errors, warnings } = validateStagesRoundVisibility(activePlugin.getStages())
    warnings.forEach(w => logger.warn({ warning: w }, 'Plugin config warning'))
    errors.forEach(e => gmAlert(`Plugin configuration error: ${e}`))
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopTicker()
  stopSpinTicker()
  lanServer.close()
  if (process.platform !== 'darwin') app.quit()
})
