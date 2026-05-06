import { promises as fsp } from 'node:fs'
import { join } from 'pathe'
import { postBuild } from '../post-build'
import { prerender } from '../prerender'
import {
  capturePrerenderEnv,
  restorePrerenderEnv,
} from '../prerender-route-options-env'
import type { PrerenderHandler } from '../prerender'
import type { TanStackStartOutputConfig } from '../schema'

export async function postBuildWithRsbuild({
  startConfig,
  clientOutputDirectory,
  serverOutputDirectory,
  prerenderOutputDirectory,
  separatePrerenderRouteOptions,
}: {
  startConfig: TanStackStartOutputConfig
  clientOutputDirectory: string
  serverOutputDirectory: string
  prerenderOutputDirectory?: string | undefined
  separatePrerenderRouteOptions: boolean
}) {
  await postBuild({
    startConfig,
    adapter: {
      getClientOutputDirectory() {
        return clientOutputDirectory
      },
      async prerender(startConfig) {
        const handler = await createRsbuildPrerenderHandler({
          clientOutputDirectory,
          serverOutputDirectory,
          prerenderOutputDirectory,
          separatePrerenderRouteOptions,
        })

        return prerender({
          startConfig,
          handler,
        })
      },
    },
  })
}

async function createRsbuildPrerenderHandler({
  clientOutputDirectory,
  serverOutputDirectory,
  prerenderOutputDirectory,
  separatePrerenderRouteOptions,
}: {
  clientOutputDirectory: string
  serverOutputDirectory: string
  prerenderOutputDirectory?: string | undefined
  separatePrerenderRouteOptions: boolean
}): Promise<PrerenderHandler> {
  const prerenderEnvState = capturePrerenderEnv()

  process.env.TSS_PRERENDERING = 'true'
  process.env.TSS_CLIENT_OUTPUT_DIR = clientOutputDirectory

  let requestHandlerPromise:
    | Promise<
        (request: Request, opts?: unknown) => Promise<Response> | Response
      >
    | undefined

  let routeOptionsPromise: Promise<void> | undefined

  const handler: PrerenderHandler = {
    getClientOutputDirectory() {
      return clientOutputDirectory
    },
    async request(path, options) {
      const requestHandler = await loadRequestHandler()
      const url = new URL(path, 'http://localhost')

      return requestHandler(
        new Request(url, {
          ...options,
          redirect: 'manual',
        }),
      )
    },
    async close() {
      delete globalThis.TSS_PRERENDER_ROUTE_TREE
      restorePrerenderEnv(prerenderEnvState)
      if (separatePrerenderRouteOptions) {
        await fsp.rm(getPrerenderOutputDirectory(), {
          recursive: true,
          force: true,
        })
      }
    },
  }

  try {
    await loadRouteOptions()
    await loadRequestHandler()
  } catch (error) {
    await handler.close?.()
    throw error
  }

  return handler

  function loadRequestHandler() {
    if (!requestHandlerPromise) {
      requestHandlerPromise = loadRequestHandlerFromBundle(
        serverOutputDirectory,
      )
    }

    return requestHandlerPromise
  }

  function loadRouteOptions() {
    if (!routeOptionsPromise) {
      routeOptionsPromise = separatePrerenderRouteOptions
        ? loadRouteOptionsFromBundle(getPrerenderOutputDirectory())
        : loadRequestHandler().then(() => undefined)
    }

    return routeOptionsPromise
  }

  function getPrerenderOutputDirectory() {
    return (
      prerenderOutputDirectory ??
      join(serverOutputDirectory, '.tanstack/prerender')
    )
  }
}

async function loadRouteOptionsFromBundle(prerenderOutputDirectory: string) {
  const { pathToFileURL } = await import('node:url')
  const prerenderEntryUrl = pathToFileURL(
    join(prerenderOutputDirectory, 'index.js'),
  )
  prerenderEntryUrl.searchParams.set('tss-prerender', Date.now().toString())

  delete globalThis.TSS_PRERENDER_ROUTE_TREE
  await import(prerenderEntryUrl.toString())
}

async function loadRequestHandlerFromBundle(serverOutputDirectory: string) {
  const { pathToFileURL } = await import('node:url')
  const serverEntryUrl = pathToFileURL(
    join(serverOutputDirectory, 'index.js'),
  ).toString()
  const serverModule = await import(serverEntryUrl)
  const handler = serverModule.default

  if (typeof handler === 'function') {
    return handler as (request: Request) => Promise<Response> | Response
  }

  if (handler && typeof handler.fetch === 'function') {
    return (request: Request) => handler.fetch(request)
  }

  throw new Error(
    `Unable to resolve a request handler from Rsbuild server bundle at ${serverEntryUrl}`,
  )
}
