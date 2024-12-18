import { fileURLToPath, pathToFileURL } from 'node:url'

import { compileDirectives } from './compilers'
import { logDiff } from './logger'
import type { ReplacerFn } from './compilers'
import type { Plugin } from 'vite'

const debug = Boolean(process.env.TSR_VITE_DEBUG) || (true as boolean)

export type ServerFunctionsViteOptions = {
  getRuntimeCode: (opts: {
    serverFnPathsByFunctionId: Record<
      string,
      {
        nodePath: babel.NodePath
        functionName: string
        functionId: string
      }
    >
  }) => string
  replacer: ReplacerFn
}

const useServerRx = /"use server"|'use server'/

export type CreateRpcFn = (opts: {
  fn: (...args: Array<any>) => any
  filename: string
  functionId: string
}) => (...args: Array<any>) => any

export function TanStackServerFnPluginRuntime(
  opts: ServerFunctionsViteOptions,
): Array<Plugin> {
  let ROOT: string = process.cwd()

  return [
    {
      name: 'tanstack-start-server-fn-client-vite-plugin',
      enforce: 'pre',
      configResolved: (config) => {
        ROOT = config.root
      },
      transform(code, id) {
        const url = pathToFileURL(id)
        url.searchParams.delete('v')
        id = fileURLToPath(url).replace(/\\/g, '/')

        if (!useServerRx.test(code)) {
          return null
        }

        const { compiledResult, serverFns } = compileDirectives({
          directive: 'use server',
          code,
          root: ROOT,
          filename: id,
          getRuntimeCode: opts.getRuntimeCode,
          replacer: opts.replacer,
        })

        if (debug) console.info('createServerFn Input/Output')
        if (debug) logDiff(code, compiledResult.code.replace(/ctx/g, 'blah'))

        return compiledResult
      },
    },
  ]
}

export function TanStackServerFnPluginSplitFn(
  opts: ServerFunctionsViteOptions,
): Array<Plugin> {
  return [
    {
      name: 'tanstack-start-server-fn-server-vite-plugin',
      transform(code, id) {
        return null
      },
    },
  ]
}
