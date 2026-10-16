/**
 * Control tests of the dev-server harness (dev-server.ts): after `settle()`,
 * the server serves the edited files in every environment, has seen the
 * creations, renames and deletions (and the files plugins wrote meanwhile),
 * and the reported HMR payloads tell updates from full reloads.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import {
  createDevServer as createDevServerIn,
  describeHmr,
  evaluateServed,
} from '../src/dev-server'
import type { DevServerOptions } from '../src/dev-server'
import type { Plugin, ViteDevServer } from 'vite'

const timeout = 30_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

function createDevServer(options: Omit<DevServerOptions, 'dir'>) {
  return createDevServerIn({
    dir: testsDir,
    registerCleanup: onTestFinished,
    ...options,
  })
}

/**
 * `main.ts` accepts its own updates and imports `dep.ts`, which imports
 * `leaf.ts`; `orphan.ts` is imported by nothing that accepts updates.
 */
const files = {
  'main.ts': `import { dep } from './dep'
export const value = dep
if (import.meta.hot) {
  import.meta.hot.accept()
}
`,
  'dep.ts': `import { leaf } from './leaf'
export const dep = 'dep:' + leaf
`,
  'leaf.ts': `export const leaf = 'v1'\n`,
  'orphan.ts': `export const orphan = 'v1'\n`,
  'lazy.ts': `export const load = () => import('./chunk')\n`,
  'chunk.ts': `export const chunk = 'chunk'\n`,
}

