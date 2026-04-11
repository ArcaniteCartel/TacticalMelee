import React, { useEffect, useState } from 'react'
import { Box, Text, Center } from '@mantine/core'
import type { TCStatePayload, WSMessage } from '@shared/types'
import { RoundCounter }     from './components/RoundCounter'
import { MessageArea }      from './components/MessageArea'
import { StageList }        from './components/StageList'
import { DigitalCountdown } from './components/DigitalCountdown'
import { BeatsBurndown }    from './components/BeatsBurndown'

const WS_URL = `ws://${window.location.hostname}:3001`

export function HudApp(): JSX.Element {
  const [state, setState] = useState<TCStatePayload | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let ws: WebSocket
    let reconnectTimer: ReturnType<typeof setTimeout>

    function connect(): void {
      ws = new WebSocket(WS_URL)

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as WSMessage
          if (msg.type === 'TC_STATE') setState(msg.payload)
        } catch {
          // ignore malformed messages
        }
      }

      ws.onclose = () => {
        setConnected(false)
        reconnectTimer = setTimeout(connect, 2000)
      }

      ws.onerror = () => ws.close()
    }

    connect()

    return () => {
      clearTimeout(reconnectTimer)
      ws?.close()
    }
  }, [])

  if (!connected) {
    return (
      <Box style={{ height: '100vh', backgroundColor: 'var(--tm-body-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text c="dimmed" size="lg">Connecting to TacticalMelee…</Text>
      </Box>
    )
  }

  const isIdle        = !state || state.machineState === 'idle'
  const isBattleEnded = state?.machineState === 'battleEnded'

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

  if (isBattleEnded) {
    return (
      <Box style={{ height: '100vh', backgroundColor: 'var(--tm-body-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <Text fw={700} size="xl" style={{ letterSpacing: '0.1em', color: 'var(--tm-danger)' }}>
          BATTLE ENDED
        </Text>
        <Text c="dimmed">Round {state!.round}</Text>
      </Box>
    )
  }

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
      {/* Top-left: Round counter */}
      <Box style={{ gridArea: 'round', padding: '1rem 1.5rem', borderBottom: '1px solid var(--tm-border)', borderRight: '1px solid var(--tm-border)' }}>
        <RoundCounter round={state.round} machineState={state.machineState} />
      </Box>

      {/* Top-center: Message area */}
      <Box style={{ gridArea: 'message', padding: '1rem 2rem', borderBottom: '1px solid var(--tm-border)' }}>
        <MessageArea state={state} />
      </Box>

      {/* Left: Stage pipeline */}
      <Box style={{ gridArea: 'stages', borderRight: '1px solid var(--tm-border)', padding: '1.5rem 1rem', overflowY: 'auto' }}>
        <StageList stages={state.stages} currentIndex={state.currentStageIndex} machineState={state.machineState} />
      </Box>

      {/* Center: Future combat content placeholder */}
      <Center style={{ gridArea: 'content' }}>
        <Text c="dimmed" size="sm" style={{ opacity: 0.3 }}>Combat display</Text>
      </Center>

      {/* Right: Digital countdown */}
      <Box style={{ gridArea: 'countdown', borderLeft: '1px solid var(--tm-border)', padding: '1.5rem 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <DigitalCountdown state={state} />
      </Box>

      {/* Far right: Beats burndown bar */}
      <Box style={{ gridArea: 'burndown', borderLeft: '1px solid var(--tm-border)', padding: '1.5rem 0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
        <BeatsBurndown beatsRemaining={state.beatsRemaining} totalBeats={state.totalBeats} machineState={state.machineState} />
      </Box>
    </Box>
  )
}
