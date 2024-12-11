import { fileURLToPath, pathToFileURL } from 'node:url'

import type { Plugin } from 'vite'

const debug = Boolean(process.env.TSR_VITE_DEBUG)

export type ServerFunctionsViteOptions = {}

const useServerRx = /"use server"|'use server'/

export function TanStackStartViteServerFn(): Array<Plugin> {
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

        const { compiledCode, serverFns } = compileServerFnServer({
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
    {
      name: 'tanstack-start-server-fn-server-vite-plugin',
      transform(code, id) {
        return null
      },
    },
  ]
}
