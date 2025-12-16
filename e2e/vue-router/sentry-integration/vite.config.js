import { defineConfig } from 'vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import vueJsx from '@vitejs/plugin-vue-jsx'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vueJsx(), sentryVitePlugin()],
})
