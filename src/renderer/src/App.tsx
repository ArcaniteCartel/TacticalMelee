// ── GM Dashboard — Root Component ─────────────────────────────────────────────
//
// This is the root of the GM Dashboard renderer, which runs inside the main
// Electron BrowserWindow. Unlike the Group HUD (hud/HudApp.tsx), this surface
// has full access to the Electron IPC bridge via window.api (preload/index.ts).
//
// Responsibilities:
//   - Owns the gmAlerts queue (TopBar dismissal strip)
//   - Owns the ledger state slice (passed to BattleLogDrawer)
//   - Manages drawer open/close state (Settings, Battle Log)
//   - Wires up all global IPC subscriptions on mount
//
// gmAlerts queue design:
//   Alerts originate from the main process (tm:gm-alert IPC) when the plugin or
//   machine encounters a non-fatal error (e.g. round visibility config warning,
//   SPIN_EXCEPTION). Multiple alerts can fire in rapid succession during START_COMBAT
//   config validation. The queue pattern (append on receive, shift on dismiss) ensures
//   all alerts are surfaced one at a time rather than dropping all but the last.
//   TopBar renders gmAlerts[0] and calls onDismissAlert(0) when the GM dismisses it.
//
// IPC subscription pattern:
//   All subscriptions use window.api.on* / off* (preload/index.ts). Cleanup handlers
//   in useEffect return functions call off* to prevent listener accumulation on hot-reload.
//   State flows one-way: main process → renderer via IPC events (never renderer → main
//   via subscription; commands go through window.api.* fire-and-forget methods instead).

import React, { useState } from 'react'
import { useDisclosure } from '@mantine/hooks'
import { Box, Container, Text, Stack, Divider, Badge, Group, Paper } from '@mantine/core'
import { TopBar }           from './components/TopBar'
import { SettingsDrawer }   from './components/SettingsDrawer'
import { GmControls }       from './components/GmControls'
import { BattleLogDrawer }  from './components/BattleLogDrawer'
import type { BattleLedgerPayload } from '@shared/battleTypes'

export default function App(): JSX.Element {
  const [settingsOpen,  { open: openSettings,   close: closeSettings   }] = useDisclosure(false)
  const [battleLogOpen, { open: openBattleLog,  close: closeBattleLog  }] = useDisclosure(false)

  // gmAlerts is a queue: TopBar shows the first item, dismiss removes it and reveals the next.
  // Alerts originate from the main process via tm:gm-alert IPC (plugin config errors, etc.).
  const [gmAlerts, setGmAlerts] = useState<string[]>([])
  const [ledger, setLedger] = useState<BattleLedgerPayload | null>(null)

  React.useEffect(() => {
    // Forward main-process dev log lines to DevTools console (no-ops in production).
    window.api.onDevLog((message) => console.log(message))
    // Append each GM alert to the queue; TopBar handles display and dismissal ordering.
    window.api.onGmAlert((message) => setGmAlerts(prev => [...prev, message]))
    // Keep ledger state in sync for the Battle Log drawer.
    window.api.onLedgerUpdate((payload) => setLedger(payload))
    return () => {
      window.api.offLedgerUpdate()
    }
  }, [])

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--tm-body-bg)' }}>
      <TopBar
        onSettingsOpen={openSettings}
        gmAlerts={gmAlerts}
        onDismissAlert={(i) => setGmAlerts(prev => prev.filter((_, j) => j !== i))}
      />

      <Container size="md" style={{ flex: 1, paddingTop: '2rem', paddingBottom: '2rem' }}>
        <Stack gap="xl">

          {/* Combat controls */}
          <GmControls onBattleLogOpen={openBattleLog} />

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

      <SettingsDrawer  opened={settingsOpen}  onClose={closeSettings}  />
      <BattleLogDrawer opened={battleLogOpen} onClose={closeBattleLog} ledger={ledger} />
    </Box>
  )
}
