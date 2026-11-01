/**
 * The resolve hook an SSR entry registers to provide `cloudflare:workers` the
 * way the worker runtime would (start-build-v2-unresolvable-imports.test.ts):
 * the one stand-in of a platform module.
 */
/** String-binding contract for the resolve hook, checked against workerd below; what the worker runtime provides for `cloudflare:workers`. */
export const workerEnvModule = `export const env = { SECRET: 'MARK_ENV_SECRET' }`

export const workerResolveHook = `import { registerHooks } from 'node:module'
export const workerRequests = new Set()
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers') {
      workerRequests.add(specifier)
      return {
        url: 'data:text/javascript,' + encodeURIComponent(${JSON.stringify(workerEnvModule)}),
        shortCircuit: true,
      }
    }
    return next(specifier, context)
  },
})`
