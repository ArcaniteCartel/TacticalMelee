// Recursive editable tree for arbitrary user-defined key-value fields.
//
// Each node is either a LEAF (key + value, no children) or a BRANCH (key + child nodes).
// The "Add child" button converts a leaf to a branch and adds the first child.
// Branches show "(nested)" instead of a value input.
// Visual nesting: indentation + left border per depth level.

import React from 'react'
import { Stack, Group, TextInput, ActionIcon, Text, Box, Button } from '@mantine/core'
import { IconPlus, IconTrash, IconCornerDownRight } from '@tabler/icons-react'
import type { ExtraNode } from '../editorTypes'

function genId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function blankNode(): ExtraNode {
  return { id: genId(), key: '', value: '', children: [] }
}

interface ExtraFieldsTreeProps {
  nodes: ExtraNode[]
  onChange: (nodes: ExtraNode[]) => void
  depth?: number
}

export function ExtraFieldsTree({ nodes, onChange, depth = 0 }: ExtraFieldsTreeProps): JSX.Element {
  function update(index: number, updated: ExtraNode): void {
    const next = [...nodes]
    next[index] = updated
    onChange(next)
  }

  function remove(index: number): void {
    onChange(nodes.filter((_, i) => i !== index))
  }

  function addSibling(): void {
    onChange([...nodes, blankNode()])
  }

  function addChild(index: number): void {
    const node = nodes[index]
    update(index, { ...node, value: '', children: [...node.children, blankNode()] })
  }

  return (
    <Stack gap={6} style={{ paddingLeft: depth > 0 ? 12 : 0, borderLeft: depth > 0 ? '2px solid var(--tm-border)' : 'none' }}>
      {nodes.map((node, index) => (
        <Box key={node.id}>
          <Group gap={6} align="center" wrap="nowrap">
            {/* Key input */}
            <TextInput
              placeholder="key"
              size="xs"
              value={node.key}
              onChange={(e) => update(index, { ...node, key: e.target.value })}
              style={{ flex: '0 0 130px' }}
              styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
            />

            {/* Value input (leaf) or "(nested)" label (branch) */}
            {node.children.length === 0 ? (
              <TextInput
                placeholder="value"
                size="xs"
                value={node.value}
                onChange={(e) => update(index, { ...node, value: e.target.value })}
                style={{ flex: 1 }}
                styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
              />
            ) : (
              <Text size="xs" c="dimmed" style={{ flex: 1 }}>
                (nested — {node.children.length} child{node.children.length !== 1 ? 'ren' : ''})
              </Text>
            )}

            {/* Add child button */}
            <ActionIcon
              size="sm"
              variant="subtle"
              color="blue"
              onClick={() => addChild(index)}
              title="Add child field"
            >
              <IconCornerDownRight size={13} />
            </ActionIcon>

            {/* Delete button */}
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              onClick={() => remove(index)}
              title="Delete field"
            >
              <IconTrash size={13} />
            </ActionIcon>
          </Group>

          {/* Recursive children */}
          {node.children.length > 0 && (
            <Box mt={4} ml={8}>
              <ExtraFieldsTree
                nodes={node.children}
                onChange={(children) => update(index, { ...node, children })}
                depth={depth + 1}
              />
            </Box>
          )}
        </Box>
      ))}

      <Button
        size="xs"
        variant="subtle"
        color="gray"
        leftSection={<IconPlus size={12} />}
        onClick={addSibling}
        style={{ alignSelf: 'flex-start' }}
      >
        Add field
      </Button>
    </Stack>
  )
}
