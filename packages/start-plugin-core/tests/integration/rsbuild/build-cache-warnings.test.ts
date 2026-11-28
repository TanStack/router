/**
 * The compiler's warnings of a production Rsbuild build on its persistent
 * cache (`performance.buildCache`): a module the cache restores is not
 * compiled, and reports what its latest compile found; a warning a later
 * compile no longer finds is gone. The "does not declare Start" warning of
 * a package (node_modules policy, decision 6) is decided once per package
 * instance from the modules of the build, compiled or restored, against
 * the package's current manifest.
 *
 * Counted per compilation, from its own warnings (an Rsbuild plugin's
 * compiler hook): a build prints each warning on more than one channel.
 * Source: the round-2 re-checks of the node_modules policy implementation
 * (Fable R1, `probes/p8.test.ts`; Astra 1, `pinned/cache-owner`,
 * `cache-mixed`; Gemini 1 to 3).
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { callByIdExports } from '../../build-harness'
import { buildStart } from '../../build-start'
import { appManifest, installPackage } from '../../package-layouts'
import type { ChannelDiagnostic } from '@tanstack/compiler-test-utils/diagnostic-channel'
import type { RsbuildPlugin } from '@rsbuild/core'

const timeout = 120_000

/** Counts, per production compilation, the warnings that name `needle` (their text, file or module). */
function warningCounter(needles: ReadonlyArray<string>) {
  const counts: Array<Record<string, number>> = []
  const plugin: RsbuildPlugin = {
    name: 'test:warning-counter',
    setup(api) {
      api.onAfterCreateCompiler(({ compiler }) => {
        const all = 'compilers' in compiler ? compiler.compilers : [compiler]
        for (const one of all) {
          one.hooks.done.tap(
            { name: 'test:warning-counter', stage: 1000 },
            (stats) => {
              const row: Record<string, number> = {}
              for (const needle of needles) {
                row[needle] = stats.compilation.warnings.filter((w) => {
                  const where = w as {
                    file?: string
                    module?: { resource?: string } | null
                  }
                  return [w.message, where.file, where.module?.resource].some(
                    (t) => String(t ?? '').includes(needle),
                  )
                }).length
              }
              counts.push(row)
            },
          )
        }
      })
    },
  }
  /** The total for each needle over the compilations since the last call. */
  const take = () => {
    const total: Record<string, number> = {}
    for (const row of counts.splice(0)) {
      for (const [k, v] of Object.entries(row)) {
        total[k] = (total[k] ?? 0) + v
      }
    }
    return total
  }
  return { plugin, take }
}

/** A middleware factory whose parameter only server code reads: a compiler warning. */
const serverParam = `import { createMiddleware } from '@tanstack/react-start'
export const requireRole = (role: string) =>
  createMiddleware().server(async ({ next }) => {
    if (role === 'none') {
      throw new Error('no')
    }
    return next()
  })
`

describe('rsbuild build on the persistent cache', () => {
  // Rspack keeps a module's custom build info across a rebuild in one
  // process (a watch rebuild): a compile that finds no warning must clear the
  // module's record, or a later build that restores the module from the
  // cache reports the fixed warning.
  test(
    'a warning fixed in a watch rebuild is not reported by the next build on the cache',
    async () => {
      const counter = warningCounter(['src/role.ts'])
      // (the harness reads the steps at each build: the next build's are other edits)
      const steps = [
        {
          edits: {
            'src/role.ts': `export const requireRole = (role: string) => role\n`,
          } as Record<string, string | null>,
        },
      ]
      const first = await buildStart({
        bundler: 'rsbuild',
        files: {
          'src/role.ts': serverParam,
          'src/other.ts': `export const other = 'MARK_OTHER_1'\n`,
          'src/entry.ts': `export { requireRole } from './role'\nexport { other } from './other'\n`,
          'src/ssr-entry.ts': `export { requireRole } from './role'\nexport { other } from './other'\n${callByIdExports}`,
        },
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        rsbuildConfig: {
          plugins: [counter.plugin],
          performance: { buildCache: true },
        },
        watchEdits: steps,
      })
      // (the first build warned, the rebuild of the fix did not)
      counter.take()
      steps.splice(0, Infinity, {
        edits: { 'src/other.ts': `export const other = 'MARK_OTHER_2'\n` },
      })
      await first.rebuild({})
      expect(counter.take()['src/role.ts']).toBe(0)
    },
    timeout,
  )
})

