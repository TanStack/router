import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { routes } from './routes'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'vue',
      autoCodeSplitting: true,
      verboseFileRoutes: false,
      virtualRouteConfig: routes,
    }),
    vue(),
    vueJsx(),
  ],
})
