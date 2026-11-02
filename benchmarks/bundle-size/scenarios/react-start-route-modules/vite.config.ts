import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { generateFeatureModule } from '../../modules/feature/generate'

// The minimal app with a mounted route module, which must be generated first.
await generateFeatureModule()

export default defineConfig({
  plugins: [
    tanstackStart({
      router: {
        routeModules: {
          includes: [{ module: '@benchmarks/feature', at: '/feature' }],
        },
      },
    }),
    viteReact(),
  ],
})
