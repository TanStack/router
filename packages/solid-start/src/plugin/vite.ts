import { fileURLToPath } from 'node:url'
import { TanStackStartVitePluginCore } from '@tanstack/start-plugin-core'
import path from 'pathe'
import type { TanStackStartInputConfig } from '@tanstack/start-plugin-core'
import type { PluginOption } from 'vite'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const defaultEntryDir = path.resolve(
  currentDir,
  '..',
  '..',
  'plugin',
  'default-entry',
)
const defaultEntryPaths = {
  client: path.resolve(defaultEntryDir, 'client'),
  server: path.resolve(defaultEntryDir, 'server'),
  start: path.resolve(defaultEntryDir, 'start'),
}

export function tanstackStart(
  options?: TanStackStartInputConfig,
): Array<PluginOption> {
  return [
    TanStackStartVitePluginCore(
      {
        framework: 'solid',
        defaultEntryPaths,
      },
      options,
    ),
  ]
}
