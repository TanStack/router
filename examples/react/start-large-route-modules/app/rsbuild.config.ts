import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'
import { routeModules } from './route-modules.gen'

export default defineConfig({
  server: {
    port: 3000,
  },
  plugins: [pluginReact(), tanstackStart({ router: { routeModules } })],
})
