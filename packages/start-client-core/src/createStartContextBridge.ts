import { createIsomorphicFn } from '@tanstack/start-fn-stubs'
import { isServer } from '@tanstack/router-core/isServer'
import { getGlobalStartContext } from './getGlobalStartContext'
import { safeObjectMerge } from './safeObjectMerge'
import type { AssignAllServerRequestContext } from './createMiddleware.js'
import type {
  AnyRouter,
  Expand,
  Register,
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

export type StartContextBridge<TSelected extends Record<string, unknown>> = {
  key: string
  /** Install dehydrate/hydrate integration for a router instance */
  setup: (router: AnyRouter) => void
  /** Get selected context */
  get: () => TSelected
}

export function createStartContextBridge<
  TSelected extends Record<string, unknown>,
>(opts: StartContextBridgeOptions<TSelected>): StartContextBridge<TSelected> {
  const key = opts.key ?? '__tsrStartContextBridge'

  const get = createIsomorphicFn()
    .client((): TSelected => {
      return {} as unknown as TSelected
    })
    .server((): TSelected => {
      return opts.select(getGlobalStartContext()) as unknown as TSelected
    })

  const setup = (router: AnyRouter) => {
    if (isServer ?? router.isServer) {
      const ogDehydrate = router.options.dehydrate
      router.options.dehydrate = () => {
        const og = ogDehydrate?.()
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
  }

  return {
    key,
    setup,
    get,
  }
}