/** `fwd-lib`, a package that does not declare Start, with two modules making server fns. */
const lib = installPackage('npm', {
  name: 'fwd-lib',
  files: {
    'a.js': `import { createServerFn } from '@tanstack/react-start'\nexport const a = createServerFn().handler(async () => 'MARK_A')\n`,
    'b.js': `import { createServerFn } from '@tanstack/react-start'\nexport const b = createServerFn().handler(async () => 'MARK_B')\n`,
  },
})
const manifestPath = `${lib.directory}/package.json`

/** The app importing `uses` of `fwd-lib`'s modules. */
const appFiles = (uses: ReadonlyArray<'a' | 'b'>) => ({
  'src/fns.ts': `${uses.map((u) => `export { ${u} } from 'fwd-lib/${u}.js'`).join('\n')}\nexport const none = 1\n`,
  'src/entry.ts': `export { none } from './fns'\n`,
  'src/ssr-entry.ts': `export { none } from './fns'\n${callByIdExports}`,
})

/** The package's "does not declare Start" warnings of the compilations since the last call. */
const packageWarnings = (counter: ReturnType<typeof warningCounter>) => {
  const t = counter.take()
  return (t[`${lib.directory}/a.js`] ?? 0) + (t[`${lib.directory}/b.js`] ?? 0)
}

describe('rsbuild build on the persistent cache, a package that does not declare Start', () => {
  const build = (
    counter: ReturnType<typeof warningCounter>,
    uses: ReadonlyArray<'a' | 'b'>,
  ) =>
    buildStart({
      bundler: 'rsbuild',
      files: { ...lib.files, ...appFiles(uses) },
      packageJson: appManifest([lib]),
      entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
      rsbuildConfig: {
        plugins: [counter.plugin],
        performance: { buildCache: true },
      },
    })

  test(
    'the app stops importing the module that warned, keeps the other: the warm build warns once',
    async () => {
      const counter = warningCounter([
        `${lib.directory}/a.js`,
        `${lib.directory}/b.js`,
      ])
      const first = await build(counter, ['a', 'b'])
      const cold = counter.take()
      expect(
        (cold[`${lib.directory}/a.js`] ?? 0) +
          (cold[`${lib.directory}/b.js`] ?? 0),
      ).toBe(1)
      // (whichever module the cold build named)
      const kept = cold[`${lib.directory}/a.js`] ? 'b' : 'a'
      await first.rebuild(appFiles([kept]))
      expect(packageWarnings(counter)).toBe(1)
    },
    timeout,
  )

  test(
    'the app adds an import of a second module of the package: the warm build warns once',
    async () => {
      const counter = warningCounter([
        `${lib.directory}/a.js`,
        `${lib.directory}/b.js`,
      ])
      const first = await build(counter, ['a'])
      expect(packageWarnings(counter)).toBe(1)
      const second = await first.rebuild(appFiles(['a', 'b']))
      expect(packageWarnings(counter)).toBe(1)
      await second.rebuild({})
      expect(packageWarnings(counter)).toBe(1)
    },
    timeout,
  )

  // A package module's compile that no longer finds a Start use (the loader
  // takes it as it is) leaves no use behind: neither the process's nor the
  // module's record, also for a module restored from the cache with that
  // record only. Rspack's watcher sees an edit of the installed package once
  // its directory is neither ignored nor managed.
  // Source: round-3 re-checks of the node_modules policy implementation
  // (Astra 2 `plain-memory`, `stable-restored`; Gemini 2b, 2c; Fable N5).
  const watchedPackages = {
    tools: {
      rspack: (config: { watchOptions?: object; snapshot?: object }) => {
        config.watchOptions = {
          ...config.watchOptions,
          ignored: /[\\/](?:\.git|node_modules[\\/](?!fwd-lib[\\/]))/,
        }
        config.snapshot = { ...config.snapshot, managedPaths: [] }
      },
    },
  }
  const plainA = `export const a = 'MARK_A_PLAIN'\n`
  const warnsOf = (diagnostics: Array<ChannelDiagnostic>, root: string) =>
    findDiagnostics(problems(diagnostics), {
      severity: 'warning',
      file: `${lib.directory}/a.js`,
      root,
    }).length

  test.each([false, true])(
    'build --watch (persistent cache: %s): the module stops using Start, the rebuild does not warn',
    async (buildCache) => {
      const watched = await buildStart({
        bundler: 'rsbuild',
        files: { ...lib.files, ...appFiles(['a']) },
        packageJson: appManifest([lib]),
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        rsbuildConfig: { ...watchedPackages, performance: { buildCache } },
        watchEdits: [{ edits: { [`${lib.directory}/a.js`]: plainA } }],
      })
      expect(warnsOf(watched.firstBuild, watched.root)).toBeGreaterThan(0)
      expect(warnsOf(watched.diagnostics, watched.root)).toBe(0)
    },
    timeout,
  )

  test(
    'build --watch restored from the cache: the module stops using Start, neither the rebuild nor the next build warns',
    async () => {
      const steps = [
        { edits: { 'src/entry.ts': `export { none } from './fns'\n// 1\n` } },
      ] as Array<{ edits: Record<string, string | null> }>
      const options = {
        bundler: 'rsbuild' as const,
        files: { ...lib.files, ...appFiles(['a']) },
        packageJson: appManifest([lib]),
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        rsbuildConfig: {
          ...watchedPackages,
          performance: { buildCache: true },
        },
        watchEdits: steps,
      }
      const first = await buildStart(options)
      expect(warnsOf(first.firstBuild, first.root)).toBeGreaterThan(0)
      // (a new process's watch build, restored from the cache, then the edit)
      steps.splice(0, Infinity, {
        edits: { [`${lib.directory}/a.js`]: plainA },
      })
      const restored = await first.rebuild({})
      expect(warnsOf(restored.firstBuild, restored.root)).toBeGreaterThan(0)
      expect(warnsOf(restored.diagnostics, restored.root)).toBe(0)
      steps.splice(0, Infinity, {
        edits: { 'src/entry.ts': `export { none } from './fns'\n// 2\n` },
      })
      const next = await restored.rebuild({})
      expect(warnsOf(next.firstBuild, next.root)).toBe(0)
      expect(warnsOf(next.diagnostics, next.root)).toBe(0)
    },
    timeout,
  )

  test(
    'the package names Start in peerDependenciesMeta, same version: the warm build does not warn',
    async () => {
      const counter = warningCounter([
        `${lib.directory}/a.js`,
        `${lib.directory}/b.js`,
      ])
      const first = await build(counter, ['a'])
      expect(packageWarnings(counter)).toBe(1)
      const manifest = JSON.parse(lib.files[manifestPath]!) as Record<
        string,
        unknown
      >
      const second = await first.rebuild({
        [manifestPath]: JSON.stringify({
          ...manifest,
          peerDependenciesMeta: { '@tanstack/react-start': { optional: true } },
        }),
      })
      expect(packageWarnings(counter)).toBe(0)
      await second.rebuild({})
      expect(packageWarnings(counter)).toBe(0)
    },
    timeout,
  )
})

