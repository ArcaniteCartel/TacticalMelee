import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
import '../styles.css'
import { ThemeProvider } from '../context/ThemeContext'
import { HudApp } from './HudApp'

createRoot(document.getElementById('hud-root')!).render(
  <StrictMode>
    <ThemeProvider>
      <HudApp />
    </ThemeProvider>
  </StrictMode>
)
