import { once } from 'node:events'
import { Worker as NodeWorker } from 'node:worker_threads'

export type PrerenderWorkerData = {
  configFile: string | false | undefined
}

export type PrerenderWorkerMessage =
  | { type: 'ready'; url: string }
  | { type: 'closed' }
  | { type: 'error'; error: Error }

export async function startPrerenderPreview({
  configFile,
  outputDir,
}: PrerenderWorkerData & { outputDir: string }) {
  const entry = new URL(
    /* @vite-ignore */ './prerender-worker.js',
    import.meta.url,
  )
  // A module bootstrap preserves inherited eval/stdin flags and V8 options.
  const worker = new NodeWorker(
    new URL(
      'data:text/javascript,' +
        encodeURIComponent(`import ${JSON.stringify(entry.href)}`),
    ),
    {
      workerData: { configFile } satisfies PrerenderWorkerData,
      env: {
        ...process.env,
        TSS_PRERENDERING: 'true',
        TSS_CLIENT_OUTPUT_DIR: outputDir,
      },
    },
  )
  const failure = new AbortController()
  const onError = (error: Error) => failure.abort(error)
  worker.once('error', onError)
  const exited = new Promise<number>((resolve) => {
    worker.once('exit', (code: number) => {
      failure.abort(
        new Error(`Prerender preview worker exited with code ${code}`),
      )
      resolve(code)
    })
  })

  async function readMessage() {
    try {
      const [message] = (await once(worker, 'message', {
        signal: failure.signal,
      })) as [PrerenderWorkerMessage]
      if (message.type === 'error') {
        throw message.error
      }
      return message
    } catch (error) {
      throw failure.signal.aborted ? failure.signal.reason : error
    }
  }

  async function terminate() {
    try {
      await worker.terminate()
    } finally {
      worker.off('error', onError)
    }
  }

  let baseUrl: URL
  try {
    const message = await readMessage()
    if (message.type !== 'ready') {
      throw new Error('Prerender preview worker did not provide a URL')
    }
    baseUrl = new URL(message.url)
  } catch (error) {
    await terminate()
    throw new Error(
      'Failed to start the Vite preview server for prerendering',
      {
        cause: error,
      },
    )
  }

  let closePromise: Promise<void> | undefined
  return {
    baseUrl,
    close() {
      return (closePromise ??= close())
    },
  }

  async function close() {
    try {
      const response = readMessage()
      try {
        worker.postMessage('close')
      } catch (error) {
        failure.abort(error)
      }
      const message = await response
      if (message.type !== 'closed') {
        throw new Error('Prerender preview worker did not finish closing')
      }
      if ((await exited) !== 0) {
        throw failure.signal.reason
      }
    } catch (error) {
      await terminate()
      throw error
    } finally {
      worker.off('error', onError)
    }
  }
}
