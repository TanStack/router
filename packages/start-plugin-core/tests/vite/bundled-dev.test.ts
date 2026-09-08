import { describe, expect, test, vi } from 'vitest'
import { ensureLatestClientBuild } from '../../src/vite/dev-server-plugin/bundled-dev'

describe('ensureLatestClientBuild', () => {
  test.each(['legacy', 'bundledDev'])(
    'awaits the %s engine before SSR without triggering a page reload',
    async (layout) => {
      let finishBuild!: () => void
      const build = new Promise<void>((resolve) => {
        finishBuild = resolve
      })
      const engine = {
        ensureLatestBuildOutput: vi.fn(function (this: unknown) {
          expect(this).toBe(engine)
          return build
        }),
      }
      const container = {
        get devEngine() {
          return engine
        },
        triggerBundleRegenerationIfStale: vi.fn(),
      }
      const environment =
        layout === 'legacy' ? container : { bundledDev: container }
      const finished = vi.fn()
      const pending = ensureLatestClientBuild(environment).then(finished)

      await Promise.resolve()
      expect(engine.ensureLatestBuildOutput).toHaveBeenCalledOnce()
      expect(finished).not.toHaveBeenCalled()
      expect(container.triggerBundleRegenerationIfStale).not.toHaveBeenCalled()

      finishBuild()
      await pending
      expect(finished).toHaveBeenCalledOnce()
    },
  )

  test.each([undefined, {}, { bundledDev: {} }, { devEngine: {} }])(
    'reports an unavailable bundled-dev engine for %j',
    async (environment) => {
      await expect(ensureLatestClientBuild(environment)).rejects.toThrow(
        'could not access the Vite bundled-dev engine',
      )
    },
  )

  test('propagates client build failures', async () => {
    const error = new Error('client build failed')
    await expect(
      ensureLatestClientBuild({
        bundledDev: {
          devEngine: {
            ensureLatestBuildOutput: vi.fn().mockRejectedValue(error),
          },
        },
      }),
    ).rejects.toBe(error)
  })
})
