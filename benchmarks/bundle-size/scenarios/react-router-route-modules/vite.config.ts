import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { generateFeatureModule } from '../../modules/feature/generate'

// The minimal app with a mounted route module, which must be generated first.
await generateFeatureModule()

export default defineConfig({
  plugins: [
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
      routeModules: {
        includes: [{ module: '@benchmarks/feature', at: '/feature' }],
      },
    }),
    react(),
  ],
})
