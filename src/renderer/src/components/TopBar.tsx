import React from 'react'
import { Group, Text, ActionIcon, Box } from '@mantine/core'
import { IconSettings } from '@tabler/icons-react'

interface TopBarProps {
  onSettingsOpen: () => void
}

export function TopBar({ onSettingsOpen }: TopBarProps): JSX.Element {
  return (
    <Box
      style={{
        borderBottom: '1px solid var(--tm-border)',
        backgroundColor: 'var(--tm-surface)',
        padding: '0 1.5rem',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Group justify="space-between" style={{ width: '100%' }}>
        <Text fw={700} size="lg" style={{ letterSpacing: '0.05em' }}>
          TACTICAL<Text span c="var(--tm-accent)" fw={700} size="lg">MELEE</Text>
        </Text>
        <ActionIcon
          variant="subtle"
          size="lg"
          aria-label="Settings"
          onClick={onSettingsOpen}
          style={{ color: 'var(--tm-accent)' }}
        >
          <IconSettings size={20} />
        </ActionIcon>
      </Group>
    </Box>
  )
}
