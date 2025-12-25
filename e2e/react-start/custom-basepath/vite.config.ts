import { defineConfig } from 'vite'
import tsConfigPaths from 'vite-tsconfig-paths'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { isPrerender } from './tests/utils/isPrerender'

const prerenderConfiguration = {
  enabled: true,
  filter: (page: { path: string }) => {
    return ![
      '/i-do-not-exist',
      '/this-route-does-not-exist',
      '/redirect',
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
      vite: { installDevServerMiddleware: true },
      prerender: isPrerender ? prerenderConfiguration : undefined,
    }),
    viteReact(),
  ],
})
