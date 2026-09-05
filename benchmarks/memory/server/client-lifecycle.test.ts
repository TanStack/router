import { globSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it, vi } from 'vitest'

const clientRoot = fileURLToPath(new URL('../client/', import.meta.url))
const entrypoints = globSync('scenarios/*/*/memory.bench.ts', {
  cwd: clientRoot,
})

it.each(entrypoints)(
  '%s resets the app between CodSpeed invocations',
  async (file) => {
    const events: Array<string> = []
    const beforeHooks: Array<() => unknown> = []
    const afterHooks: Array<() => unknown> = []
    const workload = {
      name: 'lifecycle control',
      sanity: vi.fn(),
      before: () => events.push('mount'),
      run: () => events.push('navigate'),
      after: () => events.push('unmount'),
    }
    let run: (() => unknown) | undefined
    let options: { setup?: unknown; teardown?: unknown } | undefined
    const entrypoint = resolve(clientRoot, file)
    const setup = resolve(dirname(entrypoint), 'setup.ts')

    vi.doMock('vitest', () => ({
      describe: (_name: string, register: () => void) => register(),
      beforeEach: (hook: () => unknown) => beforeHooks.push(hook),
      afterEach: (hook: () => unknown) => afterHooks.push(hook),
      bench: (
        _name: string,
        fn: () => unknown,
        benchOptions: typeof options,
      ) => {
        run = fn
        options = benchOptions
      },
    }))
    vi.doMock(setup, () => ({ workload }))

    try {
      await import(/* @vite-ignore */ entrypoint)
      expect(workload.sanity).toHaveBeenCalledOnce()
      expect(run).toBe(workload.run)
      // Tinybench uses its own hooks; CodSpeed uses the suite hooks below.
      expect(options?.setup).toBe(workload.before)
      expect(options?.teardown).toBe(workload.after)
      for (let invocation = 0; invocation < 3; invocation++) {
        for (const before of beforeHooks) {
          await before()
        }
        await run!()
        for (const after of afterHooks) {
          await after()
        }
      }
      expect(events).toEqual(
        Array(3).fill(['mount', 'navigate', 'unmount']).flat(),
      )
    } finally {
      vi.doUnmock(setup)
      vi.doUnmock('vitest')
      vi.resetModules()
    }
  },
)
