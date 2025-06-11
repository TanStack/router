import * as vite from 'vite'
import type { TanStackStartOutputConfig } from '../plugin'

export function loadEnvPlugin(
  startOpts: TanStackStartOutputConfig,
): vite.Plugin {
  return {
    name: 'tanstack-vite-plugin-nitro-load-env',
    enforce: 'pre',
    config(userConfig, envConfig) {
      Object.assign(
        process.env,
        vite.loadEnv(envConfig.mode, userConfig.root ?? startOpts.root, ''),
      )
    },
  }
}
