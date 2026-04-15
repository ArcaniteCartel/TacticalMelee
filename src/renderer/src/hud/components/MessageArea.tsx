import React from 'react'
import { Group, Text } from '@mantine/core'
import { IconUser, IconSettings, IconPlayerPause } from '@tabler/icons-react'
import type { TCStatePayload } from '@shared/types'

interface MessageAreaProps {
  state: TCStatePayload
}

/**
 * Returns the contextual icon for the current machine state and stage type.
 * Machine-state checks take priority over stage-type checks so that transient
 * states like stageGMHold and stagePaused always show the correct icon regardless
 * of what stage type is active underneath.
 */
function getIcon(state: TCStatePayload): JSX.Element | null {
  const stage = state.stages[state.currentStageIndex]
  if (!stage) return null

  if (state.machineState === 'stageGMHold') {
    return <IconUser size={20} color="var(--tm-accent)" />
  }
  if (state.machineState === 'stagePaused') {
    return <IconPlayerPause size={20} color="var(--tm-warning)" />
  }
  if (stage.type === 'gm-release') {
    return <IconUser size={20} color="var(--tm-accent)" />
  }
  if (stage.type === 'system-complete') {
    return <IconSettings size={20} color="var(--tm-accent)" style={{ animation: 'spin 2s linear infinite' }} />
  }
  return null
}

/**
 * Returns the message string to display in the HUD message area.
 * Priority: machine-state overrides (tcComplete, paused, stageGMHold) → stage description fallback.
 * The stage description is the authoritative message for all normal running states.
 */
function getMessage(state: TCStatePayload): string {
  if (state.machineState === 'tcComplete') return 'Round complete. Awaiting GM.'
  if (state.machineState === 'stagePaused') return 'Combat paused.'
  if (state.machineState === 'stageGMHold') {
    const stage = state.stages[state.currentStageIndex]
    const label = stage?.type === 'response' ? 'response' : 'action'
    return `GM is preparing NPC ${label}s — stand by.`
  }

  const stage = state.stages[state.currentStageIndex]
  return stage?.description ?? ''
}

export function MessageArea({ state }: MessageAreaProps): JSX.Element {
  const icon = getIcon(state)
  const message = getMessage(state)

  return (
    <Group gap="sm" align="center" style={{ height: '100%' }}>
      {icon}
      <Text
        fw={500}
        size="md"
        style={{ color: 'var(--mantine-color-text)', lineHeight: 1.4 }}
      >
        {message}
      </Text>
    </Group>
  )
}
