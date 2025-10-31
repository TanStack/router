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
  callers: Array<DirectiveFunctionsViteEnvOptions & { envName: string }>
  provider: DirectiveFunctionsViteEnvOptions & { envName: string }
  onDirectiveFnsById?: (directiveFnsById: Record<string, DirectiveFn>) => void
  generateFunctionId: GenerateFunctionIdFn
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

        let envOptions: DirectiveFunctionsViteEnvOptions & { envName: string }
        if (isDirectiveSplitParam) {
          envOptions = opts.provider
          if (debug)
            console.info(
              `Compiling Directives for provider in environment ${envOptions.envName}: `,
              id,
            )
        } else {
          envOptions = opts.callers.find(
            (e) => e.envName === this.environment.name,
          )!
          if (debug)
            console.info(
              `Compiling Directives for caller in environment ${envOptions.envName}: `,
              id,
            )
        }
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
