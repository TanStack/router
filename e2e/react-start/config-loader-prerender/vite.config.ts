import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { configValue } from '#config-loader-source'

export default defineConfig({
  define: { __CONFIG_VALUE__: JSON.stringify(configValue) },
  plugins: [
    tanstackStart({
      prerender: { enabled: true },
    }),
  ],
})
