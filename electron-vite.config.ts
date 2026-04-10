import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react({ jsxRuntime: 'automatic' })],
    css: {
      postcss: {
        plugins: [
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('postcss-preset-mantine'),
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('postcss-simple-vars')({ variables: { 'mantine-breakpoint-xs': '36em', 'mantine-breakpoint-sm': '48em', 'mantine-breakpoint-md': '62em', 'mantine-breakpoint-lg': '75em', 'mantine-breakpoint-xl': '88em' } })
        ]
      }
    }
  }
})
