// Modal for creating a new stage entry.
// User selects a registered stage type and provides an id and name.
// Beat / timer fields are pre-populated with per-type sensible defaults.

import React, { useState } from 'react'
import { Modal, Stack, Select, TextInput, Button, Group, Text } from '@mantine/core'
import type { EditorStage } from '../editorTypes'
import { REGISTERED_STAGE_TYPES, STAGE_TYPE_DEFAULTS } from '../editorTypes'
import type { StageType } from '@shared/types'

const TYPE_OPTIONS = REGISTERED_STAGE_TYPES.map((t) => ({
  value: t,
  label: t
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' '),
}))

interface AddStageModalProps {
  opened: boolean
  onClose: () => void
  onAdd: (stage: EditorStage) => void
}

export function AddStageModal({ opened, onClose, onAdd }: AddStageModalProps): JSX.Element {
  const [type, setType] = useState<StageType>('timed')
  const [id,   setId]   = useState('')
  const [name, setName] = useState('')
  const [err,  setErr]  = useState('')

  function reset(): void {
    setType('timed')
    setId('')
    setName('')
    setErr('')
  }

  function handleAdd(): void {
    if (!id.trim())   { setErr('ID is required.');   return }
    if (!name.trim()) { setErr('Name is required.'); return }

    const defaults = STAGE_TYPE_DEFAULTS[type] ?? {}
    const stage: EditorStage = {
      id:                  id.trim(),
      name:                name.trim(),
      type,
      beats:               defaults.beats               ?? 0,
      timerSeconds:        defaults.timerSeconds,
      canPass:             defaults.canPass,
      description:         '',
      roundVisibility:     [],
      spinTime:            defaults.spinTime             ?? 0,
      calculationSequence: undefined,
      extras:              [],
    }
    onAdd(stage)
    reset()
  }

  function handleClose(): void {
    reset()
    onClose()
  }

  return (
    <Modal opened={opened} onClose={handleClose} title="Add Stage" size="sm">
      <Stack gap="sm">
        <Select
          label="Stage Type"
          data={TYPE_OPTIONS}
          value={type}
          onChange={(v) => v && setType(v as StageType)}
        />
        <TextInput
          label="ID"
          description="Unique identifier used in YAML (e.g. my-custom-action)"
          value={id}
          onChange={(e) => setId(e.target.value)}
        />
        <TextInput
          label="Name"
          description="Display name shown in the dashboard and HUD"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {err && <Text size="xs" c="red">{err}</Text>}
        <Group justify="flex-end" mt="xs">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleAdd}>Add Stage</Button>
        </Group>
      </Stack>
    </Modal>
  )
}
