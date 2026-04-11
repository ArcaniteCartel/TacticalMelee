import React from 'react'
import { Stack, Text, Box } from '@mantine/core'

interface BeatsBurndownProps {
  beatsRemaining: number
  totalBeats: number
  machineState: string
}

export function BeatsBurndown({ beatsRemaining, totalBeats, machineState }: BeatsBurndownProps): JSX.Element {
  const fraction = totalBeats > 0 ? Math.min(1, Math.max(0, beatsRemaining / totalBeats)) : 1
  const isPaused = machineState === 'stagePaused'

  const barColor =
    fraction > 0.5
      ? 'var(--tm-timer-active)'
      : fraction > 0.2
      ? 'var(--tm-timer-warning)'
      : fraction > 0
      ? 'var(--tm-timer-critical)'
      : 'var(--tm-border)'

  const BAR_HEIGHT = 320

  // Marker sits at the top of the remaining fill (i.e. the consumed/remaining boundary)
  // fraction=1 → marker at top (0% from top); fraction=0 → marker at bottom (100% from top)
  const markerTopPct = (1 - fraction) * 100
  const beatsConsumed = totalBeats > 0 ? totalBeats - beatsRemaining : 0

  return (
    <Stack gap={6} align="center" style={{ height: '100%', justifyContent: 'center' }}>
      <Text size="xs" c="dimmed" tt="uppercase" fw={600} style={{ letterSpacing: '0.1em', writingMode: 'horizontal-tb' }}>
        Beats
      </Text>

      {/* Beats consumed label — above the track */}
      <Text
        size="xs"
        c="dimmed"
        fw={500}
        style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}
      >
        -{beatsConsumed.toFixed(1)}
      </Text>

      {/* Track */}
      <Box
        style={{
          width: 28,
          height: BAR_HEIGHT,
          backgroundColor: 'var(--tm-surface)',
          border: '1px solid var(--tm-border)',
          borderRadius: 4,
          position: 'relative',
          overflow: 'visible',
        }}
      >
        {/* Fill — grows from bottom */}
        <Box
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            height: `${fraction * 100}%`,
            backgroundColor: barColor,
            opacity: isPaused ? 0.5 : 1,
            transition: isPaused ? 'none' : 'height 800ms ease, background-color 400ms ease',
            borderRadius: 3,
            overflow: 'hidden',
          }}
        />

        {/* Marker line at the consumed/remaining boundary */}
        <Box
          style={{
            position: 'absolute',
            top: `${markerTopPct}%`,
            left: -6,
            right: -6,
            height: 2,
            backgroundColor: barColor,
            opacity: isPaused ? 0.5 : 0.9,
            transition: isPaused ? 'none' : 'top 800ms ease, background-color 400ms ease',
            borderRadius: 1,
          }}
        />
      </Box>

      {/* Beats remaining label — below the track */}
      <Text
        size="xs"
        fw={600}
        style={{ color: barColor, fontVariantNumeric: 'tabular-nums', transition: 'color 400ms ease' }}
      >
        {beatsRemaining.toFixed(1)}
      </Text>
    </Stack>
  )
}
