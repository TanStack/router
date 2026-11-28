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
import mdx from '@mdx-js/rollup'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { compilerStats } from '@tanstack/router-utils/compiler'
import { startDevServer } from '../../dev-server'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'

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
  test('leave no plans or raw facts behind once deleted', async () => {
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
  })
})

describe('Vite dev: dependents whose output is unchanged', () => {
  // A factory re-exported from another module: every importer re-plans and
  // emits the same output. Each is compiled once per environment, during the
  // edit; neither the next SSR import nor the next page load compiles it
  // again, also when the dependents import each other and are compiled at
  // the same time.
  test('are compiled once per environment', async () => {
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
  })
})

describe('Vite dev: an empty save of a file nothing reads', () => {
  // An event that reads a file empty reads it again for a moment (an
  // in-place save reported between truncation and write), for a file whose
  // text a plan or a raw fact depends on. A file nothing imports is read once
  // per hook either way: the wait cost every such save about 100 ms in the
  // hot update. Source: Astra review H9.
  test('is read as often as an ordinary save', async () => {
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
  })
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
  test('leaves no stale path', async () => {
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
  })
})

/** A server fn of a file named `name`, and its client-visible tag. */
const serverFnFile = (
  name: string,
) => `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 'MARK_${name}')
export const tag = 'MARK_${name}'
`
const reExport = (from: string) => `export { fn, tag } from './${from}'\n`
/**
 * A stale-set count of the label's sessions since the call: a closed dev
 * server's session stays in `compilerStats()` until it is collected, with
 * what its stale sets held.
 */
const staleSince = (label: 'start:vite' | 'start:rsbuild') => {
  const count = () => compilerStats()[label]?.stalePaths ?? 0
  const before = count()
  return () => count() - before
}

/**
 * `src/entry.ts` re-exports `src/left.ts`'s server fn, requested in both
 * environments. SSR imports it lazily (as a route's or a server fn's module
 * is): SSR's module runner imports its entry again after a full reload, and
 * the module only when the app asks for it (`ssrTag`).
 */
const startLeft = async () => {
  const stale = staleSince('start:vite')
  const server = await startDevServer({
    files: {
      'src/left.ts': serverFnFile('left'),
      'src/entry.ts': reExport('left'),
      'src/server.ts': `export const load = () => import('./entry')\n`,
    },
  })
  const ssrTag = async () =>
    (await (await server.import('/src/server.ts')).load()).tag as string
  expect(await ssrTag()).toBe('MARK_left')
  await server.load('/src/entry.ts')
  await server.idle()
  return Object.assign(server, { stale, ssrTag })
}
type Server = Awaited<ReturnType<typeof startLeft>>
/** `src/entry.ts` pointed at a new `src/right.ts`. */
const moveImport = (server: Server) =>
  server.edit({
    'src/right.ts': serverFnFile('right'),
    'src/entry.ts': reExport('right'),
  })
const removeLeft = (server: Server) => server.edit({ 'src/left.ts': null })
/**
 * The old file back. Vite's graph still has its modules (their client
 * module reloads the page, as at its removal); what reads it no longer is
 * not woken: SSR does not reload every module for it.
 */
