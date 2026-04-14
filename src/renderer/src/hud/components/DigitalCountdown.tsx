import React from 'react'
import { Stack, Text, Box } from '@mantine/core'
import { IconUser, IconSettings, IconPlayerPause, IconFlagCheck, IconHourglass } from '@tabler/icons-react'
import type { TCStatePayload } from '@shared/types'

function isTimedType(type: string): boolean {
  return type === 'timed' || type === 'action' || type === 'response'
}

interface DigitalCountdownProps {
  state: TCStatePayload
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

export function DigitalCountdown({ state }: DigitalCountdownProps): JSX.Element {
  const stage = state.stages[state.currentStageIndex]

  // GM Hold — waiting for GM to release before player countdown starts
  if (state.machineState === 'stageGMHold') {
    return (
      <Stack gap={6} align="center">
        <IconUser size={32} color="var(--tm-accent)" />
        <Text size="xs" c="var(--tm-accent)" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
          GM
        </Text>
      </Stack>
    )
  }

  // Spin state — post-completion hourglass pause
  if (state.machineState === 'stageSpin') {
    return (
      <Stack gap={6} align="center">
        <IconHourglass size={32} color="var(--tm-accent)" />
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
          Processing
        </Text>
      </Stack>
    )
  }

  // Spin paused
  if (state.machineState === 'stageSpinPaused') {
    return (
      <Stack gap={6} align="center">
        <IconHourglass size={32} color="var(--tm-warning)" style={{ opacity: 0.7 }} />
        <Text size="xs" c="var(--tm-warning)" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em', opacity: 0.7 }}>
          Paused
        </Text>
      </Stack>
    )
  }

  // TC complete
  if (state.machineState === 'tcComplete') {
    return (
      <Stack gap={6} align="center">
        <IconFlagCheck size={32} color="var(--tm-accent)" />
        <Text size="xs" c="var(--tm-accent)" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
          Done
        </Text>
      </Stack>
    )
  }

  // Paused
  if (state.machineState === 'stagePaused') {
    return (
      <Stack gap={6} align="center">
        <IconPlayerPause size={28} color="var(--tm-warning)" />
        <Text
          fw={800}
          style={{ fontSize: '2.2rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums', color: 'var(--tm-warning)', opacity: 0.7 }}
        >
          {pad(state.timerSecondsRemaining)}
        </Text>
        <Text size="xs" c="dimmed">paused</Text>
      </Stack>
    )
  }

  // GM-release stage
  if (stage?.type === 'gm-release') {
    return (
      <Stack gap={6} align="center">
        <IconUser size={32} color="var(--tm-accent)" />
        <Text size="xs" c="var(--tm-accent)" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
          GM
        </Text>
      </Stack>
    )
  }

  // Any system-computation stage (no timer) — show hourglass while active
  if (stage && !isTimedType(stage.type)) {
    return (
      <Stack gap={6} align="center">
        <IconSettings size={32} color="var(--tm-accent)" />
        <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
          Processing
        </Text>
      </Stack>
    )
  }

  // Timed stage — live countdown
  const secs = state.timerSecondsRemaining
  const color =
    secs <= 5
      ? 'var(--tm-timer-critical)'
      : secs <= 10
      ? 'var(--tm-timer-warning)'
      : 'var(--mantine-color-text)'

  return (
    <Stack gap={4} align="center">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.1em' }}>
        Seconds
      </Text>
      <Box
        style={{
          padding: '0.5rem 0.75rem',
          border: `2px solid ${color}`,
          borderRadius: 'var(--mantine-radius-default)',
          backgroundColor: 'var(--tm-surface)',
          minWidth: '4.5rem',
          textAlign: 'center',
        }}
      >
        <Text
          fw={800}
          style={{
            fontSize: '3rem',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color,
            transition: 'color 300ms ease',
          }}
        >
          {pad(secs)}
        </Text>
      </Box>
    </Stack>
  )
}
