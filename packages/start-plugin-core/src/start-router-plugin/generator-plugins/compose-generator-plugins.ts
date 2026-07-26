import type { GeneratorPlugin } from '@tanstack/router-generator'

export function composeGeneratorPlugins(opts: {
  frameworkPlugins?: ReadonlyArray<GeneratorPlugin> | undefined
  userPlugins?: ReadonlyArray<GeneratorPlugin> | undefined
  builtInPlugins: ReadonlyArray<GeneratorPlugin>
}): Array<GeneratorPlugin> {
  return [
    ...(opts.frameworkPlugins ?? []),
    ...(opts.userPlugins ?? []),
    ...opts.builtInPlugins,
  ]
}