const leftBack = async (server: Server) => {
  const sent = (await server.edit({ 'src/left.ts': serverFnFile('left') }))
    .filter((m) => m.type !== 'custom')
    .map((m) => `${m.environment} ${m.type} ${m.paths.join(' ')}`)
  expect(sent).not.toContain('ssr full-reload *')
  expect(sent.join('\n')).not.toContain('/src/entry.ts')
}
const createOther = (server: Pick<Server, 'edit'>) =>
  server.edit({ 'src/other.ts': `export const other = 0\n` })

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
  test('leaves no stale path, and a file created later reloads nothing', async () => {
    const server = await startLeft()
    await moveImport(server)
    await removeLeft(server)
    // (what the removal logs is not this row's subject)
    const since = server.logs.length
    expect((await server.import('/src/entry.ts')).tag).toBe('MARK_right')
    await server.load('/src/entry.ts')
    await server.idle()
    expect(server.stale()).toBe(0)

    expect(await createOther(server)).toEqual([])
    // the old file back: nothing reads it
    await server.edit({ 'src/left.ts': serverFnFile('left') })
    expect((await server.import('/src/entry.ts')).tag).toBe('MARK_right')
    expect(server.logs.slice(since)).toEqual([])
  })

  // The same with the importer requested again in one environment only (a
  // page open and no SSR request, or a server route called and no page
  // open): the other environment compiled nothing of the new text, so its
  // plan of the old text was what the removal judged. The importer's own
  // event ends that plan in every environment.
  test.each([
    ['the client', (server: Server) => server.load('/src/entry.ts')],
    [
      'SSR',
      async (server: Server) => {
        expect(await server.ssrTag()).toBe('MARK_right')
      },
    ],
  ])(
    'requested again in %s only: no stale path, a file created later updates nothing',
    async (_, request) => {
      const server = await startLeft()
      await moveImport(server)
      await removeLeft(server)
      await request(server)
      await server.idle()
      expect.soft(server.stale()).toBe(0)

      expect(await createOther(server)).toEqual([])
      await leftBack(server)
    },
  )

  // Nothing requested between the edits (no page open, no SSR request):
  // the two events in either order leave the same state, as Vite's graph
  // does (it invalidated the importer at its own event either way).
  test.each([
    ['the import moved, then the old file removed', [moveImport, removeLeft]],
    ['the old file removed, then the import moved', [removeLeft, moveImport]],
  ])(
    '%s, nothing requested: no stale path, a file created later updates nothing',
    async (_, steps) => {
      const server = await startLeft()
      for (const step of steps) {
        await step(server)
      }
      expect.soft(server.stale()).toBe(0)
      expect(await createOther(server)).toEqual([])
    },
  )

  // The old file back (an undo, a branch switch) wakes nothing: no
  // environment's importer reads it any more.
  test('the old file back, nothing requested: SSR does not reload, the importer serves the new file', async () => {
    const server = await startLeft()
    await moveImport(server)
    await removeLeft(server)
    await leftBack(server)
    expect(await server.ssrTag()).toBe('MARK_right')
    expect(server.stale()).toBe(0)
  })

  // The three files written at once (a checkout): the watcher reports them
  // in its own order, and every order leaves no stale path.
  test('all in one edit, nothing requested: no stale path, a file created later updates nothing', async () => {
    const server = await startLeft()
    await server.edit({
      'src/right.ts': serverFnFile('right'),
      'src/entry.ts': reExport('right'),
      'src/left.ts': null,
    })
    expect.soft(server.stale()).toBe(0)
    expect(await createOther(server)).toEqual([])
  })
})

describe('Vite dev: a module whose import is removed and comes back', () => {
  // The importer still imports the removed file: its modules are built again
  // at the removal (their import fails), a file created meanwhile that is
  // not the file updates nothing (it sent a full reload and an SSR update
  // while modules waited for the file), and its return builds them again.
  test.each([
    ['', false],
    [', the importer edited meanwhile', true],
  ])('serves the file back%s', async (_, editImporter) => {
    const server = await startLeft()
    await removeLeft(server)
    expect(server.stale()).toBe(0)
    expect(await createOther(server)).toEqual([])
    if (editImporter) {
      // still importing it: its next compile records the failed import
      await server.edit({ 'src/entry.ts': `// edited\n${reExport('left')}` })
    }
    await server.edit({ 'src/left.ts': serverFnFile('back') })
    expect(await server.ssrTag()).toBe('MARK_back')
    const client = await server.load('/src/entry.ts')
    expect(client['/src/left.ts']).toContain('MARK_back')
    await server.idle()
    expect(server.stale()).toBe(0)
  })
})

describe('Vite dev: a module whose removed import its client output does not import', () => {
  // `page.ts`'s server fn handler reads `left.ts`; the client output drops
  // the handler and the import. The removal builds `page.ts` again at once,
  // as any change of what its plan read does (the client output compiles
  // without the file; the plan records the failed import). A file created
  // later that is not the file updates nothing (it sent a full reload while
  // `page.ts` waited for the file); the file's return builds `page.ts` again
  // (its failed import resolves). Source: Astra's second stale-set review
  // (an unrelated creation reloaded the page).
  test('the removal updates it, a file created later updates nothing, the file back updates it', async () => {
    const stale = staleSince('start:vite')
    const server = await startDevServer({
      files: {
        'src/left.ts': `export const left = 'MARK_left'\n`,
        'src/page.ts': `import { createServerFn } from '@tanstack/react-start'
import { left } from './left'
export const fn = createServerFn().handler(async () => left)
`,
      },
    })
    const client = (sent: Array<{ environment: string; type: string }>) =>
      sent.filter((m) => m.environment === 'client' && m.type !== 'custom')
    await server.load('/src/page.ts')
    await server.idle()
    expect(client(await server.edit({ 'src/left.ts': null }))).not.toEqual([])
    // (the page fetches it again)
    await server.load('/src/page.ts')
    await server.idle()
    expect(stale()).toBe(0)
    expect(await createOther(server)).toEqual([])
    expect(
      client(
        await server.edit({ 'src/left.ts': `export const left = 'back'\n` }),
      ),
    ).not.toEqual([])
  })
})

