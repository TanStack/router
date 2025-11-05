import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [solid(), sentryVitePlugin()],
})