describe('dev server harness', () => {
  test(
    'serves an edited module in each environment after settle()',
    async () => {
      const server = await createDevServer({ files })
      expect(await server.transform('/leaf.ts')).toContain('v1')
      expect((await server.import('/dep.ts')).dep).toBe('dep:v1')

      await server.edit({ 'leaf.ts': `export const leaf = 'v2'\n` })

      expect(server.events).toEqual([{ event: 'change', file: 'leaf.ts' }])
      expect(await server.transform('/leaf.ts')).toContain('v2')
      expect(await server.transform('/leaf.ts', 'ssr')).toContain('v2')
      expect((await server.import('/dep.ts')).dep).toBe('dep:v2')
    },
    timeout,
  )

  test(
    'load() requests the static imports of a module transitively, not its dynamic imports',
    async () => {
      const server = await createDevServer({ files })
      expect(Object.keys(await server.load('/main.ts')).sort()).toEqual([
        '/dep.ts',
        '/leaf.ts',
        '/main.ts',
      ])
      expect(Object.keys(await server.load('/lazy.ts'))).toEqual(['/lazy.ts'])
    },
    timeout,
  )

  test(
    'reports an update to the accepting module, and a full reload when nothing accepts',
    async () => {
      const server = await createDevServer({ files })
      await server.load('/main.ts')
      await server.load('/orphan.ts')

      expect(
        describeHmr(
          await server.edit({ 'leaf.ts': `export const leaf = 'v2'\n` }),
        ),
      ).toEqual(['client: update /main.ts'])
      expect(
        describeHmr(
          await server.edit({ 'orphan.ts': `export const orphan = 'v2'\n` }),
        ),
      ).toEqual(['client: full-reload *'])
    },
    timeout,
  )

  test(
    'reports created, renamed and deleted files to the plugins, and the files they write meanwhile',
    async () => {
      const seen: Array<string> = []
      /** Writes `generated.ts` listing the `.ts` files whenever one changes. */
      const generator: Plugin = {
        name: 'generator',
        async watchChange(id, { event }) {
          const relative = path.relative(server.root, id)
          seen.push(`${event} ${relative}`)
          if (relative !== 'generated.ts') {
            const { readdir } = await import('node:fs/promises')
            const names = (await readdir(server.root))
              .filter((name) => name.endsWith('.ts'))
              .filter((name) => name !== 'generated.ts')
              .sort()
            await server.write({
              'generated.ts': `export const names = ${JSON.stringify(names)}\n`,
            })
          }
        },
      }
      const server = await createDevServer({
        files: { 'a.ts': `export const a = 1\n` },
        plugins: [generator],
      })

      await server.write({ 'b.ts': `export const b = 1\n` })
      await server.settle()
      await server.rename('a.ts', 'c.ts')
      await server.settle()
      await server.edit({ 'b.ts': null })

      expect(seen).toEqual([
        'create b.ts',
        'create generated.ts',
        'delete a.ts',
        'create c.ts',
        'update generated.ts',
        'delete b.ts',
        'update generated.ts',
      ])
      expect(await server.transform('/generated.ts')).toContain('["c.ts"]')
    },
    timeout,
  )

  test(
    'serves a request over HTTP like the client environment',
    async () => {
      const server = await createDevServer({ files, listen: true })
      const response = await server.fetch('/leaf.ts')
      expect(response.status).toBe(200)
      // HTTP responses inline the source map
      expect(response.body.replace(/\n\/\/# sourceMappingURL=.*$/s, '')).toBe(
        await server.transform('/leaf.ts'),
      )

      await server.edit({ 'leaf.ts': `export const leaf = 'v2'\n` })
      expect((await server.fetch('/leaf.ts')).body).toContain('v2')
    },
    timeout,
  )

  test(
    'settles when a plugin restarts the server while handling a file event, and keeps reporting',
    async () => {
      let restarts = 0
      let restartable: ViteDevServer | undefined
      const server = await createDevServer({
        files: { ...files, 'restart.json': '{}' },
        plugins: [
          {
            name: 'restarts',
            configureServer(vite) {
              restartable = vite
            },
            async watchChange(id) {
              if (id.endsWith('restart.json')) {
                restarts++
                await restartable?.restart()
              }
            },
          },
        ],
      })
      await server.load('/main.ts')
      await server.edit({ 'restart.json': '{ "a": 1 }' })
      expect(restarts).toBe(1)

      await server.load('/main.ts')
      expect(
        describeHmr(
          await server.edit({ 'leaf.ts': `export const leaf = 'v2'\n` }),
        ),
      ).toEqual(['client: update /main.ts'])
      expect(await server.transform('/leaf.ts')).toContain('v2')
    },
    timeout,
  )

  test(
    'rejects settle() with the error a plugin throws while handling a file event',
    async () => {
      const server = await createDevServer({
        files,
        plugins: [
          {
            name: 'throws',
            watchChange() {
              throw new Error('watchChange failed')
            },
          },
        ],
      })
      await expect(
        server.edit({ 'leaf.ts': `export const leaf = 'v2'\n` }),
      ).rejects.toThrow('watchChange failed')
    },
    timeout,
  )

  test(
    'registerCleanup receives close(), which stops the server and removes the app',
    async () => {
      const cleanups: Array<() => Promise<void>> = []
      const server = await createDevServerIn({
        dir: testsDir,
        files,
        registerCleanup: (cleanup) => cleanups.push(cleanup),
      })
      expect(existsSync(server.root)).toBe(true)
      for (const cleanup of cleanups) {
        await cleanup()
      }
      expect(existsSync(server.root)).toBe(false)
    },
    timeout,
  )
})

describe('evaluateServed', () => {
  test(
    'evaluates the served module linked to the modules it imports, with live bindings',
    async () => {
      const server = await createDevServer({
        files: {
          'main.ts': `import { count, bump } from './counter'
export const read = () => count
export { bump }
export const lazy = () => import('./chunk')
if (import.meta.hot) {
  import.meta.hot.accept()
}
`,
          'counter.ts': `export let count = 0
export const bump = () => ++count
`,
          'chunk.ts': `export const chunk = 'chunk'\n`,
        },
      })
      const main = await evaluateServed(server, '/main.ts')
      main.bump()
      expect(main.read()).toBe(1)
      expect((await main.lazy()).chunk).toBe('chunk')
    },
    timeout,
  )

  test(
    'evaluates the edited code after settle()',
    async () => {
      const server = await createDevServer({ files })
      expect((await evaluateServed(server, '/main.ts')).value).toBe('dep:v1')
      await server.edit({ 'leaf.ts': `export const leaf = 'v2'\n` })
      expect((await evaluateServed(server, '/main.ts')).value).toBe('dep:v2')
    },
    timeout,
  )

  test(
    'links a skipped module to its stub, and fails to link it without one',
    async () => {
      const server = await createDevServer({ files })
      const skip = /\/leaf\.ts$/
      expect(
        (
          await evaluateServed(server, '/dep.ts', {
            skip,
            stubs: { '/leaf.ts': { leaf: 'stub' } },
          })
        ).dep,
      ).toBe('dep:stub')
      await expect(evaluateServed(server, '/dep.ts', { skip })).rejects.toThrow(
        'No stub for import /leaf.ts',
      )
    },
    timeout,
  )
})
