import React from 'react'
import { useDisclosure } from '@mantine/hooks'
import { Box, Container, Title, Text, Stack, Divider, Badge, Group, Paper } from '@mantine/core'
import { TopBar } from './components/TopBar'
import { SettingsDrawer } from './components/SettingsDrawer'

export default function App(): JSX.Element {
  const [settingsOpen, { open: openSettings, close: closeSettings }] = useDisclosure(false)

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--tm-body-bg)' }}>
      <TopBar onSettingsOpen={openSettings} />

      <Container size="md" style={{ flex: 1, paddingTop: '3rem' }}>
        <Stack gap="xl">
          <Stack gap="xs">
            <Title order={2}>GM Dashboard</Title>
            <Text c="dimmed">No active combat session.</Text>
          </Stack>

          <Divider color="var(--tm-border)" />

          <Stack gap="md">
            <Text size="sm" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
              System Status
            </Text>
            <Group gap="sm">
              <Paper
                p="md"
                style={{
                  flex: 1,
                  backgroundColor: 'var(--tm-surface)',
                  border: '1px solid var(--tm-border)',
                }}
              >
                <Text size="xs" c="dimmed" mb={4}>Combat</Text>
                <Badge color="gray" variant="light">Idle</Badge>
              </Paper>
              <Paper
                p="md"
                style={{
                  flex: 1,
                  backgroundColor: 'var(--tm-surface)',
                  border: '1px solid var(--tm-border)',
                }}
              >
                <Text size="xs" c="dimmed" mb={4}>Players Connected</Text>
                <Badge color="gray" variant="light">0 / 0</Badge>
              </Paper>
              <Paper
                p="md"
                style={{
                  flex: 1,
                  backgroundColor: 'var(--tm-surface)',
                  border: '1px solid var(--tm-border)',
                }}
              >
                <Text size="xs" c="dimmed" mb={4}>Plugin</Text>
                <Badge color="gray" variant="light">None loaded</Badge>
              </Paper>
            </Group>
          </Stack>
        </Stack>
      </Container>

      <SettingsDrawer opened={settingsOpen} onClose={closeSettings} />
    </Box>
  )
}
