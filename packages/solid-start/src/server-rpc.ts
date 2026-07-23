import {
  GET,
  getServerFunction,
  registerServerFunction,
} from '@solidjs/web/server-functions/server'
import {
  TSS_FORMDATA_CONTEXT,
  TSS_SERVER_FUNCTION,
} from '@tanstack/start-client-core'
import { deserializeWireJson } from './directive-wire'
import type { ServerFnMeta } from '@tanstack/start-client-core'

// Kept for the split transport (serverFnTransport: 'split').
export { createServerRpc } from '@tanstack/start-server-core/createServerRpc'

// Registered symbol brand the runtime uses to detect server function
// references (see @solidjs/web/server-functions).
const SERVER_FUNCTION_METADATA = Symbol.for('solid.ServerFunctionMetadata')

/**
 * Server-side wrapper for the directive server-fn pipeline. Receives the
 * in-process reference vite-plugin-solid's server transform leaves behind
 * (`createServerReference(registerServerReference(ordinalId, trampoline))`)
 * plus TanStack's own function meta, and exposes the extractedFn contract
 * createServerFn().handler() expects.
 *
 * The directive compiler's ordinal id is only used to fish the raw
 * trampoline back out of the runtime registry; the function is re-registered
 * under TanStack's split-safe id, which is what the client transport dials
 * (the ordinal ids collide across router code-split modules of one file).
 * Calls go through the raw trampoline rather than the reference proxy so
 * in-process SSR invocations don't require a solid request event —
 * TanStack's own start context provides request state.
 */
export function createDirectiveServerRpc(
  ref: { id: string },
  meta: ServerFnMeta,
) {
  const rawFn = getServerFunction(ref.id)
  registerServerFunction(meta.id, rawFn)

  const rpcFn = (...args: Array<any>) => rawFn(...args)

  // createServerFn().handler() assigns the declared HTTP method onto the
  // extracted fn at module-eval time. Intercept it to register GET functions
  // in the runtime's method map — without that declaration
  // handleServerFunctionRequest answers GET requests with 405.
  let method: 'GET' | 'POST' | undefined
  Object.defineProperty(rpcFn, 'method', {
    get: () => method,
    set: (value: 'GET' | 'POST' | undefined) => {
      method = value
      if (value === 'GET') {
        // GET() only accepts branded server function references; brand a
        // stand-in carrying the TanStack id so the method map keys on it.
        const brand: any = () => {}
        brand[SERVER_FUNCTION_METADATA] = {}
        brand.id = meta.id
        GET(brand)
      }
    },
    enumerable: true,
    configurable: true,
  })

  return Object.assign(rpcFn, {
    url: `${process.env.TSS_SERVER_FN_BASE}?id=${encodeURIComponent(meta.id)}`,
    serverFnMeta: meta,
    [TSS_SERVER_FUNCTION]: true,
  })
}

/**
 * Normalizes the single wire argument the registered trampoline receives into
 * the options object __executeServer expects. Codec-serialized calls already
 * carry the options object; native FormData bodies arrive as the bare
 * FormData with sendContext smuggled in a reserved field.
 */
export function normalizeDirectiveServerOpts(opts: any) {
  // Native no-JS form posts default to urlencoded bodies; the split
  // transport parsed those as FormData (request.formData() accepts both),
  // so keep handing FormData to validators/handlers.
  if (opts instanceof URLSearchParams) {
    const formData = new FormData()
    opts.forEach((value, key) => formData.append(key, value))
    opts = formData
  }

  if (typeof FormData !== 'undefined' && opts instanceof FormData) {
    const serializedContext = opts.get(TSS_FORMDATA_CONTEXT)
    opts.delete(TSS_FORMDATA_CONTEXT)

    let context: unknown
    if (typeof serializedContext === 'string') {
      try {
        context = deserializeWireJson(serializedContext)
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to parse FormData context:', error)
        }
      }
    }

    return { data: opts, context, method: 'POST' }
  }

  return opts ?? {}
}
