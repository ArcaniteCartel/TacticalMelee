/**
 * IRON THEME
 *
 * Pattern: Forge / industrial / battle-tested metal.
 * - Dark charcoal background with a cold blue-grey tint
 * - Steel blue primary — armour, fortifications, disciplined order
 * - Ember orange accent — heat of the forge, fire, urgency
 * - Medium border radius — rounded like hammered metal edges
 * - Timer colours: steel blue → orange → ember red (heat rising)
 *
 * Expand by: subtle metallic gradient on panel headers, riveted-border
 * decorative elements, heavy font weight on headers to evoke forged
 * lettering. Ember orange works well as a danger/urgency signal throughout.
 */

import { createTheme, CSSVariablesResolver, MantineColorsTuple } from '@mantine/core'

const steelBlue: MantineColorsTuple = [
  '#eef2f8',
  '#d3dff0',
  '#a8c0e0',
  '#7ba0cf',
  '#5282be',
  '#3d6aac',
  '#315698',
  '#254280',
  '#1a2f62',
  '#0f1d44',
]

export const ironTheme = createTheme({
  primaryColor: 'steelBlue',
  primaryShade: { light: 7, dark: 5 },
  defaultRadius: 'md',
  colors: { steelBlue },
})

export const ironVarsResolver: CSSVariablesResolver = () => ({
  variables: {
    '--tm-body-bg':        '#0e1014',
    '--tm-surface':        '#161920',
    '--tm-surface-raised': '#1e2330',
    '--tm-border':         '#2a3048',
    '--tm-accent':         '#e85d04',
    '--tm-accent-dim':     '#7a3202',
    '--tm-danger':         '#e53e3e',
    '--tm-success':        '#48bb78',
    '--tm-warning':        '#f4a261',
    '--tm-timer-active':      '#3d6aac',
    '--tm-timer-warning':     '#f4a261',
    '--tm-timer-critical':    '#e85d04',
    '--tm-inactive-bg':       '#161920',
    '--tm-inactive-text':     '#2a3048',
    '--tm-inactive-border':   '#1e2330',
    '--tm-danger-zone-bg':    '#1a1008',
    '--tm-danger-zone-text':  '#9a4010',
    '--tm-danger-zone-border':'#3d1e08',
  },
  light: {},
  dark: {
    '--mantine-color-body': '#0e1014',
  },
})

export const ironMeta = {
  name:        'Iron',
  description: 'Forged steel — cold blue, ember fire',
  swatches:    ['#0e1014', '#3d6aac', '#e85d04'],
}
