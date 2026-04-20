import React from 'react'
import { Stack, Box, Text, Group, Divider } from '@mantine/core'
import { IconCheck, IconUser, IconClock, IconSettings } from '@tabler/icons-react'
import type { StageDefinition } from '@shared/types'

interface StageListProps {
  stages: StageDefinition[]
  currentIndex: number
  machineState: string
}

// Icon map for stage types shown on upcoming/active stages.
// 'action' and 'response' intentionally fall through to the empty fragment —
// they are timed types but visually distinct; icons will be added when art is finalised.
// 'system-complete' is a legacy alias kept for backwards compatibility with old plugin configs.
function stageTypeIcon(type: StageDefinition['type'], size = 14): JSX.Element {
  if (type === 'gm-release')      return <IconUser size={size} />
  if (type === 'timed')           return <IconClock size={size} />
  if (type === 'system-complete') return <IconSettings size={size} />
  return <></>
}

interface StageEntry { stage: StageDefinition; idx: number }

/**
 * A render group is either a preamble entry (no tierIndex — rendered without a header)
 * or an Action Tier group (three triad stages sharing the same tierIndex, rendered under
 * a labeled divider with a connecting left border).
 */
interface RenderGroup {
  kind: 'preamble' | 'tier'
  tierIndex: number   // -1 for preamble groups
  entries: StageEntry[]
}

/**
 * Partitions a flat stage array into render groups.
 * Consecutive triad stages with the same tierIndex form a tier group.
 * Stages without a tierIndex are collected individually as preamble groups.
 */
function buildGroups(stages: StageDefinition[]): RenderGroup[] {
  const groups: RenderGroup[] = []
  let currentTier: RenderGroup | null = null

  for (let i = 0; i < stages.length; i++) {
    const stage = stages[i]
    if (stage.tierIndex === undefined) {
      // Flush any open tier group before starting a preamble entry
      if (currentTier) { groups.push(currentTier); currentTier = null }
      groups.push({ kind: 'preamble', tierIndex: -1, entries: [{ stage, idx: i }] })
    } else {
      if (!currentTier || currentTier.tierIndex !== stage.tierIndex) {
        if (currentTier) groups.push(currentTier)
        currentTier = { kind: 'tier', tierIndex: stage.tierIndex, entries: [] }
      }
      currentTier.entries.push({ stage, idx: i })
    }
  }
  if (currentTier) groups.push(currentTier)
  return groups
}

