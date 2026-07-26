import { cloudflare } from '@cloudflare/vite-plugin'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/octane-start/plugin/vite'

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' }, inspectorPort: false }),
    tanstackStart(),
  ],
})
