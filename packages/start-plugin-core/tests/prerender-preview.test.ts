import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startPrerenderPreview } from '../src/vite/prerender-preview'
import type { EventEmitter } from 'node:events'
import type { Mock } from 'vitest'

type MockWorker = EventEmitter & {
  postMessage: Mock
  terminate: Mock
}

const { workers, construct } = vi.hoisted(() => ({
  workers: [] as Array<MockWorker>,
  construct: vi.fn(),
}))

vi.mock('node:worker_threads', async () => {
  const { EventEmitter } = await import('node:events')
  return {
    Worker: class extends EventEmitter {
      constructor(...args: Array<unknown>) {
        super()
        construct(...args)
        workers.push(this)
      }

      postMessage = vi.fn()
      terminate = vi.fn(async () => {
        this.emit('exit', 1)
        return 1
      })
    },
  }
})

const options = { configFile: '/project/vite.config.ts', outputDir: '/client' }

function start() {
  const preview = startPrerenderPreview(options)
  return { preview, worker: workers[0]! }
}

async function ready() {
  const { preview, worker } = start()
  worker.emit('message', { type: 'ready', url: 'http://127.0.0.1:4173/' })
  return { preview: await preview, worker }
}

describe('prerender preview worker lifecycle', () => {
  beforeEach(() => {
    workers.length = 0
    construct.mockClear()
  })

  it('starts the preview with isolated prerender environment values', async () => {
    const before = {
      prerendering: process.env.TSS_PRERENDERING,
      outputDir: process.env.TSS_CLIENT_OUTPUT_DIR,
    }
    const { preview, worker } = await ready()

    expect(preview.baseUrl.href).toBe('http://127.0.0.1:4173/')
    expect(construct).toHaveBeenCalledWith(expect.any(URL), {
      workerData: { configFile: options.configFile },
      env: {
        ...process.env,
        TSS_PRERENDERING: 'true',
        TSS_CLIENT_OUTPUT_DIR: options.outputDir,
      },
    })
    expect(process.env.TSS_PRERENDERING).toBe(before.prerendering)
    expect(process.env.TSS_CLIENT_OUTPUT_DIR).toBe(before.outputDir)

    const closing = preview.close()
    worker.emit('message', { type: 'closed' })
    worker.emit('exit', 0)
    await closing
  })

  it('awaits a successful worker exit after preview.close and reuses the close promise', async () => {
    const { preview, worker } = await ready()
    const closing = preview.close()

    expect(preview.close()).toBe(closing)
    expect(worker.postMessage).toHaveBeenCalledExactlyOnceWith('close')
    expect(worker.terminate).not.toHaveBeenCalled()

    worker.emit('message', { type: 'closed' })
    let closed = false
    void closing.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(worker.terminate).not.toHaveBeenCalled()
    worker.emit('exit', 0)
    await closing

    expect(worker.terminate).not.toHaveBeenCalled()
    expect(worker.listenerCount('message')).toBe(0)
    expect(worker.listenerCount('error')).toBe(0)
    expect(worker.listenerCount('exit')).toBe(0)
  })

  it('propagates an unsuccessful exit after the preview has closed', async () => {
    const { preview, worker } = await ready()
    const closing = preview.close()
    worker.emit('message', { type: 'closed' })
    worker.emit('exit', 1)
    await expect(closing).rejects.toThrow(
      'Prerender preview worker exited with code 1',
    )
  })

  it('terminates when preview startup fails', async () => {
    const { preview, worker } = start()
    const error = new Error('Invalid Vite config')
    worker.emit('error', error)

    await expect(preview).rejects.toMatchObject({
      message: 'Failed to start the Vite preview server for prerendering',
      cause: error,
    })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('rejects when the worker exits before becoming ready', async () => {
    const { preview, worker } = start()
    worker.emit('exit', 0)

    await expect(preview).rejects.toMatchObject({
      cause: new Error('Prerender preview worker exited with code 0'),
    })
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('terminates when the ready message has an invalid URL', async () => {
    const { preview, worker } = start()
    worker.emit('message', { type: 'ready', url: 'invalid URL' })

    await expect(preview).rejects.toThrow(
      'Failed to start the Vite preview server for prerendering',
    )
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('terminates and propagates preview.close errors', async () => {
    const { preview, worker } = await ready()
    const closing = preview.close()
    const error = new Error('Plugin close failed')
    worker.emit('message', { type: 'error', error })

    await expect(closing).rejects.toBe(error)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it.each(['error', 'exit'])(
    'remembers an unexpected %s after readiness',
    async (event) => {
      const { preview, worker } = await ready()
      const error = new Error('Worker crashed')
      worker.emit(event, event === 'error' ? error : 1)

      await expect(preview.close()).rejects.toThrow(
        event === 'error'
          ? error.message
          : 'Prerender preview worker exited with code 1',
      )
      expect(worker.terminate).toHaveBeenCalledOnce()
    },
  )

  it('rejects when the worker exits while closing', async () => {
    const { preview, worker } = await ready()
    const closing = preview.close()
    worker.emit('exit', 1)

    await expect(closing).rejects.toThrow(
      'Prerender preview worker exited with code 1',
    )
    expect(worker.terminate).toHaveBeenCalledOnce()
  })

  it('terminates when posting the close request throws', async () => {
    const { preview, worker } = await ready()
    const error = new Error('Unable to send message')
    worker.postMessage.mockImplementation(() => {
      throw error
    })

    await expect(preview.close()).rejects.toBe(error)
    expect(worker.terminate).toHaveBeenCalledOnce()
  })
})
