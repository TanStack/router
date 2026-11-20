import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
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
      prerender(startConfig) {
        return prerender({
          startConfig,
          handler: createRsbuildPrerenderHandler({
            clientOutputDirectory,
            serverOutputDirectory,
          }),
        })
      },
    },
  })
}

/**
 * The prerender's requests, answered by the server bundle of this build in a
 * worker thread of its own: Node keeps an imported module for the process's
 * life by its URL, and the bundle's files keep their names from one build to
 * the next (`index.js`, its chunks), so a second build in one process (a
 * program calling `build()` again) imported in this thread would render
 * with the first build's modules.
 */
function createRsbuildPrerenderHandler({
  clientOutputDirectory,
  serverOutputDirectory,
}: {
  clientOutputDirectory: string
  serverOutputDirectory: string
}): PrerenderHandler {
  // (read by the server bundle: the worker's environment is a copy of this one)
  process.env.TSS_PRERENDERING = 'true'
  process.env.TSS_CLIENT_OUTPUT_DIR = clientOutputDirectory

  let server: ReturnType<typeof startServerWorker> | undefined

  return {
    getClientOutputDirectory() {
      return clientOutputDirectory
    },
    request(path, options) {
      server ??= startServerWorker(serverOutputDirectory)
      const url = new URL(path, 'http://localhost')
      return server.request(url.href, {
        method: options?.method,
        headers: Object.fromEntries(new Headers(options?.headers)),
        body: options?.body as string | undefined,
        redirect: 'manual',
      })
    },
    async close() {
      await server?.close()
    },
  }
}

/** What the worker answers a request with. */
type WorkerAnswer =
  | {
      id: number
      status: number
      statusText: string
      headers: Array<[string, string]>
      body: ArrayBuffer
    }
  | { id: number; error: string }

/**
 * The worker's code (CommonJS, `eval`): imports the server bundle's entry
 * (`workerData`) and answers each request message with its response.
 */
const SERVER_WORKER = `
const { parentPort, workerData } = require('node:worker_threads')
const loading = import(workerData.entry).then((serverModule) => {
  const handler = serverModule.default
  if (typeof handler === 'function') return handler
  if (handler && typeof handler.fetch === 'function') return (request) => handler.fetch(request)
  throw new Error('Unable to resolve a request handler from Rsbuild server bundle at ' + workerData.entry)
})
parentPort.on('message', async ({ id, url, init }) => {
  try {
    const response = await (await loading)(new Request(url, init))
    const body = await response.arrayBuffer()
    parentPort.postMessage(
      { id, status: response.status, statusText: response.statusText, headers: [...response.headers], body },
      [body],
    )
  } catch (error) {
    parentPort.postMessage({ id, error: String((error && error.stack) || error) })
  }
})
`

function startServerWorker(serverOutputDirectory: string) {
  const entry = pathToFileURL(join(serverOutputDirectory, 'index.js')).href
  const worker = new Worker(SERVER_WORKER, {
    eval: true,
    workerData: { entry },
  })
  const pending = new Map<
    number,
    { resolve: (response: Response) => void; reject: (error: Error) => void }
  >()
  let next = 0
  const fail = (error: Error) => {
    for (const { reject } of pending.values()) {
      reject(error)
    }
    pending.clear()
  }
  worker.on('message', (answer: WorkerAnswer) => {
    const waiting = pending.get(answer.id)
    pending.delete(answer.id)
    if ('error' in answer) {
      waiting?.reject(new Error(answer.error))
    } else {
      waiting?.resolve(
        // (a status with no body, 204 or 304, takes none)
        new Response(answer.body.byteLength > 0 ? answer.body : null, {
          status: answer.status,
          statusText: answer.statusText,
          headers: answer.headers,
        }),
      )
    }
  })
  worker.on('error', fail)
  worker.on('exit', (code) =>
    fail(new Error(`The prerender's server worker exited (code ${code})`)),
  )
  return {
    request(url: string, init: RequestInit): Promise<Response> {
      const id = next++
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        worker.postMessage({ id, url, init })
      })
    },
    async close() {
      await worker.terminate()
    },
  }
}
