import { join } from 'pathe'
import { postBuild } from '../post-build'
import { prerender } from '../prerender'
import type { PrerenderHandler } from '../prerender'
import type { TanStackStartOutputConfig } from '../schema'

export async function postBuildWithRsbuild({
  startConfig,
  clientOutputDirectory,
  serverOutputDirectory,
}: {
  startConfig: TanStackStartOutputConfig
  clientOutputDirectory: string
  serverOutputDirectory: string
}) {
  await postBuild({
    startConfig,
    adapter: {
      getClientOutputDirectory() {
        return clientOutputDirectory
      },
      async prerender(startConfig) {
        const handler = createRsbuildPrerenderHandler({
          clientOutputDirectory,
          serverOutputDirectory,
        })
        await handler.loadRequestHandler()

        return prerender({
          startConfig,
          handler,
        })
      },
    },
  })
}

function createRsbuildPrerenderHandler({
  clientOutputDirectory,
  serverOutputDirectory,
}: {
  clientOutputDirectory: string
  serverOutputDirectory: string
}): PrerenderHandler & {
  loadRequestHandler: () => Promise<
    (request: Request, opts?: unknown) => Promise<Response> | Response
  >
} {
  process.env.TSS_PRERENDERING = 'true'
  process.env.TSS_CLIENT_OUTPUT_DIR = clientOutputDirectory

  let requestHandlerPromise:
    | Promise<
        (request: Request, opts?: unknown) => Promise<Response> | Response
      >
    | undefined

  return {
    loadRequestHandler,
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
  }

  function loadRequestHandler() {
    if (!requestHandlerPromise) {
      requestHandlerPromise = loadRequestHandlerFromBundle(
        serverOutputDirectory,
      )
    }

    return requestHandlerPromise
  }
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
