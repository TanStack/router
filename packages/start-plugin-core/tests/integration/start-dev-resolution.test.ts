/**
 * What a dev server's compiles resolve, after edits that change no module
 * the compiler compiled: a `package.json` edit or removal changes what a
 * specifier resolves to; the input texts the compiler reads differ between
 * environments; a registry change with a resolver that throws. On running
 * Vite and Rsbuild dev servers (source: external review 2, claims 5 to 7).
 */
import { existsSync } from 'node:fs'
import { utimes, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, onTestFinished, test } from 'vitest'
import {
  expectNoDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { callServerFn, startDevServer, startRequestFiles } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'
import type { RsbuildPlugin } from '@rsbuild/core'

const plain = `export const base = { handler: (fn: () => unknown) => fn }\n`
const builder = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
const importer = `import { base } from '#lib'
export const fn = base.handler(async () => 'MARK_HANDLER')
`
const packageJson = (target: string) =>
  JSON.stringify({ private: true, type: 'module', imports: { '#lib': target } })

const linkedExports = (target: string) =>
  JSON.stringify({ name: 'acme-lib', type: 'module', exports: { '.': target } })

describe('a package.json edit changes what a specifier resolves to', () => {
  const app = (first: string) => ({
    'package.json': packageJson(first),
    'src/lib/plain.ts': plain,
    'src/lib/builder.ts': builder,
    'src/a.ts': importer,
  })
  const toBuilder = packageJson('./src/lib/builder.ts')
  const toPlain = packageJson('./src/lib/plain.ts')

  // Vite follows the edit at once (the served module imports the new target);
  // so does the compile of an importer. Main does too.
  test('Vite `imports`, plain to builder: the next compile of an importer strips the handler', async () => {
    const server = await startDevServer({
      files: app('./src/lib/plain.ts'),
    })
    expect(await server.transform('/src/a.ts')).toContain('MARK_HANDLER')
    await server.edit({ 'package.json': toBuilder })
    await server.edit({ 'src/a.ts': `${importer}// edited\n` })
    expect(await server.transform('/src/a.ts')).not.toContain('MARK_HANDLER')
  })

  test('Vite `imports`, builder to plain: the next compile of an importer keeps the handler', async () => {
    const server = await startDevServer({
      files: app('./src/lib/builder.ts'),
    })
    expect(await server.transform('/src/a.ts')).not.toContain('MARK_HANDLER')
    await server.edit({ 'package.json': toPlain })
    await server.edit({ 'src/a.ts': `${importer}// edited\n` })
    expect(await server.transform('/src/a.ts')).toContain('MARK_HANDLER')
  })

  const rsbuildApp = (files: Record<string, string>) =>
    startRsbuildStartDevServer({
      compileTimeout: 20_000,
      files: {
        ...files,
        'src/entry.ts': `import { fn } from './a'\n;(globalThis as any).fn = fn\n`,
      },
    })
  const clientOutput = async (server: {
    outputs: (env: string) => Promise<Record<string, string>>
  }) => Object.values(await server.outputs('client')).join('\n')

  // Rspack bundles the new target as soon as the file changes.
  test('Rsbuild `imports`, plain to builder: the handler leaves the client', async () => {
    const server = await rsbuildApp(app('./src/lib/plain.ts'))
    expect(await clientOutput(server)).toContain('MARK_HANDLER')
    await server.edit({ 'package.json': toBuilder })
    expect(await clientOutput(server)).not.toContain('MARK_HANDLER')
  })

  test('Rsbuild `imports`, builder to plain: the handler comes back', async () => {
    const server = await rsbuildApp(app('./src/lib/builder.ts'))
    expect(await clientOutput(server)).not.toContain('MARK_HANDLER')
    await server.edit({ 'package.json': toPlain })
    expect(await clientOutput(server)).toContain('MARK_HANDLER')
  })

  // A linked package's `exports`, as a workspace package is.
  const linked = (target: string) => ({
    'packages/acme/package.json': linkedExports(target),
    'packages/acme/plain.ts': plain,
    'packages/acme/builder.ts': builder,
    'src/a.ts': `import { base } from 'acme-lib'
export const fn = base.handler(async () => 'MARK_HANDLER')
`,
  })

  const editLinkedExports = async (first: string, then: string) => {
    const server = await startRsbuildStartDevServer({
      compileTimeout: 20_000,
      symlinks: { 'node_modules/acme-lib': 'packages/acme' },
      files: {
        ...linked(first),
        'src/entry.ts': `import { fn } from './a'\n;(globalThis as any).fn = fn\n`,
      },
    })
    const before = await clientOutput(server)
    // (Rspack may not rebuild for this file alone)
    await server.write({ 'packages/acme/package.json': linkedExports(then) })
    // the importer's edit comes later, in a compilation of its own
    await new Promise((resolve) => setTimeout(resolve, 1_500))
    await server.edit({
      'src/a.ts': `${linked(first)['src/a.ts']}// edited\n`,
    })
    return { before, after: await clientOutput(server) }
  }

  test('Rsbuild `exports` of a linked package, builder to plain: the handler comes back', async () => {
    const { before, after } = await editLinkedExports(
      './builder.ts',
      './plain.ts',
    )
    expect(before).not.toContain('MARK_HANDLER')
    expect(after).toContain('MARK_HANDLER')
  })

  // Rspack bundles the new target, but reports no event for that package.json
  // when the old target imports nothing (so nothing tells the compiler its
  // resolutions moved). The importer's own save is a file event, and every
  // file event moves the file set: its compile asks `acme-lib` again.
  test('Rsbuild `exports` of a linked package, plain to builder: the handler leaves the client', async () => {
    const { before, after } = await editLinkedExports(
      './plain.ts',
      './builder.ts',
    )
    expect(before).toContain('MARK_HANDLER')
    expect(after).not.toContain('MARK_HANDLER')
  })
})

describe('Vite dev: a nested package.json removed', () => {
  // `src/section/package.json` maps `#impl` to a plain object; the app's
  // own maps it to a server fn builder. Removing the nested one has
  // `#impl` find the builder at once, with no change to the caller or
  // either target: the caller is built again at the removal, in both
  // environments, and its server fn answers. Source: Astra review round 4
  // (B2: both environments kept the old answer until a restart; main too).
  test('the importer becomes a server fn at the removal, in the client and in SSR', async () => {
    const server = await startDevServer({
      files: {
        ...startRequestFiles,
        'package.json': packageJson('./src/lib/builder.ts'),
        'src/lib/builder.ts': builder,
        'src/section/package.json': JSON.stringify({
          private: true,
          type: 'module',
          imports: { '#lib': './plain.ts' },
        }),
        'src/section/plain.ts': plain,
        'src/section/a.ts': importer,
      },
    })
    expect(await server.transform('/src/section/a.ts')).toContain(
      'MARK_HANDLER',
    )
    const before = await server.import('/src/section/a.ts')
    expect(await before.fn()).toBe('MARK_HANDLER')
    await server.edit({ 'src/section/package.json': null })
    expect(await server.transform('/src/section/a.ts')).not.toContain(
      'MARK_HANDLER',
    )
    const { fn } = await server.import('/src/section/a.ts')
    expect(await callServerFn(server, fn)).toBe('MARK_HANDLER')
  })
})

describe('file-event bursts still reach the modules that read the files', () => {
  /** `./b` first finds `b/index.ts`, a plain object; `b.ts`, a builder, takes it when it appears. */
  const files = {
    'src/b/index.ts': plain,
    'src/a.ts': `import { base } from './b'
export const fn = base.handler(async () => 'MARK_HANDLER')
`,
    'src/entry.ts': `import { fn } from './a'\n;(globalThis as any).fn = fn\n`,
  }
  const others = (content: string | null) =>
    Object.fromEntries(
      Array.from({ length: 300 }, (_, i) => [`src/other/o${i}.ts`, content]),
    )

  test('Vite: a burst of adds, then of removals', async () => {
    const server = await startDevServer({ files })
    expect(await server.transform('/src/a.ts')).toContain('MARK_HANDLER')
    await server.edit({
      ...others(`export const o = 1\n`),
      'src/b.ts': builder,
    })
    expect(await server.transform('/src/a.ts')).not.toContain('MARK_HANDLER')
    await server.edit({ ...others(null), 'src/b.ts': null })
    // (`./b` finds `b/index.ts` again: the importer compiles at once)
    expect(await server.transform('/src/a.ts')).toContain('MARK_HANDLER')
  })

  test('Rsbuild: a burst of adds, then of removals', async () => {
    const server = await startRsbuildStartDevServer({
      compileTimeout: 20_000,
      files,
    })
    const output = async () =>
      Object.values(await server.outputs('client')).join('\n')
    expect(await output()).toContain('MARK_HANDLER')
    await server.edit({
      ...others(`export const o = 1\n`),
      'src/b.ts': builder,
    })
    expect(await output()).not.toContain('MARK_HANDLER')
    await server.edit({ ...others(null), 'src/b.ts': null })
    expect(await output()).toContain('MARK_HANDLER')
  })
})

describe('a file turned into a folder', () => {
  // `./b` finds `b.ts`, a builder, while `b/index.ts`, a plain object, is
  // there too; deleting `b.ts` (a file turned into a folder) has `./b` find
  // `b/index.ts`: the importer compiles against it at once, without waiting
  // for `b.ts` to come back. Source: Astra review H3 (the Vite client kept
  // the old compile and its import of the deleted file).
  const files = {
    'src/b.ts': builder,
    'src/b/index.ts': plain,
    'src/a.ts': `import { base } from './b'
export const fn = base.handler(async () => 'MARK_HANDLER')
`,
    'src/entry.ts': `import { fn } from './a'\n;(globalThis as any).fn = fn\n`,
  }

  test('Vite: the importer compiles against the folder once the file is deleted', async () => {
    const server = await startDevServer({ files })
    for (const environment of ['client', 'ssr']) {
      expect(await server.transform('/src/a.ts', environment)).not.toContain(
        'MARK_HANDLER',
      )
    }
    await server.edit({ 'src/b.ts': null })
    for (const environment of ['client', 'ssr']) {
      const code = await server.transform('/src/a.ts', environment)
      expect(code).toContain('MARK_HANDLER')
      expect(code).not.toMatch(/\/src\/b\.ts/)
    }
  })

  // A resolver that prefers a local file and falls back to an external has
  // the importer compile against the external once the file is deleted.
  // Source: Astra review round 2 (B4: the importer was held for the file to
  // come back).
  test('Vite: the importer compiles against an external fallback once the file is deleted', async () => {
    const server = await startDevServer({
      plugins: [
        {
          name: 'test:prefer-local',
          enforce: 'pre',
          resolveId(source) {
            if (source !== './kit') {
              return undefined
            }
            const local = path.join(this.environment.config.root, 'src/kit.ts')
            return existsSync(local)
              ? local
              : { id: 'acme-kit', external: true }
          },
        },
      ],
      files: {
        'src/kit.ts': builder,
        'src/a.ts': `import { base } from './kit'
export const fn = base.handler(async () => 'MARK_HANDLER')
`,
        'src/entry.ts': files['src/entry.ts'],
      },
    })
    for (const environment of ['client', 'ssr']) {
      expect(await server.transform('/src/a.ts', environment)).not.toContain(
        'MARK_HANDLER',
      )
    }
    await server.edit({ 'src/kit.ts': null })
    for (const environment of ['client', 'ssr']) {
      expect(await server.transform('/src/a.ts', environment)).toContain(
        'MARK_HANDLER',
      )
    }
  })

  test('Rsbuild: the importer compiles against the folder once the file is deleted', async () => {
    const server = await startRsbuildStartDevServer({
      compileTimeout: 20_000,
      files,
    })
    const output = async () =>
      Object.values(await server.outputs('client')).join('\n')
    expect(await output()).not.toContain('MARK_HANDLER')
    await server.edit({ 'src/b.ts': null })
    expect(await output()).toContain('MARK_HANDLER')
  })
})

describe('Vite dev: a removed import nothing replaces yet', () => {
  // A module whose compile read a file that is removed, while no other file
  // satisfies its import, is built again at the removal, as after any change
  // of what it read (Rsbuild, webpack and a watch build do the same): its
  // compile records the failed import, and the file's return or a fallback
  // created later (in another directory, through an alias) builds it again
  // once a request compiled it (the page fetches it after the removal's
  // update). A file created meanwhile that satisfies nothing sends nothing
  // (it sent a client full reload while modules waited for the file; main
  // sends nothing there either). Once a module whose output keeps the
  // import was served while the import is missing, Vite itself retries it
  // at every file creation, as on main. Source: Astra's second stale-set
  // review.
  const marked = `import '@tanstack/react-start/server-only'
export const secret = () => 'MARK_PRIVATE'
`
  const allowed = (mark: string) => `export const secret = () => '${mark}'\n`
  /** What the server sent the client for an edit, but for custom events. */
  const clientSent = async (
    server: Awaited<ReturnType<typeof startDevServer>>,
    files: Record<string, string | null>,
  ) =>
    (await server.edit(files))
      .filter((m) => m.environment === 'client' && m.type !== 'custom')
      .map((m) => `${m.type} ${m.paths.join(' ')}`)
  const unrelated = { 'src/other.ts': `export const other = 1\n` }
  /** The page fetching the module again after its update (its load may fail while the import is missing). */
  const refetch = async (
    server: Awaited<ReturnType<typeof startDevServer>>,
  ) => {
    await server.load('/src/page.ts').catch(() => {})
    await server.idle()
  }

  test('an import only a server fn handler reads: the removal updates the module, a file created meanwhile sends nothing, its return updates the module', async () => {
    const server = await startDevServer({
      files: {
        'src/left.ts': `export const tag = 'MARK_left'\n`,
        'src/page.ts': `import { createServerFn } from '@tanstack/react-start'
import { tag } from './left'
export const fn = createServerFn().handler(async () => tag)
`,
      },
    })
    await server.load('/src/page.ts')
    await server.idle()
    expect(await clientSent(server, { 'src/left.ts': null })).not.toEqual([])
    await refetch(server)
    expect(await clientSent(server, unrelated)).toEqual([])
    expect(
      await clientSent(server, {
        'src/left.ts': `export const tag = 'MARK_back'\n`,
      }),
    ).not.toEqual([])
  })

  /**
   * `src/page.ts` reads `secret` through `spec`; `src/lib.ts` is
   * server-only, so the client is served a mock of it. `resolveId`: an
   * app resolver for `spec`; `files`: more files of the app.
   */
  const startMocked = (
    spec: string,
    resolveId?: (root: string, specifier: string) => string | null | undefined,
    files: Record<string, string> = {},
  ) =>
    startDevServer({
      start: { importProtection: { behavior: 'mock' } },
      plugins: resolveId
        ? [
            {
              name: 'test:app-resolver',
              enforce: 'pre',
              resolveId(specifier: string) {
                return resolveId(this.environment.config.root, specifier)
              },
            },
          ]
        : [],
      files: {
        'src/lib.ts': marked,
        'src/page.ts': `import { secret } from '${spec}'
export function read() { return secret() }
`,
        ...files,
      },
    })
  const clientCode = async (
    server: Awaited<ReturnType<typeof startDevServer>>,
  ) => Object.values(await server.load('/src/page.ts')).join('\n')

  test.each([
    ['the file back', './lib', undefined, 'src/lib.ts'],
    [
      'a fallback in another directory created',
      'app-choice',
      (root: string, specifier: string) => {
        if (specifier !== 'app-choice') {
          return undefined
        }
        const lib = path.join(root, 'src/lib.ts')
        const alt = path.join(root, 'elsewhere/public.ts')
        return existsSync(lib) ? lib : existsSync(alt) ? alt : null
      },
      'elsewhere/public.ts',
    ],
    [
      // (a resolver that caches its answer until the file is back)
      'the file back, with a resolver that still names the removed file',
      'app-choice',
      (root: string, specifier: string) =>
        specifier === 'app-choice' ? path.join(root, 'src/lib.ts') : undefined,
      'src/lib.ts',
    ],
  ] as const)(
    'a mocked import: a file created meanwhile sends nothing; %s updates the module, which serves it',
    async (_, spec, resolveId, recovery) => {
      const server = await startMocked(spec, resolveId)
      expect(await clientCode(server)).not.toContain('MARK_PRIVATE')
      await server.idle()
      await server.edit({ 'src/lib.ts': null })
      expect(await clientSent(server, unrelated)).toEqual([])
      await refetch(server)
      expect(
        await clientSent(server, { [recovery]: allowed('MARK_PUBLIC') }),
      ).not.toEqual([])
      expect(await clientCode(server)).toContain('MARK_PUBLIC')
    },
  )

  // Two specifiers found the removed file; only one finds another file at
  // once. The module is built against both answers at the removal, and
  // again once the other one finds a file.
  test('two specifiers of the removed file: a file created meanwhile sends nothing; the last one finding a file updates the module, which serves both', async () => {
    const server = await startMocked(
      'shared-one',
      (root, specifier) => {
        if (specifier !== 'shared-one' && specifier !== 'shared-two') {
          return undefined
        }
        const lib = path.join(root, 'src/lib.ts')
        if (existsSync(lib)) {
          return lib
        }
        const next = path.join(
          root,
          specifier === 'shared-one' ? 'src/one.ts' : 'src/two.ts',
        )
        return existsSync(next) ? next : null
      },
      {
        'src/one.ts': allowed('MARK_ONE'),
        'src/page.ts': `import { secret as a } from 'shared-one'
import { secret as b } from 'shared-two'
export function read() { return a() + b() }
`,
      },
    )
    expect(await clientCode(server)).not.toContain('MARK_PRIVATE')
    await server.idle()
    await server.edit({ 'src/lib.ts': null })
    expect(await clientSent(server, unrelated)).toEqual([])
    await refetch(server)
    expect(
      await clientSent(server, { 'src/two.ts': allowed('MARK_TWO') }),
    ).not.toEqual([])
    const code = await clientCode(server)
    expect(code).toContain('MARK_ONE')
    expect(code).toContain('MARK_TWO')
  })
})

describe('Rsbuild dev: a removed import nothing replaces yet', () => {
  // Rsbuild builds the importer at the removal (its import fails there, as
  // Rspack's own rebuild reports it), and again once its import finds a
  // module: the importer is compiled against what it finds.
  const importerFiles = (specifier: string) => ({
    'src/a.ts': `import { base } from '${specifier}'
export const fn = base.handler(async () => 'MARK_HANDLER')
`,
    'src/entry.ts': `import { fn } from './a'\n;(globalThis as any).fn = fn\n`,
  })

  test('the file back as a plain object: the handler comes back', async () => {
    const server = await startRsbuildStartDevServer({
      compileTimeout: 20_000,
      files: { 'src/lib.ts': builder, ...importerFiles('./lib') },
    })
    const output = async () =>
      Object.values(await server.outputs('client')).join('\n')
    expect(await output()).not.toContain('MARK_HANDLER')
    await server.edit({ 'src/lib.ts': null })
    await server.edit({ 'src/lib.ts': plain })
    expect(await output()).toContain('MARK_HANDLER')
  })

  test('a fallback in another directory created: the handler comes back', async () => {
    const aliasFallback: RsbuildPlugin = {
      name: 'test:alias-fallback',
      setup(api) {
        // (an alias with targets tried in order)
        api.modifyRspackConfig((config) => {
          const root = api.context.rootPath
          config.resolve.alias = {
            ...(config.resolve.alias as Record<string, string>),
            'app-choice': [
              path.join(root, 'src/lib.ts'),
              path.join(root, 'elsewhere/lib.ts'),
            ],
          }
        })
      },
    }
    const server = await startRsbuildStartDevServer({
      compileTimeout: 20_000,
      config: { plugins: [aliasFallback] },
      files: { 'src/lib.ts': builder, ...importerFiles('app-choice') },
    })
    const output = async () =>
      Object.values(await server.outputs('client')).join('\n')
    expect(await output()).not.toContain('MARK_HANDLER')
    await server.edit({ 'src/lib.ts': null })
    await server.edit({ 'elsewhere/lib.ts': plain })
    expect(await output()).toContain('MARK_HANDLER')
  })
})

describe('a route that stops being the router constructor while the generator fails', () => {
  const route = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/a')({ component: () => null })
`
  const foreign = `import { createServerFn } from '@tanstack/react-start'
export const Route = () => createServerFn()
`
  const consumer = `import { Route } from './routes/a'
export const via = (Route as any)().handler(async () => 'MARK_VIA')
`
  test('Vite: an importer of its Route is compiled from what the file now holds', async () => {
    const server = await startDevServer({
      files: { 'src/routes/a.tsx': route, 'src/consumer.ts': consumer },
    })
    expect(await server.transform('/src/consumer.ts')).toContain('MARK_VIA')
    await server.write({ 'src/routes/broken.tsx': 'export const Route = (' })
    await server.settle()
    await server.write({ 'src/routes/a.tsx': foreign })
    await server.settle()
    expect(await server.transform('/src/consumer.ts')).not.toContain('MARK_VIA')
  })
})

describe('differing input texts in dev', () => {
  const route = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>MARK_V1</p> })
`
  const app = {
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
    'src/routes/index.tsx': route,
  }
  /**
   * Dates the route file a minute back, before its first compile: long
   * enough before it that the compile can't have read a text older than the
   * file (the dev read window). The dev server stops watching the file
   * first: the time change is no file event of the app (one that reached the
   * compiler after the first compile would evict its plan).
   */
  const saveLongAgo = async (server: {
    root: string
    vite: { watcher: { unwatch: (file: string) => unknown } }
  }) => {
    const file = path.join(server.root, 'src/routes/index.tsx')
    await server.vite.watcher.unwatch(file)
    const old = new Date(Date.now() - 60_000)
    await utimes(file, old, old)
  }
  /** What the server reported about the route file. */
  const aboutRoute = (server: { root: string }) =>
    ({
      severity: 'warning',
      file: 'src/routes/index.tsx',
      root: server.root,
    }) as const

  test('a plugin that only the route module goes through is reported', async () => {
    const server = await startDevServer({
      files: app,
      plugins: [
        {
          // (a `load` hook runs before the compiler whatever the plugin order)
          name: 'anchored-load-plugin',
          load(id: string) {
            return /routes\/index\.tsx$/.test(id)
              ? route.replace('MARK_V1', 'MARK_REWRITTEN')
              : null
          },
        },
      ],
    })
    await saveLongAgo(server)
    await server.load('/src/routes/index.tsx')
    expect(
      findDiagnostics(server.diagnostics, aboutRoute(server)).length,
    ).toBeGreaterThan(0)
  })

  // The window is what tells a save from a plugin: no file event reaches the
  // compiler here (it would evict the plan and end the question), so the
  // chunk's compile sees the route module's plan with another text.
  test.each([
    ['just saved: not reported', false, 0],
    ['saved long before the route module was read: reported', true, 1],
  ])(
    'a chunk compiled from another text than its route module, the file %s',
    async (_, backdated, expected) => {
      const server = await startDevServer({ files: app })
      await saveLongAgo(server)
      const file = path.join(server.root, 'src/routes/index.tsx')
      await server.transform('/src/routes/index.tsx')
      await writeFile(file, route.replace('MARK_V1', 'MARK_V2'))
      if (backdated) {
        const old = new Date(Date.now() - 60_000)
        await utimes(file, old, old)
      }
      await server.load('/src/routes/index.tsx')
      if (expected === 0) {
        expectNoDiagnostic(server.diagnostics, aboutRoute(server))
      } else {
        expect(
          findDiagnostics(server.diagnostics, aboutRoute(server)),
        ).toHaveLength(expected)
      }
    },
  )
})

describe('a registry change with a resolver that throws', () => {
  // The invalidation asks the resolver (after a file event emptied its memo).
  // A rejection there would be unhandled and end a `vite dev` process. A
  // resolver that throws couldn't resolve the specifier (DECISIONS,
  // "Resolver errors in import protection"): the module is compiled again,
  // and the bundler decides on the import; here only the handler reads it,
  // so the client drops it and the compile succeeds (on main it failed).
  test('Vite: the dev server survives it, and the next compile leaves the import to the bundler', async () => {
    // the test runner fails a run on any unhandled rejection: only this
    // test's listener hears them, as the process would
    const runner = process.listeners('unhandledRejection')
    const rejections: Array<unknown> = []
    process.removeAllListeners('unhandledRejection')
    process.on('unhandledRejection', (reason) => {
      rejections.push(reason)
    })
    onTestFinished(() => {
      process.removeAllListeners('unhandledRejection')
      for (const listener of runner) {
        process.on('unhandledRejection', listener)
      }
    })
    let failing = false
    /** Resolves once the resolver threw. */
    let threw!: () => void
    const thrown = new Promise<void>((resolve) => {
      threw = resolve
    })
    const server = await startDevServer({
      plugins: [
        {
          name: 'user-resolver',
          enforce: 'pre',
          resolveId(source: string) {
            if (failing && source === './routes/a') {
              threw()
              throw new Error('MARK_RESOLVER_FAILED')
            }
            return null
          },
        },
      ],
      files: {
        'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
        'src/routes/a.tsx': `export const value = 1\n`,
        'src/helper.ts': `import { createServerFn } from '@tanstack/react-start'
import { value } from './routes/a'
export const fn = createServerFn().handler(async () => value)
`,
      },
    })
    await server.transform('/src/helper.ts')
    // the file set moves: the resolver's answers are asked for again
    await server.edit({ 'src/other.ts': `export const other = 1\n` })
    failing = true
    // a file with no `Route` export becomes a route: its registry entry changes
    await server.edit({
      'src/routes/a.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const value = 1
export const Route = createFileRoute('/a')({})
`,
    })
    // the invalidation asked the resolver, and what it started ended (a
    // rejection nothing handles is reported once the turn that dropped it
    // ends)
    await thrown
    await server.idle()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(rejections).toEqual([])
    await expect(server.transform('/src/helper.ts')).resolves.toBeTypeOf(
      'string',
    )
    failing = false
    await expect(server.transform('/src/helper.ts')).resolves.toBeTypeOf(
      'string',
    )
  })
})
