import { fileURLToPath, pathToFileURL } from 'node:url'

import { logDiff } from '@tanstack/router-utils'
import { compileDirectives } from './compilers'
import type {
  CompileDirectivesOpts,
  DirectiveFn,
  GenerateFunctionIdFn,
} from './compilers'
import type { Plugin } from 'vite'

const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'directives-functions-plugin'].includes(process.env.TSR_VITE_DEBUG)

export type {
  DirectiveFn,
  CompileDirectivesOpts,
  ReplacerFn,
  GenerateFunctionIdFn,
} from './compilers'

export type DirectiveFunctionsViteEnvOptions = Pick<
  CompileDirectivesOpts,
  'getRuntimeCode' | 'replacer'
>
export type DirectiveFunctionsViteOptions = DirectiveFunctionsViteEnvOptions & {
  directive: string
  onDirectiveFnsById?: (directiveFnsById: Record<string, DirectiveFn>) => void
  generateFunctionId: GenerateFunctionIdFn
}

const createDirectiveRx = (directive: string) =>
  new RegExp(`"${directive}"|'${directive}'`, 'gm')

export type DirectiveFunctionsVitePluginEnvOptions = {
  directive: string
  callers: Array<
    DirectiveFunctionsViteEnvOptions & {
      envName: string
      envConsumer?: 'client' | 'server'
    }
  >
  provider: DirectiveFunctionsViteEnvOptions & { envName: string }
  onDirectiveFnsById?: (directiveFnsById: Record<string, DirectiveFn>) => void
  generateFunctionId: GenerateFunctionIdFn
  /**
   * Returns the currently known directive functions from previous builds.
   * Used by server callers to look up canonical extracted filenames,
   * ensuring they import from the same extracted file as the client.
   */
  getKnownDirectiveFns?: () => Record<string, DirectiveFn>
}

function buildDirectiveSplitParam(directive: string) {
  return `tsr-directive-${directive.replace(/[^a-zA-Z0-9]/g, '-')}`
}

export function TanStackDirectiveFunctionsPluginEnv(
  opts: DirectiveFunctionsVitePluginEnvOptions,
): Plugin {
  let root: string = process.cwd()

  const directiveRx = createDirectiveRx(opts.directive)

  const appliedEnvironments = new Set([
    ...opts.callers.map((c) => c.envName),
    opts.provider.envName,
  ])

  const directiveSplitParam = buildDirectiveSplitParam(opts.directive)

  return {
    name: 'tanstack-start-directive-vite-plugin',
    enforce: 'pre',
    buildStart() {
      root = this.environment.config.root
    },
    applyToEnvironment(env) {
      return appliedEnvironments.has(env.name)
    },
    transform: {
      filter: {
        code: directiveRx,
      },
      handler(code, id) {
        const url = pathToFileURL(id)
        url.searchParams.delete('v')
        id = fileURLToPath(url).replace(/\\/g, '/')

        const isDirectiveSplitParam = id.includes(directiveSplitParam)

        let envOptions: DirectiveFunctionsViteEnvOptions & {
          envName: string
          envConsumer?: 'client' | 'server'
        }
        // Use provider options ONLY for extracted function files (files with directive split param)
        // For all other files, use caller options even if we're in the provider environment
        // This ensures route files reference extracted functions instead of duplicating implementations
        if (isDirectiveSplitParam) {
          envOptions = opts.provider
          if (debug)
            console.info(
              `Compiling Directives for provider in environment ${envOptions.envName}: `,
              id,
            )
        } else {
          // For non-extracted files, use caller options based on current environment
          const callerOptions = opts.callers.find(
            (e) => e.envName === this.environment.name,
          )
          // If no caller is found for this environment (e.g., separate provider environment only processes extracted files),
          // fall back to provider options
          if (callerOptions) {
            envOptions = callerOptions
            if (debug)
              console.info(
                `Compiling Directives for caller in environment ${envOptions.envName}: `,
                id,
              )
          } else {
            envOptions = opts.provider
            if (debug)
              console.info(
                `Compiling Directives for provider (fallback) in environment ${opts.provider.envName}: `,
                id,
              )
          }
        }
        // Get known directive functions for looking up canonical extracted filenames
        // This ensures SSR callers import from the same extracted file as the client
        const knownDirectiveFns = opts.getKnownDirectiveFns?.()

        // Determine if this is a client environment
        const isClientEnvironment = envOptions.envConsumer === 'client'

        const { compiledResult, directiveFnsById } = compileDirectives({
          directive: opts.directive,
          getRuntimeCode: envOptions.getRuntimeCode,
          generateFunctionId: opts.generateFunctionId,
          replacer: envOptions.replacer,
          code,
          root,
          filename: id,
          directiveSplitParam,
          isDirectiveSplitParam,
          knownDirectiveFns,
          isClientEnvironment,
        })
        // when we process a file with a directive split param, we have already encountered the directives in that file
        // (otherwise we wouldn't have gotten here)
        if (!isDirectiveSplitParam) {
          opts.onDirectiveFnsById?.(directiveFnsById)
        }

        if (debug) {
          logDiff(code, compiledResult.code)
          console.log('Output:\n', compiledResult.code + '\n\n')
        }

        return compiledResult
      },
    },
  }
}
