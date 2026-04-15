import React from 'react'
import { Group, Text, ActionIcon, Box, CloseButton } from '@mantine/core'
import { IconSettings, IconAlertTriangle } from '@tabler/icons-react'

interface TopBarProps {
  onSettingsOpen: () => void
  gmAlerts: string[]
  onDismissAlert: (index: number) => void
}

export function TopBar({ onSettingsOpen, gmAlerts, onDismissAlert }: TopBarProps): JSX.Element {
  // Always display the first queued alert. Dismissing index 0 shifts the queue,
  // revealing the next alert. A "[N] " count prefix appears when more than one is queued.
  const current = gmAlerts[0] ?? null

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
      <Group justify="space-between" style={{ width: '100%' }} gap={0}>
        {/* Left — logo */}
        <Text fw={700} size="lg" style={{ letterSpacing: '0.05em', flexShrink: 0 }}>
          TACTICAL<Text span c="var(--tm-accent)" fw={700} size="lg">MELEE</Text>
        </Text>

        {/* Center — GM alert strip */}
        <Box style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '0 1.5rem', minWidth: 0 }}>
          {current && (
            <Group
              gap="xs"
              wrap="nowrap"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--mantine-color-red-9) 20%, transparent)',
                border: '1px solid var(--mantine-color-red-7)',
                borderRadius: 'var(--mantine-radius-sm)',
                padding: '4px 10px',
                maxWidth: '100%',
              }}
            >
              <IconAlertTriangle size={14} color="var(--mantine-color-red-4)" style={{ flexShrink: 0 }} />
              <Text
                size="xs"
                c="var(--mantine-color-red-4)"
                fw={600}
                style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {gmAlerts.length > 1 ? `[${gmAlerts.length}] ` : ''}{current}
              </Text>
              <CloseButton
                size="xs"
                style={{ color: 'var(--mantine-color-red-4)', flexShrink: 0 }}
                onClick={() => onDismissAlert(0)}
              />
            </Group>
          )}
        </Box>

        {/* Right — settings */}
        <ActionIcon
          variant="subtle"
          size="lg"
          aria-label="Settings"
          onClick={onSettingsOpen}
          style={{ color: 'var(--tm-accent)', flexShrink: 0 }}
        >
          <IconSettings size={20} />
        </ActionIcon>
      </Group>
    </Box>
  )
}
