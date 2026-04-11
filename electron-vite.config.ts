import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        // ws has optional native deps that aren't installed — exclude them
        external: ['bufferutil', 'utf-8-validate']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve('src/renderer'),
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          hud:   resolve('src/renderer/hud.html'),
        }
      }
    },
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared':   resolve('src/shared'),
      }
    },
    plugins: [react({ jsxRuntime: 'automatic' })],
    css: {
      postcss: {
        plugins: [
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('postcss-preset-mantine'),
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          require('postcss-simple-vars')({
            variables: {
              'mantine-breakpoint-xs': '36em',
              'mantine-breakpoint-sm': '48em',
              'mantine-breakpoint-md': '62em',
              'mantine-breakpoint-lg': '75em',
              'mantine-breakpoint-xl': '88em',
            }
          })
        ]
      }
    }
  }
})
