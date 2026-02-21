import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      router: {
        autoCodeSplitting: true,
      } as any,
    }),
    solid({ ssr: true }),
  ],
})
