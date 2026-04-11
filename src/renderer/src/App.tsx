import React from 'react'
import { useDisclosure } from '@mantine/hooks'
import { Box, Container, Title, Text, Stack, Divider, Badge, Group, Paper } from '@mantine/core'
import { TopBar }        from './components/TopBar'
import { SettingsDrawer } from './components/SettingsDrawer'
import { GmControls }    from './components/GmControls'

export default function App(): JSX.Element {
  const [settingsOpen, { open: openSettings, close: closeSettings }] = useDisclosure(false)

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--tm-body-bg)' }}>
      <TopBar onSettingsOpen={openSettings} />

      <Container size="md" style={{ flex: 1, paddingTop: '2rem', paddingBottom: '2rem' }}>
        <Stack gap="xl">

          {/* Combat controls */}
          <GmControls />

          <Divider color="var(--tm-border)" />

          {/* System status */}
          <Stack gap="md">
            <Text size="sm" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.08em' }}>
              System Status
            </Text>
            <Group gap="sm">
              <Paper p="md" style={{ flex: 1, backgroundColor: 'var(--tm-surface)', border: '1px solid var(--tm-border)' }}>
                <Text size="xs" c="dimmed" mb={4}>Plugin</Text>
                <Badge color="green" variant="light">Standard</Badge>
              </Paper>
              <Paper p="md" style={{ flex: 1, backgroundColor: 'var(--tm-surface)', border: '1px solid var(--tm-border)' }}>
                <Text size="xs" c="dimmed" mb={4}>Players Connected</Text>
                <Badge color="gray" variant="light">0 / 0</Badge>
              </Paper>
              <Paper p="md" style={{ flex: 1, backgroundColor: 'var(--tm-surface)', border: '1px solid var(--tm-border)' }}>
                <Text size="xs" c="dimmed" mb={4}>LAN Server</Text>
                <Badge color="green" variant="light">Port 3001</Badge>
              </Paper>
            </Group>
          </Stack>

        </Stack>
      </Container>

      <SettingsDrawer opened={settingsOpen} onClose={closeSettings} />
    </Box>
  )
}
