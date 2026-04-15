import React from 'react'
import { Stack, Text, Box } from '@mantine/core'

interface BeatsBurndownProps {
  beatsRemaining: number
  totalBeats: number
  machineState: string
}

export function BeatsBurndown({ beatsRemaining, totalBeats, machineState }: BeatsBurndownProps): JSX.Element {
  // Clamp to [0, 1] to guard against momentary over/under values during live ticks.
  const fraction = totalBeats > 0 ? Math.min(1, Math.max(0, beatsRemaining / totalBeats)) : 1
  const isPaused = machineState === 'stagePaused'

  // Three-threshold color ramp mirroring the countdown timer:
  //   > 50%  → active (green)       — plenty of time budget remaining
  //   > 20%  → warning (yellow)     — entering the last quarter of the TC
  //   > 0%   → critical (red)       — nearly exhausted; GM should wrap up fast
  //   = 0%   → border color         — depleted; no beats left
  const barColor =
    fraction > 0.5
      ? 'var(--tm-timer-active)'
      : fraction > 0.2
      ? 'var(--tm-timer-warning)'
      : fraction > 0
      ? 'var(--tm-timer-critical)'
      : 'var(--tm-border)'

  const BAR_HEIGHT = 320

  // Convert fraction to a CSS top% for the marker line.
  // The fill grows from the bottom, so the consumed/remaining boundary is at (1 - fraction) from the top.
  // fraction=1 (full) → 0% from top (marker at very top); fraction=0 (empty) → 100% from top (marker at bottom).
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
