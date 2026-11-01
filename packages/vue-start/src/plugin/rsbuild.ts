import { tanStackStartRsbuild } from '@tanstack/start-plugin-core/rsbuild'
import { vueStartDefaultEntryPaths } from './shared'
import type {
  TanStackStartRsbuildInputConfig,
  TanStackStartRsbuildPluginCoreOptions,
} from '@tanstack/start-plugin-core/rsbuild'
import type { RsbuildPlugin } from '@rsbuild/core'

export function tanstackStart(
  options?: TanStackStartRsbuildInputConfig,
): RsbuildPlugin {
  const corePluginOpts: TanStackStartRsbuildPluginCoreOptions = {
    framework: 'vue',
    defaultEntryPaths: vueStartDefaultEntryPaths,
    ssrIsProvider: true,
  }

  return tanStackStartRsbuild(corePluginOpts, options)
}