/** `exposed-lib`, a package that does not declare Start, whose module makes a client-only fn. */
const exposedLib = installPackage('npm', {
  name: 'exposed-lib',
  files: {
    'b.js': `import { createClientOnlyFn } from '@tanstack/react-start'\nexport const b = createClientOnlyFn(() => 'MARK_EXPOSED')\n`,
  },
})

// A module only a Module Federation container exposes (Rspack's
// `ContainerPlugin`: the container entry is a module of no file) is in the
// build: a consumer loads it. Its warnings, and its package's, are reported
// as for a module an entry imports, by a cold build and by a warm one.
// Source: round-4 confirmation of the node_modules policy implementation
// (Astra, `remote-esm`).
describe('rsbuild build on the persistent cache, a module only a federation container exposes', () => {
  test(
    "its package's warning and its own, cold and warm",
    async () => {
      const counter = warningCounter([
        `${exposedLib.directory}/b.js`,
        'src/role.ts',
      ])
      const first = await buildStart({
        bundler: 'rsbuild',
        files: {
          ...exposedLib.files,
          'src/role.ts': serverParam,
          'src/widget.ts': `export { b } from 'exposed-lib/b.js'\nexport { requireRole } from './role'\n`,
          'src/entry.ts': `export const none = 1\n`,
          'src/ssr-entry.ts': `export const none = 1\n${callByIdExports}`,
        },
        packageJson: appManifest([exposedLib]),
        entry: { client: 'src/entry.ts', ssr: 'src/ssr-entry.ts' },
        rsbuildConfig: {
          plugins: [counter.plugin],
          performance: { buildCache: true },
          environments: {
            client: {
              tools: {
                rspack: (config, { rspack }) => {
                  config.plugins.push(
                    new rspack.container.ContainerPlugin({
                      name: 'remote',
                      filename: 'remote.js',
                      exposes: { './widget': './src/widget.ts' },
                    }),
                  )
                },
              },
            },
          },
        },
      })
      const cold = counter.take()
      expect(cold[`${exposedLib.directory}/b.js`]).toBe(1)
      expect(cold['src/role.ts']).toBeGreaterThan(0)
      await first.rebuild({})
      const warm = counter.take()
      expect(warm[`${exposedLib.directory}/b.js`]).toBe(1)
      expect(warm['src/role.ts']).toBeGreaterThan(0)
    },
    timeout,
  )
})
