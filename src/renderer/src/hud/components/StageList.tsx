import React from 'react'
import { Stack, Box, Text, Group } from '@mantine/core'
import { IconCheck, IconUser, IconClock, IconSettings } from '@tabler/icons-react'
import type { StageDefinition } from '@shared/types'

interface StageListProps {
  stages: StageDefinition[]
  currentIndex: number
  machineState: string
}

function stageTypeIcon(type: StageDefinition['type'], size = 14): JSX.Element {
  if (type === 'gm-release')     return <IconUser size={size} />
  if (type === 'timed')          return <IconClock size={size} />
  if (type === 'system-complete') return <IconSettings size={size} />
  return <></>
}

export function StageList({ stages, currentIndex, machineState }: StageListProps): JSX.Element {
  const isComplete = machineState === 'tcComplete'

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.1em' }}>
        Stages
      </Text>

      {stages.map((stage, idx) => {
        const isDone    = idx < currentIndex || isComplete
        const isActive  = idx === currentIndex && !isComplete
        const isUpcoming = idx > currentIndex && !isComplete

        return (
          <Box
            key={stage.id}
            style={{
              padding: '0.6rem 0.75rem',
              borderRadius: 'var(--mantine-radius-default)',
              border: `1px solid ${isActive ? 'var(--tm-accent)' : 'var(--tm-border)'}`,
              backgroundColor: isActive ? 'var(--tm-surface-raised)' : 'transparent',
              opacity: isUpcoming ? 0.4 : isDone ? 0.55 : 1,
              transition: 'all 200ms ease',
              // Subtle pulse on active stage
              boxShadow: isActive ? '0 0 8px var(--tm-accent)' : 'none',
            }}
          >
            <Group justify="space-between" align="center">
              <Group gap={6} align="center">
                <Box style={{ color: isActive ? 'var(--tm-accent)' : 'var(--mantine-color-dimmed)' }}>
                  {isDone ? <IconCheck size={14} /> : stageTypeIcon(stage.type)}
                </Box>
                <Text
                  size="sm"
                  fw={isActive ? 700 : 400}
                  style={{ color: isActive ? 'var(--tm-accent)' : undefined }}
                >
                  {stage.name}
                </Text>
              </Group>

              {stage.beats > 0 && (
                <Text size="xs" c="dimmed">{stage.beats}b</Text>
              )}
            </Group>

            {isActive && stage.type === 'timed' && stage.timerSeconds && (
              <Text size="xs" c="dimmed" mt={2}>
                {stage.timerSeconds}s · {stage.beats} beat{stage.beats !== 1 ? 's' : ''}
              </Text>
            )}
          </Box>
        )
      })}
    </Stack>
  )
}
