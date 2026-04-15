import React, { createContext, useContext, useState } from 'react'
import { MantineProvider } from '@mantine/core'
import { THEMES, ThemeName } from '../themes'

// Theme selection is persisted to localStorage so the user's choice survives window reloads.
// Falls back to 'tactical' if no valid stored value is found.
const STORAGE_KEY = 'tm-theme'
const DEFAULT_THEME: ThemeName = 'tactical'

interface ThemeContextValue {
  themeName: ThemeName
  setTheme: (name: ThemeName) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [themeName, setThemeName] = useState<ThemeName>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null
    return stored && stored in THEMES ? stored : DEFAULT_THEME
  })

  function setTheme(name: ThemeName): void {
    localStorage.setItem(STORAGE_KEY, name)
    setThemeName(name)
  }

  const { theme, varsResolver } = THEMES[themeName]

  return (
    <ThemeContext.Provider value={{ themeName, setTheme }}>
      <MantineProvider theme={theme} cssVariablesResolver={varsResolver} defaultColorScheme="dark">
        {children}
      </MantineProvider>
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
