/**
 * Fact-check of external review 2 (claims 6 and 7), on running dev servers.
 * Each pin asserts the correct behaviour and fails on the current compiler.
 */
import { describe, expect, onTestFinished, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { startDevServer } from '../dev-server'
import { startRsbuildStartDevServer } from '../rsbuild-dev-server'

const timeout = 60_000

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

describe('claim 6: a package.json edit changes what a specifier resolves to', () => {
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
  test(
    'Vite `imports`, plain to builder: the next compile of an importer strips the handler',
    async () => {
      const server = await startDevServer({
        files: app('./src/lib/plain.ts'),
      })
      expect(await server.transform('/src/a.ts')).toContain('MARK_HANDLER')
      await server.edit({ 'package.json': toBuilder })
      await server.edit({ 'src/a.ts': `${importer}// edited\n` })
      expect(await server.transform('/src/a.ts')).not.toContain('MARK_HANDLER')
    },
    timeout,
  )

  test(
    'Vite `imports`, builder to plain: the next compile of an importer keeps the handler',
    async () => {
      const server = await startDevServer({
        files: app('./src/lib/builder.ts'),
      })
      expect(await server.transform('/src/a.ts')).not.toContain('MARK_HANDLER')
      await server.edit({ 'package.json': toPlain })
      await server.edit({ 'src/a.ts': `${importer}// edited\n` })
      expect(await server.transform('/src/a.ts')).toContain('MARK_HANDLER')
    },
    timeout,
  )

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
  test(
    'Rsbuild `imports`, plain to builder: the handler leaves the client',
    async () => {
      const server = await rsbuildApp(app('./src/lib/plain.ts'))
      expect(await clientOutput(server)).toContain('MARK_HANDLER')
      await server.edit({ 'package.json': toBuilder })
      expect(await clientOutput(server)).not.toContain('MARK_HANDLER')
    },
    timeout,
  )

  test(
    'Rsbuild `imports`, builder to plain: the handler comes back',
    async () => {
      const server = await rsbuildApp(app('./src/lib/builder.ts'))
      expect(await clientOutput(server)).not.toContain('MARK_HANDLER')
      await server.edit({ 'package.json': toPlain })
      expect(await clientOutput(server)).toContain('MARK_HANDLER')
    },
    timeout,
  )

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

  test(
    'Rsbuild `exports` of a linked package, builder to plain: the handler comes back',
    async () => {
      const { before, after } = await editLinkedExports(
        './builder.ts',
        './plain.ts',
      )
      expect(before).not.toContain('MARK_HANDLER')
      expect(after).toContain('MARK_HANDLER')
    },
    timeout,
  )

  // Rspack bundles the new target, but reports no event for that package.json
  // when the old target imports nothing (so nothing tells the compiler its
  // resolutions moved), until a file appears or disappears. Main follows.
  test.fails(
    'Rsbuild `exports` of a linked package, plain to builder: the handler leaves the client',
    async () => {
      const { before, after } = await editLinkedExports(
        './plain.ts',
        './builder.ts',
      )
      expect(before).toContain('MARK_HANDLER')
      expect(after).not.toContain('MARK_HANDLER')
    },
    timeout,
  )
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

  test(
    'Vite: a burst of adds, then of removals',
    async () => {
      const server = await startDevServer({ files })
      expect(await server.transform('/src/a.ts')).toContain('MARK_HANDLER')
      await server.edit({
        ...others(`export const o = 1\n`),
        'src/b.ts': builder,
      })
      expect(await server.transform('/src/a.ts')).not.toContain('MARK_HANDLER')
      await server.edit({ ...others(null), 'src/b.ts': null })
      // (dependents of a removed file wait for a file to appear: the file may be
      // coming back, and a module failing to transform meanwhile loses its HMR)
      await server.edit({ 'src/other/back.ts': `export const o = 1\n` })
      expect(await server.transform('/src/a.ts')).toContain('MARK_HANDLER')
    },
    timeout,
  )

  test(
    'Rsbuild: a burst of adds, then of removals',
    async () => {
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
    },
    timeout,
  )
})

describe('claim 5: differing input texts in dev', () => {
  const route = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>MARK_V1</p> })
`
  const app = {
    'src/routes/__root.tsx': `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})
`,
    'src/routes/index.tsx': route,
  }
  /** Long enough that a compile can't have read a text older than the file. */
  const readWindow = () => new Promise((resolve) => setTimeout(resolve, 2_100))
  const warnings = (diagnostics: unknown) =>
    findDiagnostics(diagnostics, { severity: 'warning' }).filter(({ text }) =>
      text.includes('src/routes/index.tsx'),
    )

  test(
    'a plugin that only the route module goes through is reported',
    async () => {
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
      await readWindow()
      await server.load('/src/routes/index.tsx')
      expect(warnings(server.diagnostics).length).toBeGreaterThan(0)
    },
    timeout,
  )

  test(
    'an edit between a route module and its chunk is not reported',
    async () => {
      const server = await startDevServer({ files: app })
      await readWindow()
      await server.transform('/src/routes/index.tsx')
      await server.write({
        'src/routes/index.tsx': route.replace('MARK_V1', 'MARK_V2'),
      })
      await server.load('/src/routes/index.tsx')
      await server.settle()
      await server.load('/src/routes/index.tsx')
      expect(warnings(server.diagnostics)).toEqual([])
    },
    timeout,
  )
})

describe('claim 7: a registry change with a resolver that throws', () => {
  // The invalidation asks the resolver (after a file event emptied its memo).
  // A rejection there would be unhandled and end a `vite dev` process; the
  // module counts as stale instead, and its next request reports the error,
  // as on main.
  test(
    'Vite: the dev server survives it, and the next compile reports the error',
    async () => {
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
      const server = await startDevServer({
        plugins: [
          {
            name: 'user-resolver',
            enforce: 'pre',
            resolveId(source: string) {
              if (failing && source === './routes/a') {
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
      await new Promise((resolve) => setTimeout(resolve, 2_000))
      expect(rejections).toEqual([])
      await expect(server.transform('/src/helper.ts')).rejects.toThrow(
        'MARK_RESOLVER_FAILED',
      )
      failing = false
      await expect(server.transform('/src/helper.ts')).resolves.toBeTypeOf(
        'string',
      )
    },
    timeout,
  )
})
