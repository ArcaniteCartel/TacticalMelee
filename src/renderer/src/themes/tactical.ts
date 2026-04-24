/**
 * TACTICAL THEME
 *
 * Pattern: Military ops centre / command display.
 * - Near-black background with a green tint
 * - Military olive-green primary (Mantine primaryColor)
 * - Amber accent — warning lights, highlights, active states
 * - Zero border radius — sharp, no-nonsense edges
 * - Timer colours: green → amber → red (standard ops readiness)
 *
 * Expand by: adding more olive/amber tones to component overrides,
 * using monospaced fonts for numeric readouts, subtle scanline textures.
 */

import { createTheme, CSSVariablesResolver, MantineColorsTuple } from '@mantine/core'

const militaryGreen: MantineColorsTuple = [
  '#f0f5f0',
  '#d4e8d4',
  '#a8d0a8',
  '#78b578',
  '#4f9c4f',
  '#3d8a3d',
  '#327232',
  '#265926',
  '#1a3f1a',
  '#0e280e',
]

export const tacticalTheme = createTheme({
  primaryColor: 'militaryGreen',
  primaryShade: { light: 7, dark: 5 },
  defaultRadius: 'xs',
  colors: { militaryGreen },
})

export const tacticalVarsResolver: CSSVariablesResolver = () => ({
  variables: {
    '--tm-body-bg':        '#080e08',
    '--tm-surface':        '#0d1a0d',
    '--tm-surface-raised': '#112211',
    '--tm-border':         '#243824',
    '--tm-accent':         '#d4a017',
    '--tm-accent-dim':     '#7a5c0d',
    '--tm-danger':         '#c0392b',
    '--tm-success':        '#3d8a3d',
    '--tm-warning':        '#d4a017',
    '--tm-timer-active':      '#3d8a3d',
    '--tm-timer-warning':     '#d4a017',
    '--tm-timer-critical':    '#c0392b',
    '--tm-inactive-bg':       '#0d1a0d',
    '--tm-inactive-text':     '#2d4a2d',
    '--tm-inactive-border':   '#1a2e1a',
    '--tm-danger-zone-bg':    '#1a1200',
    '--tm-danger-zone-text':  '#9a6510',
    '--tm-danger-zone-border':'#3d2800',
  },
  light: {},
  dark: {
    '--mantine-color-body': '#080e08',
  },
})

export const tacticalMeta = {
  name:        'Tactical',
  description: 'Military ops centre — sharp, decisive, green-on-black',
  swatches:    ['#080e08', '#3d8a3d', '#d4a017'],
}
