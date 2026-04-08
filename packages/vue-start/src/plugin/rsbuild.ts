import {
  START_ENVIRONMENT_NAMES,
  tanStackStartRsbuild,
} from '@tanstack/start-plugin-core'
import { vueStartDefaultEntryPaths } from './shared'
import type { TanStackStartRsbuildPluginCoreOptions } from '@tanstack/start-plugin-core/rsbuild/types'
import type { TanStackStartRsbuildInputConfig } from '@tanstack/start-plugin-core'
import type { RsbuildPlugin } from '@rsbuild/core'

export function tanstackStart(
  options?: TanStackStartRsbuildInputConfig,
): RsbuildPlugin {
  const corePluginOpts: TanStackStartRsbuildPluginCoreOptions = {
    framework: 'vue',
    defaultEntryPaths: vueStartDefaultEntryPaths,
    providerEnvironmentName: START_ENVIRONMENT_NAMES.server,
    ssrIsProvider: true,
  }

  return tanStackStartRsbuild(corePluginOpts, options)
}
