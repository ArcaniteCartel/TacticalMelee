import { MantineThemeOverride, CSSVariablesResolver } from '@mantine/core'
import { tacticalTheme, tacticalVarsResolver, tacticalMeta } from './tactical'
import { arcaneTheme, arcaneVarsResolver, arcaneMeta } from './arcane'
import { ironTheme, ironVarsResolver, ironMeta } from './iron'

export type ThemeName = 'tactical' | 'arcane' | 'iron'

/**
 * A theme entry bundles three things:
 *  - theme:       Mantine theme override (colors, typography, etc.)
 *  - varsResolver: maps Mantine CSS vars → TacticalMelee's --tm-* custom properties
 *  - meta:        display name, description, and preview swatches for the settings UI
 *
 * To add a new theme: create a file in this directory, export these three objects,
 * import them here, and add a new entry to THEMES. No other files need changing.
 */
export interface ThemeEntry {
  theme: MantineThemeOverride
  varsResolver: CSSVariablesResolver
  meta: { name: string; description: string; swatches: string[] }
}

export const THEMES: Record<ThemeName, ThemeEntry> = {
  tactical: { theme: tacticalTheme, varsResolver: tacticalVarsResolver, meta: tacticalMeta },
  arcane:   { theme: arcaneTheme,   varsResolver: arcaneVarsResolver,   meta: arcaneMeta   },
  iron:     { theme: ironTheme,     varsResolver: ironVarsResolver,     meta: ironMeta     },
}

export const THEME_NAMES = Object.keys(THEMES) as ThemeName[]
