import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@mantine/core/styles.css'
import '../styles.css'
import { ThemeProvider } from '../context/ThemeContext'
import { EditorApp } from './EditorApp'

createRoot(document.getElementById('editor-root')!).render(
  <StrictMode>
    <ThemeProvider>
      <EditorApp />
    </ThemeProvider>
  </StrictMode>
)