/**
 * `startLeft` with the importer a module another plugin compiles in place
 * (`src/entry.mdx`, `@mdx-js/rollup`): the compiler reads no MDX, so a file
 * event cannot compare the file's text with its plan's.
 */
const startLeftMdx = async () => {
  const stale = staleSince('start:vite')
  const server = await startDevServer({
    plugins: [{ enforce: 'pre', ...mdx() }],
    files: {
      'src/left.ts': serverFnFile('left'),
      'src/entry.mdx': reExport('left'),
      'src/server.ts': `export const load = () => import('./entry.mdx')\n`,
    },
  })
  const ssrTag = async () =>
    (await (await server.import('/src/server.ts')).load()).tag as string
  expect(await ssrTag()).toBe('MARK_left')
  await server.load('/src/entry.mdx')
  await server.idle()
  return Object.assign(server, { stale, ssrTag })
}

describe('Vite dev: an MDX module whose import moves to another file, the old one removed', () => {
  // The rename by hand of the matrix above, with the importer in MDX. Its
  // own event ends its plan of the former text in every environment, as a
  // TypeScript importer's does: the removal finds nothing that waits for
  // the old file, and a file created later updates nothing (it reloaded
  // the SSR entry and sent the MDX module again). Source: Astra round 3
  // (hosts B2).
  test.each([
    ['the import moved, then the old file removed', true],
    ['the old file removed, then the import moved', false],
  ])(
    '%s, nothing requested: a file created later updates nothing',
    async (_, moveFirst) => {
      const server = await startLeftMdx()
      const move = () =>
        server.edit({
          'src/right.ts': serverFnFile('right'),
          'src/entry.mdx': reExport('right'),
        })
      const remove = () => server.edit({ 'src/left.ts': null })
      if (moveFirst) {
        await move()
        await remove()
      } else {
        await remove()
        await move()
      }
      expect.soft(server.stale()).toBe(0)
      expect(await createOther(server)).toEqual([])
      expect(await server.ssrTag()).toBe('MARK_right')
    },
  )
})

describe('A module saved with the same text, then its import edited', () => {
  // The first event of the importer in the session reads a text its plans
  // were compiled from: they stay, with the rows its import's events find.
  test('Vite: serves the edited import', async () => {
    const server = await startLeft()
    await server.edit({ 'src/entry.ts': reExport('left') })
    await server.edit({ 'src/left.ts': serverFnFile('edited') })
    expect(await server.ssrTag()).toBe('MARK_edited')
    const client = await server.load('/src/entry.ts')
    expect(client['/src/left.ts']).toContain('MARK_edited')
    await server.idle()
    expect(server.stale()).toBe(0)
  })

  test('Rsbuild: serves the edited import', async () => {
    const stale = staleSince('start:rsbuild')
    const server = await startRsbuildStartDevServer({
      compileTimeout: 10_000,
      files: {
        'src/left.ts': serverFnFile('left'),
        'src/entry.ts': reExport('left'),
      },
    })
    const output = async () =>
      Object.values(await server.outputs('client')).join('\n')
    expect(await output()).toContain('MARK_left')
    await server.edit({ 'src/entry.ts': reExport('left') })
    await server.edit({ 'src/left.ts': serverFnFile('edited') })
    expect(server.errors).toEqual([])
    expect(await output()).toContain('MARK_edited')
    expect(await output()).not.toContain('MARK_left')
    expect(stale()).toBe(0)
  })
})

describe('Rsbuild dev: a module whose import moves to another file, the old one removed, in one edit', () => {
  // The importer's own event ends its plan of the old text; the compile of
  // the edit builds it once, and a later compile does not build it again.
  test('builds the importer once, and no later compile builds it', async () => {
    const stale = staleSince('start:rsbuild')
    const server = await startRsbuildStartDevServer({
      compileTimeout: 10_000,
      files: {
        'src/left.ts': serverFnFile('left'),
        'src/fns.ts': reExport('left'),
        'src/other.ts': `export const other = 0\n`,
        'src/entry.ts': `export * from './fns'\nexport { other } from './other'\n`,
      },
    })
    await server.edit({
      'src/right.ts': serverFnFile('right'),
      'src/fns.ts': reExport('right'),
      'src/left.ts': null,
    })
    expect(server.errors).toEqual([])
    expect(server.rebuilt).toContain('src/fns.ts')
    const output = Object.values(await server.outputs('client')).join('\n')
    expect(output).toContain('MARK_right')
    expect(output).not.toContain('MARK_left')

    await server.edit({ 'src/other.ts': `export const other = 1\n` })
    expect(server.rebuilt).toContain('src/other.ts')
    expect(server.rebuilt).not.toContain('src/fns.ts')
    expect(stale()).toBe(0)
  })
})
