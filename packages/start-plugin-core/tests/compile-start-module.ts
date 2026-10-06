import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../src/start-compiler/config'
import type { StartCompilerPlugin } from '../src/types'

/**
 * Compiles one module through `StartCompiler` the way the bundler plugins do:
 * React lookups for the environment, kinds pre-detected from the source, and
 * `@tanstack/*` imports resolved as packages.
 */
export async function compileStartModule(options: {
  env: 'client' | 'server'
  code: string
  /** Compile the server-function provider module (`?tss-serverfn-split`). */
  provider?: boolean
  /** Extra project modules by absolute id; `./name` resolves to `/test/src/name.ts`. */
  files?: Record<string, string>
  compilerPlugins?: Array<StartCompilerPlugin>
}) {
  const { env, files = {} } = options
  const compiler: StartCompiler = new StartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'ssr',
    root: '/test',
    framework: 'react',
    providerEnvName: 'ssr',
    mode: 'build',
    lookupKinds: getLookupKindsForEnv(env),
    lookupConfigurations: getLookupConfigurationsForEnv(env, 'react'),
    getKnownServerFns: () => ({}),
    loadModule: async (id) => {
      const code = files[id]
      if (code !== undefined) {
        compiler.ingestModule({ code, id })
      }
    },
    resolveId: async (id) => {
      if (id.startsWith('@tanstack/')) {
        return id
      }
      const file = id.startsWith('./') ? `/test/src/${id.slice(2)}.ts` : id
      return file in files ? file : null
    },
    compilerPlugins: options.compilerPlugins,
  })
  const result = await compiler.compile({
    code: options.code,
    id: `/test/src/module.tsx${options.provider ? '?tss-serverfn-split' : ''}`,
    detectedKinds: detectKindsInCode(options.code, env),
  })
  return result?.code ?? null
}
