import { fileURLToPath } from 'node:url'
import path from 'pathe'
import { TanStackStartRsbuildPluginCore } from '@tanstack/start-plugin-core/rsbuild'
import type { TanStackStartInputConfig } from '@tanstack/start-plugin-core'

type RsbuildPlugin = {
  name: string
  setup: (api: any) => void
}

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const defaultEntryDir = path.resolve(
  currentDir,
  '..',
  '..',
  'plugin',
  'default-entry',
)
const defaultEntryPaths = {
  client: path.resolve(defaultEntryDir, 'client.tsx'),
  server: path.resolve(defaultEntryDir, 'server.ts'),
  start: path.resolve(defaultEntryDir, 'start.ts'),
}

export function tanstackStart(
  options?: TanStackStartInputConfig,
): Array<RsbuildPlugin> {
  return TanStackStartRsbuildPluginCore(
    {
      framework: 'solid',
      defaultEntryPaths,
    },
    options,
  )
}
