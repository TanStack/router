/**
 * Control tests of the dev-server harness (dev-server.ts): the server's own
 * file watcher reports the files a test writes, and after `settle()` the
 * server serves the edited files in every environment, has seen the
 * creations, renames and deletions (and the files plugins wrote meanwhile),
 * and the reported HMR payloads tell updates from full reloads.
 */
import { existsSync } from 'node:fs'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import {
  createDevServer as createDevServerIn,
  describeHmr,
  evaluateServed,
} from '../src/dev-server'
import { saveAppFile } from '../src/save-file'
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

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

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
      /**
       * Writes `generated.ts` listing the other `.ts` files when one of them
       * is created, changed or deleted (and the list changed).
       */
      const generator: Plugin = {
        name: 'generator',
        async watchChange(id, { event }) {
          const relative = path.relative(server.root, id)
          // e.g. the harness's barrier files
          if (!relative.endsWith('.ts')) {
            return
          }
          seen.push(`${event} ${relative}`)
          if (relative === 'generated.ts') {
            return
          }
          const names = (await readdir(server.root))
            .filter((name) => name.endsWith('.ts'))
            .filter((name) => name !== 'generated.ts')
            .sort()
          const code = `export const names = ${JSON.stringify(names)}\n`
          const generated = server.file('generated.ts')
          if (
            !existsSync(generated) ||
            (await readFile(generated, 'utf8')) !== code
          ) {
            // Atomically, as a generator writes (the router generator's
            // `safeFileWrite`: a temporary file renamed over the target). A
            // plain `writeFile` is a truncation and a write: under load the
            // watcher reports them as two events (an `add` and an `update`
            // of a new file) and can read the empty file in between.
            await saveAppFile(server.root, generated, code)
          }
        },
      }
      const server = await createDevServer({
        files: { 'a.ts': `export const a = 1\n` },
        plugins: [generator],
      })

      await server.edit({ 'b.ts': `export const b = 1\n` })
      expect(seen).toEqual(['create b.ts', 'create generated.ts'])
      expect((await server.import('/generated.ts')).names).toEqual([
        'a.ts',
        'b.ts',
      ])

      seen.length = 0
      await server.rename('a.ts', 'c.ts')
      await server.settle()
      // A watcher reports the two events of a rename in either order
      expect(seen.sort()).toEqual([
        'create c.ts',
        'delete a.ts',
        'update generated.ts',
      ])
      expect((await server.import('/generated.ts')).names).toEqual([
        'b.ts',
        'c.ts',
      ])

      seen.length = 0
      await server.edit({ 'b.ts': null })
      expect(seen).toEqual(['delete b.ts', 'update generated.ts'])
      expect((await server.import('/generated.ts')).names).toEqual(['c.ts'])
    },
    timeout,
  )

  // The watcher reports a write as a change even when the contents stay the
  // same; settle() waits for that event, whatever the clock says.
  test(
    'reports a write that leaves the contents as they were as a change',
    async () => {
      const server = await createDevServer({ files })
      await server.edit({ 'leaf.ts': files['leaf.ts'] })
      expect(server.events).toEqual([{ event: 'change', file: 'leaf.ts' }])
    },
    timeout,
  )

  // So a plugin that rewrites a file on every file event, even with the same
  // contents, makes the server handle file events forever (a reload loop).
  // The plugin takes a moment before writing, longer than the moment within
  // which the watcher drops a second change of a file.
  test(
    'never settles while a plugin rewrites a file with the same contents on each event',
    async () => {
      const rewriter: Plugin = {
        name: 'rewriter',
        async watchChange(id) {
          // e.g. the harness's barrier files
          if (!id.endsWith('.ts')) {
            return
          }
          await sleep(60)
          await writeFile(
            server.file('generated.ts'),
            `export const same = 1\n`,
          )
        },
      }
      // (3 rounds: a loop shows after the first; 10 would wait ~1.4 s more)
      const server = await createDevServer({
        files,
        plugins: [rewriter],
        settleRounds: 3,
      })
      await expect(
        server.edit({ 'leaf.ts': `export const leaf = 'v2'\n` }),
      ).rejects.toThrow(/keep changing after 3 rounds[\s\S]*generated\.ts/)
    },
    timeout,
  )

  test(
    'settle() waits for the handling of each file of an edit, however long a plugin takes',
    async () => {
      const handling: Array<string> = []
      const slow: Plugin = {
        name: 'slow',
        async watchChange(id) {
          const relative = path.relative(server.root, id)
          if (!relative.endsWith('.ts')) {
            return
          }
          handling.push(`start ${relative}`)
          await sleep(200)
          handling.push(`end ${relative}`)
        },
      }
      const server = await createDevServer({ files, plugins: [slow] })
      await server.load('/main.ts')
      await server.load('/orphan.ts')
      const messages = await server.edit({
        'leaf.ts': `export const leaf = 'v2'\n`,
        'orphan.ts': `export const orphan = 'v2'\n`,
      })
      expect(
        handling.filter((entry) => entry.startsWith('end')).sort(),
      ).toEqual(['end leaf.ts', 'end orphan.ts'])
      expect(describeHmr(messages).sort()).toEqual([
        'client: full-reload *',
        'client: update /main.ts',
      ])
      expect((await server.import('/dep.ts')).dep).toBe('dep:v2')
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

  // Vite's default `server.preTransformRequests`, as in an app: serving a
  // client module starts the transforms of its static imports in the
  // background.
  test(
    'idle() waits for the background transforms of the imports of a served module',
    async () => {
      let release!: () => void
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      const transformed: Array<string> = []
      const server = await createDevServer({
        files,
        plugins: [
          {
            name: 'slow-leaf',
            async transform(_code, id) {
              if (id.endsWith('/leaf.ts')) {
                await released
                transformed.push('leaf.ts')
              }
              return null
            },
          },
        ],
      })
      await server.transform('/dep.ts')
      const idle = server.idle()
      let settled = false
      void idle.then(() => {
        settled = true
      })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(settled).toBe(false)
      release()
      await idle
      expect(transformed).toEqual(['leaf.ts'])
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

describe('bundledDev', () => {
  /** The chunks of a client bundle that contain `marker`. */
  const containing = (bundle: Record<string, string>, marker: string) =>
    Object.keys(bundle).filter((fileName) => bundle[fileName]!.includes(marker))

  test(
    'clientBundle() bundles the client from the entry, again after an edit the dev engine watched; the other environments are served as usual',
    async () => {
      const server = await createDevServer({
        bundledDev: { entry: 'main.ts' },
        files: {
          'main.ts': `import { dep } from './dep'\nexport const value = dep\n`,
          'dep.ts': `export const dep = 'MARK_V1'\n`,
          'other.ts': `export const other = 'MARK_OTHER'\n`,
        },
      })
      const before = await server.clientBundle()
      expect(containing(before, 'MARK_V1')).toHaveLength(1)
      expect(containing(before, 'MARK_OTHER')).toEqual([])
      expect((await server.import('/dep.ts')).dep).toBe('MARK_V1')

      await server.edit({ 'dep.ts': `export const dep = 'MARK_V2'\n` })

      // Rolldown's watcher reports the atomic save as a creation
      expect(server.events.map((event) => event.file)).toEqual(['dep.ts'])
      const after = await server.clientBundle()
      expect({
        v1: containing(after, 'MARK_V1'),
        v2: containing(after, 'MARK_V2').length,
      }).toEqual({ v1: [], v2: 1 })
    },
    timeout,
  )

  test(
    'clientBundle() rejects when the client fails to bundle',
    async () => {
      const server = await createDevServer({
        bundledDev: { entry: 'main.ts' },
        files: { 'main.ts': `export { value } from './missing-module'\n` },
      })
      await expect(server.clientBundle()).rejects.toThrow(/missing-module/)
    },
    timeout,
  )
})
