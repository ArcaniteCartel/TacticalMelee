import React from 'react'
import { Drawer, Stack, Title, Text, Box, Group, UnstyledButton } from '@mantine/core'
import { THEMES, ThemeName, THEME_NAMES } from '../themes'
import { useTheme } from '../context/ThemeContext'

interface SettingsDrawerProps {
  opened: boolean
  onClose: () => void
}

export function SettingsDrawer({ opened, onClose }: SettingsDrawerProps): JSX.Element {
  const { themeName, setTheme } = useTheme()

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Title order={4}>Settings</Title>}
      position="right"
      size="sm"
      styles={{
        content: { backgroundColor: 'var(--tm-surface)' },
        header: { backgroundColor: 'var(--tm-surface)', borderBottom: '1px solid var(--tm-border)' },
      }}
    >
      <Stack gap="md" pt="md">
        <Text size="sm" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
          UI Theme
        </Text>
        {THEME_NAMES.map((name: ThemeName) => {
          const entry = THEMES[name]
          const isActive = name === themeName
          return (
            <UnstyledButton
              key={name}
              onClick={() => setTheme(name)}
              style={{
                display: 'block',
                width: '100%',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--mantine-radius-default)',
                border: `1px solid ${isActive ? 'var(--tm-accent)' : 'var(--tm-border)'}`,
                backgroundColor: isActive ? 'var(--tm-surface-raised)' : 'transparent',
                transition: 'border-color 120ms ease, background-color 120ms ease',
              }}
            >
              <Group justify="space-between" mb={6}>
                <Text fw={600} size="sm">{entry.meta.name}</Text>
                {isActive && (
                  <Text size="xs" c="var(--tm-accent)" fw={600}>ACTIVE</Text>
                )}
              </Group>
              <Text size="xs" c="dimmed" mb={10}>{entry.meta.description}</Text>
              <Group gap={6}>
                {entry.meta.swatches.map((colour: string, i: number) => (
                  <Box
                    key={i}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 3,
                      backgroundColor: colour,
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  />
                ))}
              </Group>
            </UnstyledButton>
          )
        })}
      </Stack>
    </Drawer>
  )
}
