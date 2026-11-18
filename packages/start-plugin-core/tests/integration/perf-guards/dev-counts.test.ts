/**
 * Dev-server work and memory guards (not oracle tests: they count what a
 * compiler does, which a correct compiler need not do the same way). Each
 * guards a reported cost: an Rsbuild dev server keeps no plans or raw facts
 * of modules deleted after the app stopped importing them (the documented
 * stats knob, TSR_COMPILER_STATS=1; other sessions alive in this worker are
 * idle, so the change is this server's), and a Vite dev server compiles each
 * dependent of an edit once per environment.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import { startDevServer } from '../../dev-server'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'

const timeout = 30_000

const factory = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`

describe('Rsbuild dev: modules the app stops importing', () => {
  // The compiler's caches are bounded by the live modules. Rspack
  // reports a deleted file only while a module depends on it: a module the
  // app stopped importing and then deleted got no invalidation, and its plans
  // and raw facts stayed for the session (found by the compiler soak,
  // benchmarks/compiler-perf `--scenarios soak --soak-bundlers rsbuild`).
  // Measured through the documented stats knob (TSR_COMPILER_STATS=1); other
  // sessions alive in this worker are idle, so the change is this server's.
  test(
    'leave no plans or raw facts behind once deleted',
    async () => {
      vi.stubEnv('TSR_COMPILER_STATS', '1')
      onTestFinished(() => {
        vi.unstubAllEnvs()
      })
      const server = await startRsbuildStartDevServer({
        compileTimeout: 10_000,
        files: {
          'src/a.ts': `export const a = 'MARK_a'\n`,
          'src/entry.ts': `export { a } from './a'\n`,
        },
      })
      const counts = () => {
        const s: Record<string, number> = compilerStats()['start:rsbuild'] ?? {}
        return { plans: s.plans ?? 0, rawFacts: s.rawFacts ?? 0 }
      }
      const before = counts()
      for (let i = 0; i < 3; i++) {
        // a file nothing imports yet: Rspack does not watch it, no compile
        await server.write({
          [`src/m${i}.ts`]: `export const m = 'MARK_m${i}'\n`,
        })
        await server.edit({
          'src/entry.ts': `export { a } from './a'\nexport { m } from './m${i}'\n`,
        })
        await server.edit({ 'src/entry.ts': `export { a } from './a'\n` })
        // deleted once nothing imports it: Rspack reports no removal either
        await server.write({ [`src/m${i}.ts`]: null })
      }
      expect(server.errors).toEqual([])
      const after = counts()
      expect(after.plans).toBeLessThanOrEqual(before.plans)
      expect(after.rawFacts).toBeLessThanOrEqual(before.rawFacts)
    },
    timeout,
  )
})

describe('Vite dev: dependents whose output is unchanged', () => {
  // A factory re-exported from another module: every importer re-plans and
  // emits the same output. Each is compiled once per environment, during the
  // edit; neither the next SSR import nor the next page load compiles it
  // again, also when the dependents import each other and are compiled at
  // the same time.
  test(
    'are compiled once per environment',
    async () => {
      const names = Array.from({ length: 40 }, (_, i) => `d${i}`)
      const counts: Record<string, Record<string, number>> = {
        client: {},
        ssr: {},
      }
      let counting = false
      const server = await startDevServer({
        plugins: [
          {
            name: 'count-transforms',
            transform(_code, id) {
              const name = /\/src\/(d\d+)\.ts$/.exec(id)?.[1]
              if (counting && name) {
                const env = counts[this.environment.name]!
                env[name] = (env[name] ?? 0) + 1
              }
            },
          },
        ],
        files: {
          'src/fa.ts': factory,
          'src/fb.ts': factory,
          'src/lib.ts': `export { base } from './fa'\n`,
          ...Object.fromEntries(
            names.map((name, i) => [
              `src/${name}.ts`,
              `import { base } from './lib'
${i > 0 ? `import { fn as first } from './d0'\nexport const p = first\n` : ''}export const fn = base.handler(async () => '${name}')
`,
            ]),
          ),
          'src/entry.ts': names
            .map((name) => `export { fn as ${name} } from './${name}'\n`)
            .join(''),
        },
      })
      await server.import('/src/entry.ts')
      await server.load('/src/entry.ts')
      await server.idle()

      counting = true
      await server.edit({ 'src/lib.ts': `export { base } from './fb'\n` })
      await server.import('/src/entry.ts')
      await server.load('/src/entry.ts')
      await server.idle()

      const once = Object.fromEntries(names.map((name) => [name, 1]))
      expect(counts).toEqual({ client: once, ssr: once })
    },
    timeout,
  )
})

describe('Vite dev: an empty save of a file nothing reads', () => {
  // An event that reads a file empty reads it again for a moment (an
  // in-place save reported between truncation and write), for a file whose
  // text a plan or a raw fact depends on. A file nothing imports is read once
  // per hook either way: the wait cost every such save about 100 ms in the
  // hot update. Source: Astra review H9.
  test(
    'is read as often as an ordinary save',
    async () => {
      vi.stubEnv('TSR_COMPILER_STATS', '1')
      onTestFinished(() => {
        vi.unstubAllEnvs()
      })
      const server = await startDevServer({
        files: {
          'src/a.ts': `export const a = 'MARK_a'\n`,
          'src/notes.ts': `export const notes = 0\n`,
        },
      })
      await server.transform('/src/a.ts')
      const reads = () => compilerStats()['start:vite']?.eventReads ?? 0
      const readsOf = async (text: string) => {
        const before = reads()
        await server.edit({ 'src/notes.ts': text })
        return reads() - before
      }
      const ordinary = await readsOf(`export const notes = 1\n`)
      expect(ordinary).toBeGreaterThan(0)
      expect(await readsOf('')).toBe(ordinary)
    },
    timeout,
  )
})

describe('Vite dev: a module removed with the module it imports', () => {
  // Two files removed at once (a feature deleted), the importer reported
  // while the removal of its import is still being judged: the importer is
  // gone, so no environment is left with it to build again (its removal
  // took it out of the stale sets, and the judgement of the other removal,
  // which read the importer's plan before it was evicted, does not bring it
  // back). Forced with a resolver that answers the import's resolution, once
  // the import is gone, only after the importer's removal went through
  // Start's hot update. Found on CI's loaded agents (Linux x64 and arm64,
  // Windows x64: `createServerFn.test.ts`, a shared package removed after
  // its test).
  test(
    'leaves no stale path',
    async () => {
      let importerRemoved!: () => void
      const removed = new Promise<void>((resolve) => {
        importerRemoved = resolve
      })
      const server = await startDevServer({
        plugins: [
          {
            name: 'slow-resolution-of-a-removed-import',
            enforce: 'pre',
            async resolveId(source, importer) {
              if (
                source === './db.server' &&
                importer !== undefined &&
                !existsSync(path.join(path.dirname(importer), 'db.server.ts'))
              ) {
                await removed
              }
              return null
            },
            hotUpdate({ file, type }) {
              if (type === 'delete' && file.endsWith('/src/fn.ts')) {
                importerRemoved()
              }
            },
          },
        ],
        files: {
          'src/fn.ts': `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export const fn = createServerFn().handler(async () => db.x())
`,
          'src/db.server.ts': `export const db = { x: () => 'MARK_db' }\n`,
          'src/entry.ts': `export { fn } from './fn'\n`,
        },
      })
      await server.import('/src/entry.ts')
      await server.load('/src/entry.ts')
      await server.idle()
      await server.edit({ 'src/entry.ts': `export const none = 0\n` })
      await server.import('/src/entry.ts')
      await server.load('/src/entry.ts')
      await server.idle()

      await server.write({ 'src/db.server.ts': null })
      await server.write({ 'src/fn.ts': null })
      await server.settle()
      expect(compilerStats()['start:vite']?.stalePaths ?? 0).toBe(0)
    },
    timeout,
  )
})

describe('Vite dev: a module whose import moves to another file, the old one removed', () => {
  // A rename done by hand (a new file written, the importer pointed at it,
  // the old file deleted): the importer's change is applied first, its plan
  // of the old text stays until the new text compiles, and the removal
  // judges that plan. Its modules would wait for the removed file to come
  // back, but the importer's own event had them built again, from a text
  // that no longer reads the removed file: nothing waits for it. Waiting
  // left a stale path that the next file created anywhere took, reloading
  // the page (Vite sends no update for a file nothing imports). Found by the
  // import-protection dev test of a kept `onViolation` trace
  // (`importProtection/dev.test.ts`) with the old file deleted in the same
  // edit: the file's stale-path self-check failed. Two steps, so that the
  // importer's event comes first, as the watcher reported it there.
  test(
    'leaves no stale path, and a file created later reloads nothing',
    async () => {
      const fn = (
        name: string,
      ) => `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_${name}')
export const tag = 'MARK_${name}'
`
      const server = await startDevServer({
        files: {
          'src/left.ts': fn('left'),
          'src/entry.ts': `export { fn, tag } from './left'\n`,
        },
      })
      expect((await server.import('/src/entry.ts')).tag).toBe('MARK_left')
      await server.load('/src/entry.ts')
      await server.idle()

      await server.edit({
        'src/right.ts': fn('right'),
        'src/entry.ts': `export { fn, tag } from './right'\n`,
      })
      await server.edit({ 'src/left.ts': null })
      // (what the removal logs is not this row's subject)
      const since = server.logs.length
      expect((await server.import('/src/entry.ts')).tag).toBe('MARK_right')
      await server.load('/src/entry.ts')
      await server.idle()
      expect(compilerStats()['start:vite']?.stalePaths ?? 0).toBe(0)

      expect(
        await server.edit({ 'src/other.ts': `export const other = 0\n` }),
      ).toEqual([])
      // the old file back: nothing reads it
      await server.edit({ 'src/left.ts': fn('left') })
      expect((await server.import('/src/entry.ts')).tag).toBe('MARK_right')
      expect(server.logs.slice(since)).toEqual([])
    },
    timeout,
  )
})
