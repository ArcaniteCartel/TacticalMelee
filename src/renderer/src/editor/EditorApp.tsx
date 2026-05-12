// ── Plugin Profile Editor — Root Component ────────────────────────────────────
//
// Manages the EditorWorkingCopy lifecycle:
//   - On first open: fetches active config from main, stores to localForage
//   - On subsequent opens: loads from localForage (preserves unsaved changes)
//   - isDirty flag: shown as a badge; gates the SUBMIT button
//   - SUBMIT: serialises to YAML, saves via IPC, refreshes localForage from main
//   - CLEAR CHANGES: re-fetches from main, overwrites localForage, clears dirty flag
//   - DOWNLOAD: serialises to YAML, triggers native Save dialog
//   - RESTORE DEFAULTS: archives custom YAML, reverts to standard via IPC

import React, { useCallback, useEffect, useState } from 'react'
import {
  Box, Group, Title, Badge, Text, Button, Divider, Notification, Stack,
  Tooltip, ScrollArea,
} from '@mantine/core'
import {
  IconDeviceFloppy, IconDownload, IconRefresh, IconArrowBack, IconAlertCircle,
  IconCheck,
} from '@tabler/icons-react'
import { PluginTreeEditor } from './components/PluginTreeEditor'
import { editorStorage } from './editorStorage'
import { configToEditorConfig, editorConfigToYaml } from './editorUtils'
import type { EditorConfig, EditorWorkingCopy } from './editorTypes'

type StatusMsg = { kind: 'success' | 'error' | 'info'; text: string }

