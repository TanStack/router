import { parentPort, workerData } from 'node:worker_threads'
import { preview } from 'vite'
import type {
  PrerenderWorkerData,
  PrerenderWorkerMessage,
} from './prerender-preview'

const port = parentPort!
const { configFile } = workerData as PrerenderWorkerData
const server = await preview({
  configFile,
  preview: {
    port: 0,
    open: false,
  },
})
const url = server.resolvedUrls?.local[0]
if (!url) {
  throw new Error('No resolved URL is available from the Vite preview server')
}

port.once('message', () => {
  server.close().then(
    () => {
      send({ type: 'closed' })
      // Exit this worker through Node's shutdown hooks so plugins can clean up
      // external resources. The parent build keeps running.
      process.exit(process.exitCode ?? 0)
    },
    (error: Error) => send({ type: 'error', error }),
  )
})
send({ type: 'ready', url })

function send(message: PrerenderWorkerMessage) {
  port.postMessage(message)
}
