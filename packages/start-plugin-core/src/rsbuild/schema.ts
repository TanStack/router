import { parseStartConfig as parseCoreStartConfig } from '../schema'
import type { TanStackStartInputConfig } from '../schema'
import type { CompileStartFrameworkOptions } from '../types'

export type TanStackStartRsbuildInputConfig = Omit<
  TanStackStartInputConfig,
  'importProtection'
>

export function parseStartConfig(
  opts: TanStackStartRsbuildInputConfig | undefined,
  corePluginOpts: { framework: CompileStartFrameworkOptions },
  root: string,
) {
  return parseCoreStartConfig(opts ?? {}, corePluginOpts, root)
}
