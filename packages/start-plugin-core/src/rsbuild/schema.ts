import { parseStartConfig as parseCoreStartConfig } from '../schema'
import type { TanStackStartInputConfig } from '../schema'
import type { CompileStartFrameworkOptions } from '../types'

type TanStackStartRsbuildPage = Omit<
  NonNullable<TanStackStartInputConfig['pages']>[number],
  'prerender'
>

type TanStackStartRsbuildSpa = Omit<
  NonNullable<TanStackStartInputConfig['spa']>,
  'prerender'
>

export type TanStackStartRsbuildInputConfig = Omit<
  TanStackStartInputConfig,
  'importProtection' | 'prerender' | 'spa' | 'pages'
> & {
  pages?: Array<TanStackStartRsbuildPage>
  spa?: TanStackStartRsbuildSpa
}

export function parseStartConfig(
  opts: TanStackStartRsbuildInputConfig | undefined,
  corePluginOpts: { framework: CompileStartFrameworkOptions },
  root: string,
) {
  return parseCoreStartConfig(opts ?? {}, corePluginOpts, root)
}
