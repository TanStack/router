import { defineConfig } from 'vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { tanstackRouter } from '@tanstack/router-plugin/vite'

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'vue', autoCodeSplitting: true }),
    vueJsx(),
  ],
})
