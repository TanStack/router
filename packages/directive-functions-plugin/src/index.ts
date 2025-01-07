import { fileURLToPath, pathToFileURL } from 'node:url'

import { compileDirectives } from './compilers'
import { logDiff } from './logger'
import type { CompileDirectivesOpts, DirectiveFn } from './compilers'
import type { Plugin } from 'vite'

const debug = Boolean(process.env.TSR_VITE_DEBUG)

export type { DirectiveFn, CompileDirectivesOpts } from './compilers'

export type DirectiveFunctionsViteOptions = Pick<
  CompileDirectivesOpts,
  'directive' | 'directiveLabel' | 'getRuntimeCode' | 'replacer'
  // | 'devSplitImporter'
>

const createDirectiveRx = (directive: string) =>
  new RegExp(`"${directive}"|'${directive}'`, 'g')

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

      if (!directiveRx.test(code)) {
        return null
      }

      const { compiledResult, directiveFnsById } = compileDirectives({
        ...opts,
        code,
        root: ROOT,
        filename: id,
        // globalThis.app currently refers to Vinxi's app instance. In the future, it can just be the
        // vite dev server instance we get from Nitro.
      })

      opts.onDirectiveFnsById?.(directiveFnsById)

      if (debug) console.info('Directive Input/Output')
      if (debug) logDiff(code, compiledResult.code)

      return compiledResult
    },
  }
}
