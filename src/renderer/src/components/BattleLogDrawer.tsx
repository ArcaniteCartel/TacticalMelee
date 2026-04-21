import React from 'react'
import { Drawer, Stack, Title, Text, Group, Badge, ScrollArea, Box } from '@mantine/core'
import type { BattleLedgerPayload, BeatLogEntry } from '@shared/battleTypes'

interface BattleLogDrawerProps {
  opened: boolean
  onClose: () => void
  ledger: BattleLedgerPayload | null
}

function formatOperation(op: BeatLogEntry['operation']): string {
  if (op === 'stage-start')  return 'start'
  if (op === 'gm-release')   return 'release'
  if (op === 'time-expired') return 'time window complete'
  if (op === 'gm-pass')      return 'pass'
  return op
}

function operationColor(op: BeatLogEntry['operation']): string {
  if (op === 'stage-start')  return 'blue'
  if (op === 'gm-release')   return 'green'
  if (op === 'time-expired') return 'cyan'
  if (op === 'gm-pass')      return 'orange'
  return 'gray'
}

export function BattleLogDrawer({ opened, onClose, ledger }: BattleLogDrawerProps): JSX.Element {
  const entries = ledger?.beatLog ?? []

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title={<Title order={4}>Battle Log</Title>}
      position="right"
      size="sm"
      styles={{
        content: { backgroundColor: 'var(--tm-surface)' },
        header: { backgroundColor: 'var(--tm-surface)', borderBottom: '1px solid var(--tm-border)' },
      }}
    >
      <Stack gap="xs" pt="md">
        {entries.length === 0 ? (
          <Text size="sm" c="dimmed">No events recorded yet.</Text>
        ) : (
          <ScrollArea h="calc(100vh - 120px)">
            <Stack gap={4}>
              {entries.map((e, i) => (
                <Box
                  key={i}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--mantine-radius-default)',
                    border: '1px solid var(--tm-border)',
                  }}
                >
                  <Group justify="space-between" align="center" gap="xs" wrap="nowrap">
                    <Group gap={6} align="center" wrap="nowrap">
                      {/* "R:B" beat position label — round:beatsConsumed */}
                      <Text
                        size="xs"
                        fw={600}
                        ff="monospace"
                        c="var(--tm-accent)"
                        title={`Round ${e.round}, Beat ${e.beatsConsumed.toFixed(1)}`}
                        style={{ flexShrink: 0 }}
                      >
                        {e.round}:{e.beatsConsumed.toFixed(1)}
                      </Text>
                      <Text size="xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.stageName}
                      </Text>
                    </Group>
                    <Badge size="xs" color={operationColor(e.operation)} variant="light" style={{ flexShrink: 0 }}>
                      {formatOperation(e.operation)}
                    </Badge>
                  </Group>
                </Box>
              ))}
            </Stack>
          </ScrollArea>
        )}
      </Stack>
    </Drawer>
  )
}
