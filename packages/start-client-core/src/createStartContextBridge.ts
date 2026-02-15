import { isServer } from '@tanstack/router-core/isServer'
import { getGlobalStartContext } from './getGlobalStartContext'
import { safeObjectMerge } from './safeObjectMerge'
import type { AssignAllServerRequestContext } from './createMiddleware.js'
import type {
  AnyRouter,
  Expand,
  Register,
  RouterPlugin,
  ValidateSerializableInput,
} from '@tanstack/router-core'

export type StartContextBridgeOptions<
  TSelected extends Record<string, unknown>,
> = {
  key?: string
  select: (
    ctx: Expand<AssignAllServerRequestContext<Register, []>>,
  ) => ValidateSerializableInput<Register, TSelected>
}

/**
 * Create a context bridge that transports server-side context values
 * to the client via dehydrate/hydrate.
 *
 * Pass the returned plugin in `plugins` when creating a router:
 *
 * @example
 * ```ts
 * createRouter({
 *   routeTree,
 *   context: { static: 'static-value' },
 *   plugins: [
 *     createStartContextBridge({
 *       select: (ctx) => ({ a: ctx.a, c: ctx.c }),
 *     }),
 *   ],
 * })
 * ```
 */
export function createStartContextBridge<
  TSelected extends Record<string, unknown>,
>(opts: StartContextBridgeOptions<TSelected>): RouterPlugin<TSelected> {
  const key = opts.key ?? '__tsrStartContextBridge'

  const plugin: RouterPlugin<TSelected> = {
    '~types': null as any,
    setup: (router: AnyRouter) => {
      if (isServer ?? router.isServer) {
        // On the server: merge selected context into the router context eagerly
        const startCtx = getGlobalStartContext()
        if (startCtx) {
          const selected = opts.select(startCtx) as unknown as Record<
            string,
            unknown
          >
          router.options.context = safeObjectMerge(
            router.options.context,
            selected,
          )
        }

        // Hook into dehydrate to serialize the selected values for the client
        const ogDehydrate = router.options.dehydrate
        router.options.dehydrate = async () => {
          const og = await ogDehydrate?.()
          const startCtx = getGlobalStartContext()
          const selected = opts.select(startCtx) as unknown as Record<
            string,
            unknown
          >

          if (og === undefined) {
            return { [key]: selected } as any
          }

          if (!og || typeof og !== 'object') {
            throw new Error(
              `createStartContextBridge: router.options.dehydrate must return an object (or undefined). Got '${typeof og}'.`,
            )
          }

          return {
            ...og,
            [key]: selected,
          }
        }
      } else {
        // On the client: hook into hydrate to deserialize bridged values
        const ogHydrate = router.options.hydrate
        router.options.hydrate = async (dehydrated: any) => {
          await ogHydrate?.(dehydrated)
          const selected = dehydrated?.[key] as
            | Record<string, unknown>
            | undefined
          if (!selected) return

          router.update({
            context: safeObjectMerge(router.options.context, selected),
          })
        }
      }
    },
  }

  return plugin
}
