import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/vue-start/plugin/vite'
import vue from '@vitejs/plugin-vue'
import vueJsx from '@vitejs/plugin-vue-jsx'
import tailwindcss from '@tailwindcss/vite'
import { isPrerender } from './tests/utils/isPrerender'

const prerenderConfiguration = {
  enabled: true,
  filter: (page: { path: string }) => {
    return ![
      '/i-do-not-exist',
      '/posts',
      '/redirect',
      '/this-route-does-not-exist',
      '/users',
    ].some((p) => page.path.includes(p))
  },
  onSuccess: ({ page }: { page: { path: string } }) => {
    console.log(`Rendered ${page.path}!`)
  },
}

export default defineConfig({
  base: `/custom/basepath${process.env.TRAILING_SLASH?.toLowerCase() === 'true' ? '/' : ''}`,
  server: {
    port: 3000,
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tanstackStart({
      prerender: isPrerender ? prerenderConfiguration : undefined,
    }),
    vue(),
    vueJsx(),
  ],
})
