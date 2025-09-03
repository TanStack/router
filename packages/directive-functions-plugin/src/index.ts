import { fileURLToPath, pathToFileURL } from 'node:url'

import { logDiff } from '@tanstack/router-utils'
import { compileDirectives } from './compilers'
import type { CompileDirectivesOpts, DirectiveFn } from './compilers'
import type { Plugin } from 'vite'

const debug =
  process.env.TSR_VITE_DEBUG &&
  ['true', 'directives-functions-plugin'].includes(process.env.TSR_VITE_DEBUG)

export type {
  DirectiveFn,
  CompileDirectivesOpts,
  ReplacerFn,
} from './compilers'

export type DirectiveFunctionsViteEnvOptions = Pick<
  CompileDirectivesOpts,
  'getRuntimeCode' | 'replacer'
> & {
  envLabel: string
}

export type DirectiveFunctionsViteOptions = Pick<
  CompileDirectivesOpts,
  'directive' | 'directiveLabel'
> &
  DirectiveFunctionsViteEnvOptions & {
    onDirectiveFnsById?: (directiveFnsById: Record<string, DirectiveFn>) => void
  }

const createDirectiveRx = (directive: string) =>
  new RegExp(`"${directive}"|'${directive}'`, 'gm')

export function TanStackDirectiveFunctionsPlugin(
  opts: DirectiveFunctionsViteOptions,
): Plugin {
  let root: string = process.cwd()

  const directiveRx = createDirectiveRx(opts.directive)

  return {
    name: 'tanstack-start-directive-vite-plugin',
    enforce: 'pre',
    configResolved: (config) => {
      root = config.root
    },
    transform(code, id) {
      return transformCode({ ...opts, code, id, directiveRx, root })
    },
  }
}

export type DirectiveFunctionsVitePluginEnvOptions = Pick<
  CompileDirectivesOpts,
  'directive' | 'directiveLabel'
> & {
  environments: {
    client: DirectiveFunctionsViteEnvOptions & { envName?: string }
    server: DirectiveFunctionsViteEnvOptions & { envName?: string }
  }
  onDirectiveFnsById?: (directiveFnsById: Record<string, DirectiveFn>) => void
}

export function TanStackDirectiveFunctionsPluginEnv(
  opts: DirectiveFunctionsVitePluginEnvOptions,
): Plugin {
  opts = {
    ...opts,
    environments: {
      client: {
        envName: 'client',
        ...opts.environments.client,
      },
      server: {
        envName: 'server',
        ...opts.environments.server,
      },
    },
  }

  let root: string = process.cwd()

  const directiveRx = createDirectiveRx(opts.directive)

  return {
    name: 'tanstack-start-directive-vite-plugin',
    enforce: 'pre',
    buildStart() {
      root = this.environment.config.root
    },
    applyToEnvironment(env) {
      return [
        opts.environments.client.envName,
        opts.environments.server.envName,
      ].includes(env.name)
    },
    transform: {
      filter: {
        code: directiveRx,
      },
      handler(code, id) {
        const envOptions = [
          opts.environments.client,
          opts.environments.server,
        ].find((e) => e.envName === this.environment.name)

        if (!envOptions) {
          throw new Error(`Environment ${this.environment.name} not found`)
        }

        return transformCode({
          ...opts,
          ...envOptions,
          code,
          id,
          directiveRx,
          root,
        })
      },
    },
  }
}

function transformCode({
  code,
  id,
  directiveRx,
  envLabel,
  directive,
  directiveLabel,
  getRuntimeCode,
  replacer,
  onDirectiveFnsById,
  root,
}: DirectiveFunctionsViteOptions & {
  code: string
  id: string
  directiveRx: RegExp
  root: string
}) {
  const url = pathToFileURL(id)
  url.searchParams.delete('v')
  id = fileURLToPath(url).replace(/\\/g, '/')

  if (!code.match(directiveRx)) {
    return null
  }

  if (debug) console.info(`${envLabel}: Compiling Directives: `, id)

  const { compiledResult, directiveFnsById, isDirectiveSplitParam } =
    compileDirectives({
      directive,
      directiveLabel,
      getRuntimeCode,
      replacer,
      code,
      root,
      filename: id,
    })
  // when we process a file with a directive split param, we have already encountered the directives in that file
  // (otherwise we wouldn't have gotten here)
  if (!isDirectiveSplitParam) {
    onDirectiveFnsById?.(directiveFnsById)
  }

  if (debug) {
    logDiff(code, compiledResult.code)
    console.log('Output:\n', compiledResult.code + '\n\n')
  }

  return compiledResult
}
