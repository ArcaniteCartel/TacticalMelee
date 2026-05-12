// Root editor tree — renders the full plugin config as an editable form.
//
// Layout:
//   1. Top-level known fields (pluginName, beatsPerTC, minAdjustedTimerSeconds)
//   2. Top-level custom extra fields (ExtraFieldsTree)
//   3. Stages accordion (one collapsible panel per stage via StagePanel)
//   4. Add Stage button → AddStageModal

import React, { useState } from 'react'
import {
  Stack, Text, TextInput, NumberInput, Accordion, Button,
  Divider, Box, Group, Badge,
} from '@mantine/core'
import { IconPlus } from '@tabler/icons-react'
import { StagePanel }     from './StagePanel'
import { ExtraFieldsTree } from './ExtraFieldsTree'
import { AddStageModal }  from './AddStageModal'
import type { EditorConfig, EditorStage } from '../editorTypes'

interface PluginTreeEditorProps {
  config:   EditorConfig
  onChange: (config: EditorConfig) => void
}

export function PluginTreeEditor({ config, onChange }: PluginTreeEditorProps): JSX.Element {
  const [addStageOpen, setAddStageOpen] = useState(false)

  function topField<K extends keyof EditorConfig>(key: K, value: EditorConfig[K]): void {
    onChange({ ...config, [key]: value })
  }

  function updateStage(index: number, stage: EditorStage): void {
    const stages = [...config.stages]
    stages[index] = stage
    onChange({ ...config, stages })
  }

  function deleteStage(index: number): void {
    onChange({ ...config, stages: config.stages.filter((_, i) => i !== index) })
  }

  function addStage(stage: EditorStage): void {
    onChange({ ...config, stages: [...config.stages, stage] })
    setAddStageOpen(false)
  }

  return (
    <Stack gap="lg" p="md">

      {/* ── Top-level known fields ── */}
      <Box>
        <Text size="sm" fw={600} tt="uppercase" c="dimmed" mb="sm" style={{ letterSpacing: '0.07em' }}>
          Plugin Configuration
        </Text>
        <Stack gap="sm">
          <TextInput
            label="Plugin Name"
            value={config.pluginName}
            onChange={(e) => topField('pluginName', e.target.value)}
          />
          <Group grow>
            <NumberInput
              label="Beats per TC"
              description="Total beat budget for one Tactical Cycle"
              value={config.beatsPerTC}
              min={1}
              onChange={(v) => topField('beatsPerTC', Number(v))}
            />
            <NumberInput
              label="Min Adjusted Timer (s)"
              description="StagePlanner will never produce a shorter countdown than this"
              value={config.minAdjustedTimerSeconds}
              min={1}
              onChange={(v) => topField('minAdjustedTimerSeconds', Number(v))}
            />
          </Group>
        </Stack>
      </Box>

      {/* ── Top-level custom extra fields ── */}
      <Box>
        <Divider label="Custom Top-Level Fields" labelPosition="left" mb="sm" />
        <ExtraFieldsTree
          nodes={config.topLevelExtras}
          onChange={(nodes) => topField('topLevelExtras', nodes)}
        />
      </Box>

      {/* ── Stages ── */}
      <Box>
        <Divider label="Stages" labelPosition="left" mb="sm" />

        <Accordion multiple chevronPosition="left" variant="separated">
          {config.stages.map((stage, index) => (
            <Accordion.Item
              key={stage.id || `stage-${index}`}
              value={stage.id || `stage-${index}`}
              style={{ border: '1px solid var(--tm-border)', borderRadius: 4 }}
            >
              <Accordion.Control>
                <Group gap="xs">
                  <Text size="sm" fw={500}>{stage.name || '(unnamed)'}</Text>
                  <Badge size="xs" variant="outline" color="gray">{stage.type}</Badge>
                  {stage.beats > 0 && (
                    <Badge size="xs" variant="light" color="blue">{stage.beats}b</Badge>
                  )}
                  {stage.timerSeconds !== undefined && (
                    <Badge size="xs" variant="light" color="teal">{stage.timerSeconds}s</Badge>
                  )}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <StagePanel
                  stage={stage}
                  onChange={(updated) => updateStage(index, updated)}
                  onDelete={() => deleteStage(index)}
                />
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>

        <Button
          variant="outline"
          leftSection={<IconPlus size={14} />}
          onClick={() => setAddStageOpen(true)}
          mt="sm"
          size="sm"
        >
          Add Stage
        </Button>
      </Box>

      <AddStageModal
        opened={addStageOpen}
        onClose={() => setAddStageOpen(false)}
        onAdd={addStage}
      />

    </Stack>
  )
}
