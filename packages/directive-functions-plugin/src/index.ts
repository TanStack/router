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

export type DirectiveFunctionsViteOptions = Pick<
  CompileDirectivesOpts,
  'directive' | 'directiveLabel' | 'getRuntimeCode' | 'replacer'
  // | 'devSplitImporter'
> & {
  envLabel: string
}

const createDirectiveRx = (directive: string) =>
  new RegExp(`"${directive}"|'${directive}'`, 'gm')

export function TanStackDirectiveFunctionsPlugin(
  opts: DirectiveFunctionsViteOptions & {
    onDirectiveFnsById?: (directiveFnsById: Record<string, DirectiveFn>) => void
  },
): Plugin {
  let ROOT: string = process.cwd()

  const directiveRx = createDirectiveRx(opts.directive)

  return {
    name: 'tanstack-start-directive-vite-plugin',
    enforce: 'pre',
    configResolved: (config) => {
      ROOT = config.root
    },
    transform(code, id) {
      const url = pathToFileURL(id)
      url.searchParams.delete('v')
      id = fileURLToPath(url).replace(/\\/g, '/')

      if (!code.match(directiveRx)) {
        return null
      }

      if (debug) console.info(`${opts.envLabel}: Compiling Directives: `, id)

      const { compiledResult, directiveFnsById } = compileDirectives({
        ...opts,
        code,
        root: ROOT,
        filename: id,
        // globalThis.app currently refers to Vinxi's app instance. In the future, it can just be the
        // vite dev server instance we get from Nitro.
      })

      opts.onDirectiveFnsById?.(directiveFnsById)

      if (debug) {
        logDiff(code, compiledResult.code)
        console.log('Output:\n', compiledResult.code + '\n\n')
      }

      return compiledResult
    },
  }
}
