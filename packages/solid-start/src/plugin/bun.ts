import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'pathe'
import {
  BUN_ENVIRONMENT_NAMES,
  tanStackStartBun,
} from '@tanstack/start-plugin-core/bun'
import { solidStartDefaultEntryPaths } from './shared'
import type {
  TanStackStartBunInputConfig,
  TanStackStartBunPluginCoreOptions,
  TanStackStartBunAdapter,
} from '@tanstack/start-plugin-core/bun'

/** Resolve default Start entry file paths for the app root. */
function resolveDefaultEntryPaths() {
  if (existsSync(solidStartDefaultEntryPaths.client)) {
    return solidStartDefaultEntryPaths
  }

  const srcDefault = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../default-entry',
  )
  return {
    client: path.resolve(srcDefault, 'client.tsx'),
    server: path.resolve(srcDefault, 'server.ts'),
    start: path.resolve(srcDefault, 'start.ts'),
  }
}

/**
 * TanStack Start Bun bundler adapter for Solid (imperative build/dev API).
 */
export function tanstackStart(
  options?: TanStackStartBunInputConfig,
): TanStackStartBunAdapter {
  const corePluginOpts: TanStackStartBunPluginCoreOptions = {
    framework: 'solid',
    defaultEntryPaths: resolveDefaultEntryPaths(),
    providerEnvironmentName: BUN_ENVIRONMENT_NAMES.server,
    ssrIsProvider: true,
    bun: options?.bun,
  }

  return tanStackStartBun(corePluginOpts, options)
}

export type { TanStackStartBunAdapter, TanStackStartBunInputConfig }
