import { createRequire } from 'node:module'
import { join } from 'pathe'
import type { BunPlugin } from 'bun'

/**
 * Force solid-js / solid-js/web to their Node SSR builds during Bun server
 * bundling without enabling the package `solid` export condition (which would
 * pull @tanstack/solid-router source JSX).
 */
export function createSolidServerAliasPlugin(opts: {
  root: string
}): BunPlugin {
  const requireFromRoot = createRequire(join(opts.root, 'package.json'))

  const resolveServer = (id: string): string | null => {
    try {
      if (id === 'solid-js') {
        return requireFromRoot.resolve('solid-js/dist/server.js')
      }
      if (id === 'solid-js/web') {
        return requireFromRoot.resolve('solid-js/web/dist/server.js')
      }
      if (id === 'solid-js/store') {
        return requireFromRoot.resolve('solid-js/store/dist/server.js')
      }
    } catch {
      try {
        return requireFromRoot.resolve(id)
      } catch {
        return null
      }
    }
    return null
  }

  return {
    name: 'tanstack-start-bun:solid-server-alias',
    setup(build) {
      build.onResolve({ filter: /^solid-js(\/|$)/ }, (args) => {
        const resolved = resolveServer(args.path)
        if (!resolved) {
          return undefined
        }
        return { path: resolved }
      })
    },
  }
}
