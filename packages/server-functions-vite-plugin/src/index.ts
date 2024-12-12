import { fileURLToPath, pathToFileURL } from 'node:url'

import { compileServerFnClient } from './compilers'
import type { Plugin } from 'vite'

const debug = Boolean(process.env.TSR_VITE_DEBUG)

export type ServerFunctionsViteOptions = {
  runtimeCode: string
  replacer: (opts: { filename: string; functionId: string }) => string
}

const useServerRx = /"use server"|'use server'/

export type CreateRpcFn = (opts: {
  fn: (...args: Array<any>) => any
  filename: string
  functionId: string
}) => (...args: Array<any>) => any

export function TanStackServerFnPluginClient(
  opts: ServerFunctionsViteOptions,
): Array<Plugin> {
  // opts: ServerFunctionsViteOptions,
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

        if (debug) console.info('')
        if (debug) console.info('Compiled createServerFn Input')
        if (debug) console.info('')
        if (debug) console.info(code)
        if (debug) console.info('')
        if (debug) console.info('')
        if (debug) console.info('')

        const { compiledCode, serverFns } = compileServerFnClient({
          code,
          root: ROOT,
          filename: id,
        })

        if (debug) console.info('')
        if (debug) console.info('Compiled createServerFn Output')
        if (debug) console.info('')
        if (debug) console.info(compiledCode)
        if (debug) console.info('')
        if (debug) console.info('')
        if (debug) console.info('')

        return compiledCode
      },
    },
  ]
}

export function TanStackServerFnPluginServer(
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
