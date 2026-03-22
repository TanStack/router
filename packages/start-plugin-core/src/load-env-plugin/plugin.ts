import { loadEnv } from 'vite'
import type { Plugin } from 'vite'

export function loadEnvPlugin(): Plugin {
  return {
    name: 'tanstack-start-core:load-env',
    enforce: 'pre',
    config(userConfig, { mode }) {
      const root = userConfig.root || process.cwd()
      const env = loadEnv(mode, root, '')

      Object.assign(process.env, env)

      const define: Record<string, string> = {}
      for (const [key, value] of Object.entries(env)) {
        define[`process.env.${key}`] = JSON.stringify(value)
      }

      return {
        define: {
          ...userConfig.define,
          ...define,
        },
      }
    },
  }
}
