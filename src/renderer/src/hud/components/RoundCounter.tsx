import React from 'react'
import { Stack, Text } from '@mantine/core'

interface RoundCounterProps {
  round: number
  machineState: string
}

export function RoundCounter({ round, machineState }: RoundCounterProps): JSX.Element {
  const isComplete = machineState === 'tcComplete'

  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.1em' }}>
        Round
      </Text>
      <Text
        fw={800}
        style={{
          fontSize: '2.5rem',
          lineHeight: 1,
          color: isComplete ? 'var(--tm-accent)' : 'var(--mantine-color-text)',
        }}
      >
        {round > 0 ? round : '—'}
      </Text>
      {isComplete && (
        <Text size="xs" c="var(--tm-accent)" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
          Complete
        </Text>
      )}
    </Stack>
  )
}
