// Editable panel for a single stage definition inside the Accordion.
// Renders known StageDefinition fields with appropriate typed inputs,
// then an ExtraFieldsTree for arbitrary user-defined fields.

import React from 'react'
import {
  Stack, TextInput, NumberInput, Select, Switch, Textarea,
  Group, Button, Tooltip, Divider, Text,
} from '@mantine/core'
import { IconTrash } from '@tabler/icons-react'
import { ExtraFieldsTree } from './ExtraFieldsTree'
import type { EditorStage } from '../editorTypes'
import { REGISTERED_STAGE_TYPES } from '../editorTypes'

const TYPE_OPTIONS = REGISTERED_STAGE_TYPES.map((t) => ({
  value: t,
  label: t
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' '),
}))

// Stage types that use a real-time countdown timer.
function hasTimer(type: EditorStage['type']): boolean {
  return type === 'timed' || type === 'action' || type === 'response'
}

interface StagePanelProps {
  stage:    EditorStage
  onChange: (stage: EditorStage) => void
  onDelete: () => void
}

export function StagePanel({ stage, onChange, onDelete }: StagePanelProps): JSX.Element {
  function field<K extends keyof EditorStage>(key: K, value: EditorStage[K]): void {
    onChange({ ...stage, [key]: value })
  }

  return (
    <Stack gap="sm" p="xs">

      {/* Delete */}
      <Group justify="flex-end">
        <Tooltip label="Remove this stage from the plugin config" withArrow>
          <Button size="xs" color="red" variant="subtle" leftSection={<IconTrash size={12} />} onClick={onDelete}>
            Delete Stage
          </Button>
        </Tooltip>
      </Group>

      {/* Core identity */}
      <Group grow>
        <TextInput
          label="ID"
          description="YAML key (unique)"
          value={stage.id}
          onChange={(e) => field('id', e.target.value)}
          styles={{ input: { fontFamily: 'monospace' } }}
        />
        <TextInput
          label="Name"
          value={stage.name}
          onChange={(e) => field('name', e.target.value)}
        />
      </Group>

      <Select
        label="Type"
        data={TYPE_OPTIONS}
        value={stage.type}
        onChange={(v) => v && field('type', v as EditorStage['type'])}
      />

      {/* Beat / timer */}
      <Group grow>
        <NumberInput
          label="Beats"
          value={stage.beats}
          min={0}
          onChange={(v) => field('beats', Number(v))}
        />
        {hasTimer(stage.type) && (
          <NumberInput
            label="Timer (seconds)"
            value={stage.timerSeconds ?? 0}
            min={0}
            onChange={(v) => field('timerSeconds', Number(v))}
          />
        )}
        <NumberInput
          label="Spin Time (s)"
          value={stage.spinTime}
          min={0}
          onChange={(v) => field('spinTime', Number(v))}
        />
      </Group>

      {/* Flags */}
      <Switch
        label="Can Pass"
        checked={stage.canPass ?? false}
        onChange={(e) => field('canPass', e.currentTarget.checked)}
      />

      {/* Text fields */}
      <Textarea
        label="Description"
        description="Shown in the HUD message area while this stage is active"
        value={stage.description}
        onChange={(e) => field('description', e.target.value)}
        autosize
        minRows={2}
      />

      <TextInput
        label="Round Visibility"
        description="Comma-separated DSL entries — e.g. A1,I2 (round 1 only) or i1 (round 2+)"
        value={stage.roundVisibility.join(', ')}
        onChange={(e) =>
          field(
            'roundVisibility',
            e.target.value.split(',').map((v) => v.trim()).filter(Boolean),
          )
        }
      />

      <TextInput
        label="Calculation Sequence (optional DSL)"
        value={stage.calculationSequence ?? ''}
        onChange={(e) => field('calculationSequence', e.target.value || undefined)}
        styles={{ input: { fontFamily: 'monospace' } }}
      />

      {/* Arbitrary extra fields */}
      <Divider label="Custom Fields" labelPosition="left" my={4} />
      <ExtraFieldsTree
        nodes={stage.extras}
        onChange={(extras) => field('extras', extras)}
      />

    </Stack>
  )
}
