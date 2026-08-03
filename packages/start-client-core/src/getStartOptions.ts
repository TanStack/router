import { invariant, isPromise } from '@tanstack/router-core'
import { getStartContext } from '@tanstack/start-storage-context'
import { createIsomorphicFn } from '@tanstack/start-fn-stubs'
import { startInstance } from '#tanstack-start-entry'
import {
  hasPluginAdapters,
  pluginSerializationAdapters,
} from '#tanstack-start-plugin-adapters'
import { ServerFunctionSerializationAdapter } from './client/ServerFunctionSerializationAdapter'
import type { AnySerializationAdapter, Awaitable } from '@tanstack/router-core'
import type { AnyStartInstanceOptions } from './createStart'

let startOptions: Awaitable<AnyStartInstanceOptions> | undefined

const setStartOptions = (options: AnyStartInstanceOptions) => {
  const serializationAdapters = (options.serializationAdapters ??=
    []) as Array<AnySerializationAdapter>

  // Only spread plugin adapters if any are configured (this will tree-shake away otherwise)
  if (hasPluginAdapters) {
    serializationAdapters.push(...pluginSerializationAdapters)
  }
  serializationAdapters.push(ServerFunctionSerializationAdapter)

  return (startOptions = options)
}

export const getStartOptions: () => AnyStartInstanceOptions | undefined =
  createIsomorphicFn()
    .client(() => {
      if (!startOptions || isPromise(startOptions)) {
        if (process.env.NODE_ENV !== 'production') {
          throw new Error(
            'Start options have not been initialized yet. Await initStartOptions() before calling getStartOptions() on the client.',
          )
        }

        invariant()
      }

      return startOptions
    })
    .server(() => getStartContext().startOptions)

export const initStartOptions: () => Awaitable<
  AnyStartInstanceOptions | undefined
> = createIsomorphicFn()
  .client(function initClientStartOptions(): Awaitable<
    AnyStartInstanceOptions | undefined
  > {
    if (startOptions) {
      return startOptions
    }

    if (!startInstance) {
      return setStartOptions({} as AnyStartInstanceOptions)
    }

    const options = startInstance.getOptions()
    if (isPromise(options)) {
      startOptions = options.then((resolvedOptions) =>
        setStartOptions(resolvedOptions as AnyStartInstanceOptions),
      )
      return startOptions
    }

    return setStartOptions(options as AnyStartInstanceOptions)
  })
  .server(() => getStartContext().startOptions)
