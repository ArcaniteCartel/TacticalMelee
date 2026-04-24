/**
 * ARCANE THEME
 *
 * Pattern: Mystical order's war table / arcane grimoire.
 * - Deep purple-black background
 * - Violet/purple primary — spells, powers, mystical forces
 * - Gold accent — ancient authority, legendary items, faction emblems
 * - Small border radius — slightly worn edges, not fully sharp
 * - Timer colours: violet → gold → crimson (arcane power draining)
 *
 * Expand by: subtle glow effects on primary elements (box-shadow with
 * violet tint), parchment-style tooltip backgrounds, runic decorative
 * borders on card components.
 */

import { createTheme, CSSVariablesResolver, MantineColorsTuple } from '@mantine/core'

const arcaneViolet: MantineColorsTuple = [
  '#f4f0ff',
  '#e6deff',
  '#ccbeff',
  '#b09aff',
  '#9475f0',
  '#7c5be0',
  '#6848cc',
  '#5236a8',
  '#3c2680',
  '#261558',
]

export const arcaneTheme = createTheme({
  primaryColor: 'arcaneViolet',
  primaryShade: { light: 7, dark: 5 },
  defaultRadius: 'sm',
  colors: { arcaneViolet },
})

export const arcaneVarsResolver: CSSVariablesResolver = () => ({
  variables: {
    '--tm-body-bg':        '#0c0a18',
    '--tm-surface':        '#140f2a',
    '--tm-surface-raised': '#1c1540',
    '--tm-border':         '#2e2060',
    '--tm-accent':         '#d4af37',
    '--tm-accent-dim':     '#7a641e',
    '--tm-danger':         '#e53e3e',
    '--tm-success':        '#48bb78',
    '--tm-warning':        '#d4af37',
    '--tm-timer-active':      '#7c5be0',
    '--tm-timer-warning':     '#d4af37',
    '--tm-timer-critical':    '#e53e3e',
    '--tm-inactive-bg':       '#140f2a',
    '--tm-inactive-text':     '#2e2060',
    '--tm-inactive-border':   '#221840',
    '--tm-danger-zone-bg':    '#1a0d0d',
    '--tm-danger-zone-text':  '#8a2020',
    '--tm-danger-zone-border':'#3d1010',
  },
  light: {},
  dark: {
    '--mantine-color-body': '#0c0a18',
  },
})

export const arcaneMeta = {
  name:        'Arcane',
  description: 'Mystical grimoire — violet depths, gold authority',
  swatches:    ['#0c0a18', '#7c5be0', '#d4af37'],
}
