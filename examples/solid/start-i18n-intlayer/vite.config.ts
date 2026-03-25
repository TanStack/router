import { intlayer, intlayerProxy } from 'vite-intlayer'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'

import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

import solidPlugin from 'vite-plugin-solid'

export default defineConfig({
  plugins: [
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    tanstackStart({
      router: {
        routeFileIgnorePattern:
          '.content.(ts|tsx|js|mjs|cjs|jsx|json|jsonc|json5)$',
      },
    }),
    solidPlugin({ ssr: true }),
    intlayer(),
    intlayerProxy(),
  ],
})
