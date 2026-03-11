import { paraglideVitePlugin } from '@inlang/paraglide-js'
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import viteSolid from 'vite-plugin-solid'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

const config = defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      cookieName: 'PARAGLIDE_LOCALE',
      strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
      urlPatterns: [
        {
          pattern: '/',
          localized: [
            ['en', '/en'],
            ['de', '/de'],
          ],
        },
        {
          pattern: '/about',
          localized: [
            ['en', '/en/about'],
            ['de', '/de/ueber'],
          ],
        },
        {
          pattern: '/:path(.*)?',
          localized: [
            ['en', '/en/:path(.*)?'],
            ['de', '/de/:path(.*)?'],
          ],
        },
      ],
    }),
    viteTsConfigPaths(),
    tanstackStart(),
    viteSolid({ ssr: true }),
    tailwindcss(),
  ],
})

export default config
