import { MantineThemeOverride, CSSVariablesResolver } from '@mantine/core'
import { tacticalTheme, tacticalVarsResolver, tacticalMeta } from './tactical'
import { arcaneTheme, arcaneVarsResolver, arcaneMeta } from './arcane'
import { ironTheme, ironVarsResolver, ironMeta } from './iron'

export type ThemeName = 'tactical' | 'arcane' | 'iron'

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