export function StageList({ stages, currentIndex, machineState }: StageListProps): JSX.Element {
  const isComplete = machineState === 'tcComplete'
  const groups = buildGroups(stages)

  return (
    <Stack gap="sm">
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.1em' }}>
        Stages
      </Text>

      {groups.map((group) => {
        if (group.kind === 'preamble') {
          // Preamble stages render exactly as before — no tier header or border
          const { stage, idx } = group.entries[0]
          return <StageCard key={stage.id} stage={stage} idx={idx} currentIndex={currentIndex} isComplete={isComplete} />
        }

        // Tier group: determine overall tier state for header colour and border
        const maxIdx     = group.entries[group.entries.length - 1].idx
        const minIdx     = group.entries[0].idx
        const tierDone   = maxIdx < currentIndex || isComplete
        const tierActive = group.entries.some(e => e.idx === currentIndex && !isComplete)
        const tierUpcoming = minIdx > currentIndex && !isComplete

        const headerColor = tierActive  ? 'var(--tm-accent)'
                          : tierDone    ? 'var(--mantine-color-dimmed)'
                          : 'var(--mantine-color-dimmed)'

        const borderColor = tierActive  ? 'var(--tm-accent)'
                          : tierDone    ? 'var(--tm-border)'
                          : 'var(--tm-border)'

        const headerOpacity = tierUpcoming ? 0.4 : tierDone ? 0.6 : 1

        return (
          <Box key={`tier-${group.tierIndex}`}>
            {/* Tier divider label — "Tier 1", "Tier 2", etc. */}
            <Divider
              my={4}
              color="var(--tm-border)"
              label={
                <Text
                  size="xs"
                  fw={600}
                  tt="uppercase"
                  style={{ color: headerColor, letterSpacing: '0.1em', opacity: headerOpacity }}
                >
                  Tier {group.tierIndex + 1}
                </Text>
              }
            />

            {/* Tier stage cards — connected by a left border indicating they are a unit */}
            <Box style={{ borderLeft: `2px solid ${borderColor}`, paddingLeft: '0.5rem' }}>
              <Stack gap={4}>
                {group.entries.map(({ stage, idx }) => (
                  <StageCard key={stage.id} stage={stage} idx={idx} currentIndex={currentIndex} isComplete={isComplete} />
                ))}
              </Stack>
            </Box>
          </Box>
        )
      })}
    </Stack>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Formats a beat count for display. Whole numbers render without a decimal (e.g. "4");
 * fractional values (carry-inflated stages) render at 1dp (e.g. "4.7"). This matches the
 * 1dp precision used by the beats burndown so consumed + carry always appear consistent.
 */
function formatBeats(b: number): string {
  return Number.isInteger(b) ? String(b) : b.toFixed(1)
}

// ── StageCard ────────────────────────────────────────────────────────────────

interface StageCardProps {
  stage: StageDefinition
  idx: number
  currentIndex: number
  isComplete: boolean
}

function StageCard({ stage, idx, currentIndex, isComplete }: StageCardProps): JSX.Element {
  // Three mutually exclusive visual states for each stage card:
  // isDone     — stage has already been processed this round (or the whole TC is complete)
  // isActive   — the stage the machine is currently in
  // isUpcoming — not yet reached; rendered at reduced opacity to de-emphasise
  const isDone     = idx < currentIndex || isComplete
  const isActive   = idx === currentIndex && !isComplete
  const isUpcoming = idx > currentIndex && !isComplete

  return (
    <Box
      style={{
        padding: '0.6rem 0.75rem',
        borderRadius: 'var(--mantine-radius-default)',
        border: `1px solid ${isActive ? 'var(--tm-accent)' : 'var(--tm-border)'}`,
        backgroundColor: isActive ? 'var(--tm-surface-raised)' : 'transparent',
        opacity: isUpcoming ? 0.4 : isDone ? 0.55 : 1,
        transition: 'all 200ms ease',
        // Subtle glow on the active stage
        boxShadow: isActive ? '0 0 8px var(--tm-accent)' : 'none',
      }}
    >
      <Group justify="space-between" align="center">
        <Group gap={6} align="center">
          <Box style={{ color: isActive ? 'var(--tm-accent)' : 'var(--mantine-color-dimmed)' }}>
            {isDone ? <IconCheck size={14} /> : stageTypeIcon(stage.type)}
          </Box>
          <Text
            size="sm"
            fw={isActive ? 700 : 400}
            style={{ color: isActive ? 'var(--tm-accent)' : undefined }}
          >
            {stage.name}
          </Text>
        </Group>

        {/* Only show beat allocation on active/upcoming stages.
            Completed stages omit it: a released stage's allocation ≠ actual beats consumed,
            so showing it would be misleading. The burndown bar is the authoritative total.
            Beats are displayed at 1dp when fractional (e.g. carry-inflated 4.7b) and as
            integers otherwise (4b), matching the burndown's toFixed(1) precision. */}
        {!isDone && stage.beats > 0 && (
          <Text size="xs" c="dimmed">{formatBeats(stage.beats)}b</Text>
        )}
      </Group>

      {isActive && stage.type === 'timed' && stage.timerSeconds && (
        <Text size="xs" c="dimmed" mt={2}>
          {stage.timerSeconds}s · {formatBeats(stage.beats)} beat{stage.beats !== 1 ? 's' : ''}
        </Text>
      )}
    </Box>
  )
}