export function EditorApp(): JSX.Element {
  const [working,  setWorking]  = useState<EditorWorkingCopy | null>(null)
  const [mode,     setMode]     = useState<'standard' | 'custom'>('standard')
  const [isIdle,   setIsIdle]   = useState(true)
  const [loading,  setLoading]  = useState(true)
  const [status,   setStatus]   = useState<StatusMsg | null>(null)
  const [busy,     setBusy]     = useState(false)

  // ── Initialise on mount ───────────────────────────────────────────────────

  useEffect(() => {
    async function init(): Promise<void> {
      const stored = await editorStorage.load()
      const payload = await window.api.getActivePluginConfig()
      setMode(payload.mode)

      if (stored) {
        setWorking(stored)
      } else {
        const wc: EditorWorkingCopy = {
          version: 1,
          isDirty: false,
          syncedAt: new Date().toISOString(),
          config: configToEditorConfig(payload.raw),
        }
        await editorStorage.save(wc)
        setWorking(wc)
      }
      setLoading(false)
    }
    init()
  }, [])

  // ── Poll idle state every 2s (drives SUBMIT availability) ────────────────

  useEffect(() => {
    async function check(): Promise<void> {
      setIsIdle(await window.api.isIdle())
    }
    check()
    const id = setInterval(check, 2000)
    return () => clearInterval(id)
  }, [])

  // ── Listen for mode changes broadcast from main ───────────────────────────

  useEffect(() => {
    window.api.onPluginModeChanged((m) => setMode(m))
    return () => window.api.offPluginModeChanged()
  }, [])

  // ── Config change handler — persists every edit to localForage ────────────

  const handleChange = useCallback(async (config: EditorConfig): Promise<void> => {
    const updated: EditorWorkingCopy = {
      version: 1,
      isDirty: true,
      syncedAt: working?.syncedAt ?? new Date().toISOString(),
      config,
    }
    setWorking(updated)
    await editorStorage.save(updated)
  }, [working])

  // ── SUBMIT ────────────────────────────────────────────────────────────────

  async function handleSubmit(): Promise<void> {
    if (!working) return
    setBusy(true)
    try {
      const yaml   = editorConfigToYaml(working.config)
      const result = await window.api.saveCustomPlugin(yaml)
      if (result.ok) {
        const payload   = await window.api.getActivePluginConfig()
        const refreshed: EditorWorkingCopy = {
          version: 1,
          isDirty: false,
          syncedAt: new Date().toISOString(),
          config: configToEditorConfig(payload.raw),
        }
        await editorStorage.save(refreshed)
        setWorking(refreshed)
        setMode(payload.mode)
        setStatus({
          kind: 'success',
          text: result.applied
            ? 'Plugin saved and applied immediately.'
            : 'Plugin saved to disk. Will apply when combat ends.',
        })
      } else {
        setStatus({ kind: 'error', text: `Save failed: ${result.error ?? 'unknown error'}` })
      }
    } finally {
      setBusy(false)
    }
  }

  // ── CLEAR CHANGES ─────────────────────────────────────────────────────────

  async function handleClearChanges(): Promise<void> {
    setBusy(true)
    try {
      const payload   = await window.api.getActivePluginConfig()
      const refreshed: EditorWorkingCopy = {
        version: 1,
        isDirty: false,
        syncedAt: new Date().toISOString(),
        config: configToEditorConfig(payload.raw),
      }
      await editorStorage.save(refreshed)
      setWorking(refreshed)
      setMode(payload.mode)
      setStatus({ kind: 'info', text: 'Changes cleared. Reverted to active plugin.' })
    } finally {
      setBusy(false)
    }
  }

  // ── DOWNLOAD ──────────────────────────────────────────────────────────────

  async function handleDownload(): Promise<void> {
    if (!working) return
    const yaml = editorConfigToYaml(working.config)
    await window.api.downloadPluginYaml(yaml)
  }

  // ── RESTORE DEFAULTS ──────────────────────────────────────────────────────

  async function handleRestoreDefaults(): Promise<void> {
    setBusy(true)
    try {
      const result  = await window.api.restorePluginDefaults()
      const payload = await window.api.getActivePluginConfig()
      const refreshed: EditorWorkingCopy = {
        version: 1,
        isDirty: false,
        syncedAt: new Date().toISOString(),
        config: configToEditorConfig(payload.raw),
      }
      await editorStorage.save(refreshed)
      setWorking(refreshed)
      setMode(payload.mode)
      setStatus({ kind: 'info', text: `Custom plugin archived to: ${result.backupPath}` })
    } finally {
      setBusy(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading || !working) {
    return (
      <Box p="xl" style={{ backgroundColor: 'var(--tm-body-bg)', minHeight: '100vh' }}>
        <Text c="dimmed">Loading plugin data…</Text>
      </Box>
    )
  }

  const submitDisabled = !working.isDirty || !isIdle || busy

  return (
    <Box style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--tm-body-bg)' }}>

      {/* ── Header ── */}
      <Box
        p="sm"
        style={{ borderBottom: '1px solid var(--tm-border)', backgroundColor: 'var(--tm-surface)', flexShrink: 0 }}
      >
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Title order={5} c="var(--tm-text)">Plugin Profile Editor</Title>
            <Badge color={mode === 'custom' ? 'violet' : 'green'} variant="light" size="sm">
              {mode === 'custom' ? 'Custom' : 'Standard'}
            </Badge>
            {working.isDirty && (
              <Badge color="yellow" variant="dot" size="sm">Unsaved changes</Badge>
            )}
          </Group>

          <Group gap="xs" wrap="nowrap">
            <Tooltip label="Save editor state as a YAML file (does not activate it)" withArrow openDelay={400}>
              <Button
                size="xs"
                variant="outline"
                leftSection={<IconDownload size={13} />}
                onClick={handleDownload}
                disabled={busy}
              >
                Download
              </Button>
            </Tooltip>

            <Tooltip
              label={working.isDirty ? 'Discard unsaved changes and revert to active plugin' : 'No unsaved changes'}
              withArrow
              openDelay={400}
            >
              <Button
                size="xs"
                variant="outline"
                color="orange"
                leftSection={<IconRefresh size={13} />}
                onClick={handleClearChanges}
                disabled={!working.isDirty || busy}
              >
                Clear Changes
              </Button>
            </Tooltip>

            <Tooltip
              label={
                mode === 'standard'
                  ? 'Standard plugin is already active — nothing to restore'
                  : 'Archive custom YAML and revert to hardcoded standard plugin'
              }
              withArrow
              openDelay={400}
            >
              <Button
                size="xs"
                variant="outline"
                color="red"
                leftSection={<IconArrowBack size={13} />}
                onClick={handleRestoreDefaults}
                disabled={mode === 'standard' || busy}
              >
                Restore Defaults
              </Button>
            </Tooltip>

            <Tooltip
              label={
                !isIdle
                  ? 'Machine must be idle (no active battle) to apply changes'
                  : !working.isDirty
                  ? 'No unsaved changes to submit'
                  : 'Save YAML to disk and apply it as the active plugin'
              }
              withArrow
              openDelay={400}
            >
              <Button
                size="xs"
                color="green"
                leftSection={<IconDeviceFloppy size={13} />}
                onClick={handleSubmit}
                disabled={submitDisabled}
              >
                Submit
              </Button>
            </Tooltip>
          </Group>
        </Group>

        {!isIdle && working.isDirty && (
          <Text size="xs" c="orange" mt={4}>
            Submit is disabled — machine must be idle to apply changes.
          </Text>
        )}
      </Box>

      {/* ── Status notification ── */}
      {status && (
        <Notification
          icon={status.kind === 'success' ? <IconCheck size={16} /> : <IconAlertCircle size={16} />}
          color={status.kind === 'error' ? 'red' : status.kind === 'success' ? 'green' : 'blue'}
          onClose={() => setStatus(null)}
          m="sm"
          style={{ flexShrink: 0 }}
        >
          {status.text}
        </Notification>
      )}

      {/* ── Scrollable editor body ── */}
      <ScrollArea style={{ flex: 1 }}>
        <PluginTreeEditor config={working.config} onChange={handleChange} />
      </ScrollArea>

    </Box>
  )
}
