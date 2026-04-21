import React, { useEffect, useState } from 'react'
import { Box, Text, Center, Stack, Group, Badge, ScrollArea } from '@mantine/core'
import type { TCStatePayload, WSMessage } from '@shared/types'
import type { BattleLedgerPayload, BeatLogEntry } from '@shared/battleTypes'
import { RoundCounter }     from './components/RoundCounter'
import { MessageArea }      from './components/MessageArea'
import { StageList }        from './components/StageList'
import { DigitalCountdown } from './components/DigitalCountdown'
import { BeatsBurndown }    from './components/BeatsBurndown'

// ── WebSocket connection ──────────────────────────────────────────────────────
//
// The HUD is a standalone browser window with no access to Electron IPC (no
// preload script). It receives all game state over a WebSocket served by the
// main process on port 3001 via lanServer.ts.
//
// WS_URL is derived from the page's own hostname rather than being hardcoded to
// 'localhost'. This is intentional: when players open the HUD URL on their own
// devices over LAN, window.location.hostname is the host machine's LAN IP, so
// the WebSocket automatically connects to the correct host. If hardcoded to
// 'localhost', remote clients would try to connect to themselves and fail.
const WS_URL = `ws://${window.location.hostname}:3001`

// ── Beat log helpers ──────────────────────────────────────────────────────────
//
// These helpers translate the internal BeatLogOperation discriminant into
// human-readable labels and Mantine colour strings for the end-of-battle recap.
// They mirror the identical helpers in BattleLogDrawer.tsx (GM Dashboard side).
// Colour semantics:
//   blue   = stage opened (start of timed window)
//   green  = GM released early (surplus beats carried forward)
//   cyan   = time window ran to completion (no surplus)
//   orange = GM passed (full beat cost charged, no carry-forward)

function operationLabel(op: BeatLogEntry['operation']): string {
  if (op === 'stage-start')  return 'start'
  if (op === 'gm-release')   return 'release'
  if (op === 'time-expired') return 'time window complete'
  if (op === 'gm-pass')      return 'pass'
  return op
}

function operationColor(op: BeatLogEntry['operation']): string {
  if (op === 'stage-start')  return 'blue'
  if (op === 'gm-release')   return 'green'
  if (op === 'time-expired') return 'cyan'
  if (op === 'gm-pass')      return 'orange'
  return 'gray'
}

// ── HudApp ────────────────────────────────────────────────────────────────────
//
// Root component of the Group HUD window. Manages the WebSocket connection and
// owns the two top-level state slices that drive all child components:
//
//   state  (TCStatePayload)       — live machine state broadcast on every tick
//   ledger (BattleLedgerPayload)  — beat log, updated on every ledger change
//
// Both are received over the single WebSocket connection as discriminated-union
// messages (WSMessage): TC_STATE and LEDGER_STATE. The server (lanServer.ts)
// caches the latest of each type and replays both on every new connection, so a
// client that joins mid-combat immediately receives the current machine state
// rather than waiting for the next broadcast.
//
// ── Render flow ───────────────────────────────────────────────────────────────
//
// The component has four mutually exclusive render branches, evaluated in order:
//
//   1. Not connected       → "Connecting…" splash (WS not yet open or reconnecting)
//   2. idle / no state     → "Awaiting combat start…" splash (machine in idle state)
//   3. battleEnded         → Full-screen beat log recap (scrollable timeline)
//   4. All other states    → Live combat HUD (CSS grid layout, see below)
//
// Branch 1 is transient — the reconnect loop fires every 2 s on disconnect, so
// clients return to branch 2/3/4 automatically after a network blip.
// Branch 2 persists across rounds (idle is entered again after Reset Battle).
// Branch 3 remains until the GM resets to idle.

export function HudApp(): JSX.Element {
  const [state, setState]     = useState<TCStatePayload | null>(null)
  const [ledger, setLedger]   = useState<BattleLedgerPayload | null>(null)
  const [connected, setConnected] = useState(false)

  // ── WebSocket lifecycle ─────────────────────────────────────────────────────
  //
  // A single persistent WebSocket is opened on mount and kept alive for the
  // lifetime of the component. The reconnect strategy is:
  //
  //   onopen  → mark connected; child components begin rendering live data
  //   onclose → mark disconnected; schedule reconnect in 2 s
  //   onerror → force-close so onclose always fires (drives the reconnect loop)
  //
  // The pending reconnect timer is captured in a closure variable so the cleanup
  // function can cancel it if the component unmounts before the retry fires,
  // preventing a reconnect attempt against a torn-down component tree.
  //
  // Message dispatch:
  //   TC_STATE     → replaces the full machine state snapshot (every tick / event)
  //   LEDGER_STATE → replaces the full ledger payload (on every beat log change)
  //   Malformed JSON is silently dropped — the next valid broadcast will correct state.
  useEffect(() => {
    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect(): void {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage
          if (msg.type === 'TC_STATE')     setState(msg.payload)
          if (msg.type === 'LEDGER_STATE') setLedger(msg.payload)
        } catch {
          // Silently ignore malformed messages. The server only emits well-formed
          // JSON, but network corruption or partial frames are theoretically possible.
          // The next valid broadcast will restore correct state without user action.
        }
      }

      ws.onclose = () => {
        setConnected(false)
        // Retry after 2 s. The pending timer is cleared in the cleanup function
        // so a component unmount does not fire a reconnect after teardown.
        reconnectTimer = setTimeout(connect, 2000)
      }

      // Force close on error so onclose always fires and drives the reconnect loop.
      // Without this, an error without a subsequent close event would leave the
      // component stuck in a broken state with no retry scheduled.
      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  // ── Branch 1: not connected ─────────────────────────────────────────────────
  if (!connected) {
    return (
      <Box style={{ height: '100vh', backgroundColor: 'var(--tm-body-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text c="dimmed" size="lg">Connecting to TacticalMelee…</Text>
      </Box>
    )
  }

  // Derive top-level state flags used to select the render branch.
  // isIdle is true on first connect before any TC_STATE arrives (state === null)
  // and whenever the machine is genuinely in the idle state (between battles).
  const isIdle        = !state || state.machineState === 'idle'
  const isBattleEnded = state?.machineState === 'battleEnded'

  // ── Branch 2: idle ──────────────────────────────────────────────────────────
  if (isIdle) {
    return (
      <Box style={{ height: '100vh', backgroundColor: 'var(--tm-body-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <Text fw={700} size="xl" style={{ letterSpacing: '0.1em' }}>
          TACTICAL<Text span c="var(--tm-accent)" fw={700} size="xl">MELEE</Text>
        </Text>
        <Text c="dimmed">Awaiting combat start…</Text>
      </Box>
    )
  }

  // ── Branch 3: battle ended — full-screen beat log recap ─────────────────────
  //
  // Shown automatically when the GM clicks End Battle. No interaction required
  // from players — the HUD transitions here via the TC_STATE broadcast alone.
  //
  // The beat log (ledger.beatLog) is a flat chronological list of BeatLogEntry
  // records accumulated across all rounds. Each entry records:
  //   round          — which round the event occurred in
  //   beatsConsumed  — cumulative beats spent in the TC at that moment
  //   stageName      — human-readable stage label
  //   operation      — what happened (stage-start / gm-release / time-expired / gm-pass)
  //
  // Display format: "R:B  Stage Name  [OPERATION BADGE]"
  // where R = round number, B = beats consumed (1 decimal place).
  // The full tooltip on the R:B label shows "Round N, Beat N.N" for accessibility.
  if (isBattleEnded) {
    const entries = ledger?.beatLog ?? []
    return (
      <Box style={{ height: '100vh', backgroundColor: 'var(--tm-body-bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '3rem 2rem', gap: '2rem' }}>
        {/* Header */}
        <Stack align="center" gap="xs">
          <Text fw={700} size="xl" style={{ letterSpacing: '0.1em', color: 'var(--tm-danger)' }}>
            BATTLE ENDED
          </Text>
          <Text c="dimmed" size="sm">Round {state!.round} — Battle Beat Log</Text>
        </Stack>

        {/* Beat log timeline — one row per logged event, oldest first */}
        {entries.length === 0 ? (
          <Text c="dimmed" size="sm">No events recorded.</Text>
        ) : (
          <ScrollArea style={{ width: '100%', maxWidth: 700, flex: 1 }}>
            <Stack gap={6}>
              {entries.map((e, i) => (
                <Box
                  key={i}
                  style={{
                    padding: '0.5rem 1rem',
                    borderRadius: 'var(--mantine-radius-default)',
                    border: '1px solid var(--tm-border)',
                    backgroundColor: 'var(--tm-surface)',
                  }}
                >
                  <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
                    <Group gap={10} align="center" wrap="nowrap">
                      {/* Beat position label: "R:B" — round number : beats consumed at event time */}
                      <Text
                        size="sm"
                        fw={700}
                        ff="monospace"
                        c="var(--tm-accent)"
                        title={`Round ${e.round}, Beat ${e.beatsConsumed.toFixed(1)}`}
                        style={{ flexShrink: 0, minWidth: '4rem' }}
                      >
                        {e.round}:{e.beatsConsumed.toFixed(1)}
                      </Text>
                      <Text size="sm">{e.stageName}</Text>
                    </Group>
                    <Badge size="sm" color={operationColor(e.operation)} variant="light" style={{ flexShrink: 0 }}>
                      {operationLabel(e.operation)}
                    </Badge>
                  </Group>
                </Box>
              ))}
            </Stack>
          </ScrollArea>
        )}
      </Box>
    )
  }

  // ── Branch 4: live combat HUD ─────────────────────────────────────────────
  //
  // CSS grid layout — 2 rows × 4 columns, filling the full viewport.
  //
  //   Columns: 260px (stage list) | 1fr (combat content) | auto (countdown) | auto (burndown)
  //   Rows:    auto (header strip) | 1fr (main content area, fills remaining height)
  //
  //   Named grid areas:
  //     ┌─────────┬──────────────────────────────────────────┐
  //     │  round  │            message (×3 cols)             │  ← auto height
  //     ├─────────┼─────────────┬────────────┬──────────────┤
  //     │  stages │   content   │ countdown  │   burndown   │  ← 1fr
  //     └─────────┴─────────────┴────────────┴──────────────┘
  //
  //   gap: '1px' combined with the body background colour produces thin divider
  //   lines between cells — the background bleeds through the 1px gaps.
  //   Explicit borders on individual cells reinforce the divider on the header row
  //   (borderBottom) and between the left column and center (borderRight).
  //
  // Child component responsibilities:
  //   RoundCounter    — displays current round number and a state indicator dot
  //   MessageArea     — shows contextual GM / stage messages (varies by machineState)
  //   StageList       — scrollable pipeline of all stages with current stage highlighted
  //   content (placeholder) — reserved for future per-player combat display panels
  //   DigitalCountdown — large numeric timer for the active stage countdown or spin
  //   BeatsBurndown   — vertical bar showing remaining beats as a proportion of totalBeats
  return (
    <Box
      style={{
        height: '100vh',
        backgroundColor: 'var(--tm-body-bg)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gridTemplateColumns: '260px 1fr auto auto',
        gridTemplateAreas: `
          "round  message  message  message"
          "stages content  countdown burndown"
        `,
        gap: '1px',
        overflow: 'hidden',
      }}
    >
      {/* Top-left: Round counter — round number + machine state indicator */}
      <Box style={{ gridArea: 'round', padding: '1rem 1.5rem', borderBottom: '1px solid var(--tm-border)', borderRight: '1px solid var(--tm-border)' }}>
        <RoundCounter round={state.round} machineState={state.machineState} />
      </Box>

      {/* Top-center/right: Message area — spans the remaining 3 header columns.
          Content adapts to machineState: GM hold instructions, countdown prompts,
          spin hourglass, etc. See MessageArea.tsx for per-state message map. */}
      <Box style={{ gridArea: 'message', padding: '1rem 2rem', borderBottom: '1px solid var(--tm-border)' }}>
        <MessageArea state={state} />
      </Box>

      {/* Left column: Stage pipeline — full ordered list of stages for this round.
          Scrollable so long pipelines (multiple tiers) remain accessible.
          currentIndex highlights the active stage; completed stages are dimmed. */}
      <Box style={{ gridArea: 'stages', borderRight: '1px solid var(--tm-border)', padding: '1.5rem 1rem', overflowY: 'auto' }}>
        <StageList stages={state.stages} currentIndex={state.currentStageIndex} machineState={state.machineState} />
      </Box>

      {/* Center: Placeholder for future per-player combat display.
          Will eventually show player action cards, NPC responses, or initiative order. */}
      <Center style={{ gridArea: 'content' }}>
        <Text c="dimmed" size="sm" style={{ opacity: 0.3 }}>Combat display</Text>
      </Center>

      {/* Right: Digital countdown — large timer showing seconds remaining in the
          active stage window, or spin countdown, or GM hold indicator.
          Adapts its icon and colour to the current machineState. */}
      <Box style={{ gridArea: 'countdown', borderLeft: '1px solid var(--tm-border)', padding: '1.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DigitalCountdown state={state} />
      </Box>

      {/* Far right: Beats burndown bar — vertical progress bar showing
          beatsRemaining / totalBeats. Colour shifts as the beat budget depletes.
          Gives players a persistent visual sense of how much round time remains. */}
      <Box style={{ gridArea: 'burndown', borderLeft: '1px solid var(--tm-border)', padding: '1.5rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <BeatsBurndown beatsRemaining={state.beatsRemaining} totalBeats={state.totalBeats} machineState={state.machineState} />
      </Box>
    </Box>
  )
}
