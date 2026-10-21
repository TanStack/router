/**
 * Control tests of the real-build harness (build-harness.ts): for each
 * bundler, the harness reports eager and lazy placement correctly, `run()`
 * executes SSR output in Node and client output in a real browser, and
 * side-effect hints reach the bundler.
 */
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import {
  bundleApp as bundleAppIn,
  bundlers,
  createApp,
  describeBuild,
  originalFrameOf,
} from '../../src/build-harness'
import { findDiagnostics } from '../../src/diagnostics'
import { unboundNames } from '../../src/validate-module'
import type {
  BundleOptions,
  BundlerPlugins,
  DanglingNameError,
  Placement,
} from '../../src/build-harness'

const timeout = 60_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

/** Builds a one-off app (`bundleApp`) in this directory, without a plugin. */
function bundleApp(
  options: Omit<BundleOptions, 'dir'> & { plugins?: BundlerPlugins },
) {
  return bundleAppIn({
    dir: testsDir,
    registerCleanup: onTestFinished,
    ...options,
  })
}

/**
 * The entry imports `./eager` statically and `./lazy` on demand, and never
 * uses the `unused` export of `./eager`.
 */
const dynamicImportApp = {
  'entry.ts': `import { eager } from './eager'
export const value = eager()
export async function load() {
  const { lazy } = await import('./lazy')
  return lazy()
}
`,
  'eager.ts': `export function eager() {
  return 'MARK_EAGER'
}
export function unused() {
  return 'MARK_UNUSED'
}
`,
  'lazy.ts': `export function lazy() {
  return 'MARK_LAZY'
}
`,
}

describe.each(bundlers)('%s', (bundler) => {
  test.each(['ssr', 'client'] as const)(
    'reports static imports as eager and dynamic imports as lazy, and runs the output (%s)',
    async (env) => {
      const app = await bundleApp({ bundler, env, files: dynamicImportApp })
      expect(app.eager).toContain(app.entry.fileName)
      expect(app.lazy).not.toHaveLength(0)
      expect({
        eager: app.where('MARK_EAGER'),
        lazy: app.where('MARK_LAZY'),
        unused: app.where('MARK_UNUSED'),
      }).toEqual({ eager: 'eager', lazy: 'lazy', unused: 'nowhere' })
      const lazyChunk = app.locate('MARK_LAZY').lazy[0]
      expect(
        app.chunks.some((chunk) => chunk.dynamicImports.includes(lazyChunk!)),
      ).toBe(true)

      const run = await app.run(`console.log('ran')
return [entry.value, await entry.load()]`)
      expect(run.result).toEqual(['MARK_EAGER', 'MARK_LAZY'])
      expect(run.logs).toEqual(['ran'])
      expect(run.html).toBe(
        env === 'client' ? '<div id="root"></div>' : undefined,
      )
    },
    timeout,
  )

  test('emits source maps naming the source files', async () => {
    const app = await bundleApp({
      bundler,
      files: dynamicImportApp,
      sourcemap: true,
    })
    const lazyChunk = app.chunks.find(
      (chunk) => chunk.fileName === app.locate('MARK_LAZY').lazy[0],
    )
    expect(
      lazyChunk?.map?.sources.map((source) => path.basename(source)),
    ).toContain('lazy.ts')
  })

  test('maps a frame of an error stack through the source map of its chunk', async () => {
    const app = await bundleApp({
      bundler,
      files: {
        'entry.ts': `export async function load() {
  const { fail } = await import('./failing')
  return fail()
}
`,
        // The TypeScript-only lines before the throw shift it: a map that
        // skips the TypeScript transform points at the wrong line.
        'failing.ts': `interface Failure {
  message: string
  code: number
}
type Reason = Failure['message']
export function fail(reason: Reason = 'MARK_FAIL'): string {
  // MARK_FAIL throws on line 8
  throw new Error(reason)
}
`,
      },
      sourcemap: true,
    })
    const { result } = await app.run(
      `try { await entry.load() } catch (error) { return error.stack }`,
    )
    const frame = originalFrameOf(app, result as string)
    expect(frame && { file: frame.file, line: frame.line }).toEqual({
      file: 'failing.ts',
      line: 8,
    })
  })

  // `<T>(value: T) => value` and `<number>input` only parse as TypeScript
  // without JSX, which is how every bundler reads a `.ts` file.
  test('compiles the TypeScript-only syntax of a .ts module', async () => {
    const app = await bundleApp({
      bundler,
      files: {
        'entry.ts': `const identity = <T>(value: T): T => value
export function read(input: unknown) {
  return identity(<number>input + 1)
}
`,
      },
    })
    expect((await app.run('return entry.read(1)')).result).toBe(2)
  })

  test('builds an app with a symlinked module', async () => {
    const app = await bundleApp({
      bundler,
      files: {
        'entry.ts': `export { linked } from './linked'\n`,
        'real/linked.ts': `export const linked = 'MARK_LINKED'\n`,
      },
      symlinks: { 'linked.ts': 'real/linked.ts' },
    })
    expect((await app.run('return entry.linked')).result).toBe('MARK_LINKED')
  })

  test('reports a build error through the bundler', async () => {
    await expect(
      bundleApp({
        bundler,
        files: { 'entry.ts': `import { missing } from './missing'\nmissing()` },
      }),
    ).rejects.toMatchObject({
      name: 'BuildError',
      bundler,
      errors: expect.arrayContaining([
        expect.stringMatching(/resolve ["']\.\/missing["']/),
      ]),
    })
  })
})

/**
 * A plugin of `bundler` that warns through the bundler's own reporting
 * (`MARK_PLUGIN_WARNING`) and, except esbuild's, prints a warning and an
 * error on the console while the build runs; the build succeeds. (esbuild
 * calls plugins from callbacks of its long-lived service, and the harness
 * does not attribute their console output to the build reliably: in this
 * file's run it reached no build. A known limit of the capture, which
 * router-plugin's console control leaves out for esbuild too.)
 */
const reportingPlugins: BundlerPlugins = {
  vite: () => ({
    name: 'reports',
    buildStart(this: { warn: (message: string) => void }) {
      this.warn('MARK_PLUGIN_WARNING')
      console.warn('MARK_CONSOLE_WARNING')
      console.error('MARK_CONSOLE_ERROR')
    },
  }),
  esbuild: () => ({
    name: 'reports',
    setup(build: {
      onStart: (callback: () => { warnings: Array<{ text: string }> }) => void
    }) {
      build.onStart(() => {
        return { warnings: [{ text: 'MARK_PLUGIN_WARNING' }] }
      })
    },
  }),
  ...Object.fromEntries(
    (['webpack', 'rspack'] as const).map((bundler) => [
      bundler,
      () => ({
        apply(compiler: {
          hooks: {
            thisCompilation: {
              tap: (
                name: string,
                callback: (compilation: { warnings: Array<unknown> }) => void,
              ) => void
            }
          }
        }) {
          compiler.hooks.thisCompilation.tap('reports', (compilation) => {
            compilation.warnings.push(new Error('MARK_PLUGIN_WARNING'))
            console.warn('MARK_CONSOLE_WARNING')
            console.error('MARK_CONSOLE_ERROR')
          })
        },
      }),
    ]),
  ),
}

/** The markers of `diagnostics`, sorted. */
const markersOf = (diagnostics: Array<{ text: string }>) =>
  diagnostics.flatMap(({ text }) => text.match(/MARK_\w+/g) ?? []).sort()

// Severity is part of a report (SPEC §5.7: a clause that says "warn" and
// allows no refusal asks for a warning): the result keeps it on both
// channels, as a dev server's channel does.
test.each(bundlers)(
  '%s: the reports of a build that succeeds keep their severity',
  async (bundler) => {
    const app = await bundleApp({
      bundler,
      files: { 'entry.ts': `export const value = 1\n` },
      plugins: reportingPlugins,
    })
    expect(app.warnings).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        text: expect.stringContaining('MARK_PLUGIN_WARNING'),
      }),
    )
    const printsToConsole = bundler !== 'esbuild'
    if (printsToConsole) {
      expect(app.consoleMessages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'warning',
            text: expect.stringContaining('MARK_CONSOLE_WARNING'),
          }),
          expect.objectContaining({
            severity: 'error',
            text: expect.stringContaining('MARK_CONSOLE_ERROR'),
          }),
        ]),
      )
    }
    const reported = [...app.warnings, ...app.consoleMessages]
    expect({
      warning: markersOf(findDiagnostics(reported, { severity: 'warning' })),
      error: markersOf(findDiagnostics(reported, { severity: 'error' })),
    }).toEqual(
      printsToConsole
        ? {
            warning: ['MARK_CONSOLE_WARNING', 'MARK_PLUGIN_WARNING'],
            error: ['MARK_CONSOLE_ERROR'],
          }
        : { warning: ['MARK_PLUGIN_WARNING'], error: [] },
    )
  },
  timeout,
)

// Vite's logger: an error logged by a build that does not fail is a report
// of that build, an error, not a warning.
test('vite: an error logged by a build that succeeds is reported as an error', async () => {
  const app = await bundleApp({
    bundler: 'vite',
    files: { 'entry.ts': `export const value = 1\n` },
    plugins: {
      vite: () => ({
        name: 'logs-an-error',
        configResolved(config: { logger: { error: (text: string) => void } }) {
          config.logger.error('MARK_LOGGED_ERROR')
        },
      }),
    },
  })
  expect(
    findDiagnostics(app.warnings, { severity: 'error' }).map(
      ({ text }) => text,
    ),
  ).toEqual([expect.stringContaining('MARK_LOGGED_ERROR')])
})

// Like `vite build`, which minifies client builds but not SSR builds.
test('a Vite production build minifies the client, not SSR', async () => {
  const files = {
    'entry.ts': `export function read() {
  const keepThisLocalName = { value: 'MARK_LOCAL' }
  keepThisLocalName.value += '!'
  return keepThisLocalName.value
}
`,
  }
  const ssr = await bundleApp({ bundler: 'vite', env: 'ssr', files })
  const client = await bundleApp({ bundler: 'vite', env: 'client', files })
  expect([
    ssr.where('keepThisLocalName'),
    client.where('keepThisLocalName'),
  ]).toEqual(['eager', 'nowhere'])
  expect((await ssr.run('return entry.read()')).result).toBe('MARK_LOCAL!')
})

test('NODE_ENV is the mode during a build, or unset with nodeEnv: null', async () => {
  const seen: Record<string, string | undefined> = {}
  for (const nodeEnv of [undefined, null] as const) {
    await bundleAppIn({
      dir: testsDir,
      registerCleanup: onTestFinished,
      bundler: 'vite',
      files: { 'entry.ts': `export const value = 1\n` },
      nodeEnv,
      plugins: {
        vite: () => {
          seen[String(nodeEnv)] = process.env.NODE_ENV
          return { name: 'record-node-env' }
        },
      },
    })
  }
  expect(seen).toEqual({ undefined: 'production', null: undefined })
})

test.each(['webpack', 'rspack'] as const)(
  '%s: rebuildAfter describes the output of the rebuild after the edit',
  async (bundler) => {
    const app = await bundleApp({
      bundler,
      files: { 'entry.ts': `export const value = 'v1'\n` },
      rebuildAfter: { 'entry.ts': `export const value = 'v2'\n` },
    })
    expect((await app.run('return entry.value')).result).toBe('v2')
  },
  timeout,
)

describe('side-effect hints', () => {
  /** `./effects` is imported for an export the entry never uses. */
  const unusedModuleApp = {
    'entry.ts': `import { used } from './lib'
export const value = used()
`,
    'lib.ts': `export { used } from './used'
export { unused } from './effects'
`,
    'used.ts': `export function used() {
  return 'used'
}
`,
    'effects.ts': `;(globalThis as any).effects = ['MARK_EFFECT']
export function unused() {
  return 'unused'
}
`,
  }

  test.each(bundlers)(
    '"sideEffects": false in package.json drops a module whose exports are unused (%s)',
    async (bundler) => {
      const placements: Record<string, Placement> = {}
      for (const sideEffects of [undefined, false]) {
        const app = await bundleApp({
          bundler,
          files: unusedModuleApp,
          sideEffects,
        })
        placements[String(sideEffects)] = app.where('MARK_EFFECT')
      }
      expect(placements).toEqual({ undefined: 'eager', false: 'nowhere' })
    },
    timeout,
  )

  /**
   * Unused bindings initialised by calls to a side-effectful function, with
   * and without purity annotations.
   */
  const annotatedCallsApp = {
    'entry.ts': `import { used } from './lib'
export const value = used()
`,
    'lib.ts': `function record(label: string) {
  ;(globalThis as any).recorded = [...((globalThis as any).recorded ?? []), label]
  return label
}
/* #__NO_SIDE_EFFECTS__ */
function recordAnnotated(label: string) {
  ;(globalThis as any).recorded = [...((globalThis as any).recorded ?? []), label]
  return label
}
export function used() {
  return 'used'
}
export const plain = record('MARK_PLAIN')
export const pure = /* @__PURE__ */ record('MARK_PURE')
export const noSideEffects = recordAnnotated('MARK_NO_SIDE_EFFECTS')
`,
  }

  // What each bundler drops in a production build. webpack and Rspack drop
  // unused code inside a kept module only when minifying.
  test.each(bundlers)(
    '/* @__PURE__ */ and #__NO_SIDE_EFFECTS__ let an unused call be dropped (%s)',
    async (bundler) => {
      const app = await bundleApp({ bundler, files: annotatedCallsApp })
      expect({
        plain: app.where('MARK_PLAIN'),
        pure: app.where('MARK_PURE'),
        noSideEffects: app.where('MARK_NO_SIDE_EFFECTS'),
      }).toEqual({ plain: 'eager', pure: 'nowhere', noSideEffects: 'nowhere' })
    },
    timeout,
  )
})

// User ruling 2026-10-17 (dead-code references, widened): a name that is
// never declared or imported must not survive into production client
// output. The harness checks every production client build of the supported
// bundlers.
describe.each(['vite', 'rspack', 'webpack'] as const)(
  'dangling names in production client output (%s)',
  (bundler) => {
    test(
      'a chunk that reads a dangling name fails the build description',
      async () => {
        await expect(
          bundleApp({
            bundler,
            env: 'client',
            files: {
              'entry.ts': `export function read() {
  return [notDeclaredAnywhere, document.title]
}
`,
            },
          }),
        ).rejects.toMatchObject({
          name: 'DanglingNameError',
          names: { 'entry.mjs': ['notDeclaredAnywhere'] },
        })
      },
      timeout,
    )

    // Browsers define window properties with generic names: reading one is
    // valid code, and the page reads the window's.
    test(
      'a chunk that reads browser globals with generic names passes and reads them in the browser',
      async () => {
        const app = await bundleApp({
          bundler,
          env: 'client',
          files: {
            'entry.ts': `export function read() {
  return [name, status, typeof parent]
}
declare const name: string, status: string, parent: object
`,
          },
        })
        expect((await app.run('return entry.read()')).result).toEqual([
          '',
          '',
          'object',
        ])
      },
      timeout,
    )

    // A browser defines none of Node's own globals: a read of one that
    // survives into a client chunk throws there, even though the build runs
    // in Node.
    test(
      'a chunk that reads Node-only globals fails the build description',
      async () => {
        const error = await bundleApp({
          bundler,
          env: 'client',
          files: {
            'entry.ts': `export function read() {
  return [Buffer.from('a').length, global, setImmediate, document.title]
}
declare const Buffer: { from: (value: string) => { length: number } }
declare const global: unknown, setImmediate: unknown
`,
          },
        }).catch((caught: unknown) => caught)
        expect(error).toMatchObject({ name: 'DanglingNameError' })
        // webpack and Rspack replace `global` with their own runtime's
        // global object.
        expect((error as DanglingNameError).names['entry.mjs']).toEqual(
          expect.arrayContaining(['Buffer', 'setImmediate']),
        )
      },
      timeout,
    )

    // The client runs in a browser, which defines no Node.js global.
    test(
      'a read of a Node-only global a typeof check guards passes, and the build replaces process.env.NODE_ENV',
      async () => {
        const app = await bundleApp({
          bundler,
          env: 'client',
          files: {
            'entry.ts': `export function read() {
  return [
    typeof process !== 'undefined' && process.env.NODE_ENV,
    typeof setImmediate === 'function' ? 'has setImmediate' : 'none',
    process.env.NODE_ENV,
  ]
}
declare const process: { env: Record<string, string> }
declare const setImmediate: unknown
`,
          },
        })
        expect(app.locate(/\bprocess\.env\b/)).toEqual({ eager: [], lazy: [] })
        expect((await app.run('return entry.read()')).result).toEqual([
          false,
          'none',
          'production',
        ])
      },
      timeout,
    )

    test(
      'a typeof check of a Node-only global in one function does not allow an unguarded read in another',
      async () => {
        await expect(
          bundleApp({
            bundler,
            env: 'client',
            files: {
              'entry.ts': `export function guarded() {
  return typeof Buffer !== 'undefined' && Buffer.byteLength('a')
}
export function unguarded() {
  return Buffer.byteLength('b')
}
declare const Buffer: { byteLength: (value: string) => number }
`,
            },
          }),
        ).rejects.toMatchObject({
          name: 'DanglingNameError',
          names: { 'entry.mjs': ['Buffer'] },
        })
      },
      timeout,
    )

    test(
      'chunks that read only globals, probe names with typeof, and drop dead code with a dangling name pass',
      async () => {
        const app = await bundleApp({
          bundler,
          env: 'client',
          files: {
            'entry.ts': `function unused() {
  return notDeclaredAnywhere
}
export async function read() {
  queueMicrotask(() => {})
  const { lazy } = await import('./lazy')
  return [
    lazy(),
    typeof maybeDefined === 'undefined',
    structuredClone({ a: 1 }).a,
    window.location.pathname,
    document.getElementById('root')?.id,
    new URL('http://localhost/x').pathname,
    Math.max(1, 2),
  ]
}
declare const maybeDefined: unknown
`,
            'lazy.ts': `export const lazy = () => new Map([[1, 'lazy']]).get(1)
`,
          },
        })
        expect((await app.run('return entry.read()')).result).toEqual([
          'lazy',
          true,
          1,
          '/',
          'root',
          '/x',
          2,
        ])
      },
      timeout,
    )
  },
)

// webpack and Rspack drop unused code inside a module only when minifying:
// an unminified production build ships it, and the check reads every
// emitted artifact.
describe.each(['rspack', 'webpack'] as const)(
  'dangling names in webpack and Rspack production client builds (%s)',
  (bundler) => {
    test(
      'the minified build deletes dead code with a dangling name and passes; the unminified build ships it and is rejected',
      async () => {
        const files = {
          'entry.ts': `function unused() {
  return [notDeclaredAnywhere, 'MARK_UNUSED']
}
export function read() {
  return 'MARK_USED'
}
`,
        }
        const minified = await bundleApp({ bundler, env: 'client', files })
        expect({
          used: minified.where('MARK_USED'),
          unused: minified.where('MARK_UNUSED'),
        }).toEqual({ used: 'eager', unused: 'nowhere' })
        expect((await minified.run('return entry.read()')).result).toBe(
          'MARK_USED',
        )

        await expect(
          bundleApp({ bundler, env: 'client', minify: false, files }),
        ).rejects.toMatchObject({
          name: 'DanglingNameError',
          names: { 'entry.mjs': ['notDeclaredAnywhere'] },
        })
      },
      timeout,
    )

    /**
     * A dependency installed outside the app (`node_modules/dep` links to
     * it, as a package manager links one) with `files`, removed after the
     * test.
     */
    async function dependency(files: Record<string, string>) {
      const directory = await mkdtemp(path.join(testsDir, '.dependency-'))
      onTestFinished(() => rm(directory, { recursive: true, force: true }))
      await writeFile(
        path.join(directory, 'package.json'),
        `{ "name": "dep", "type": "module", "main": "./a.js" }\n`,
      )
      for (const [file, code] of Object.entries(files)) {
        await writeFile(path.join(directory, file), code)
      }
      return { 'node_modules/dep': directory }
    }

    /**
     * `a` imports `helper` only for an export nobody uses: unminified, the
     * bundler ships that unused code. Rspack drops the binding it reads;
     * webpack declares it.
     */
    const unusedImport = {
      'a.js': `import { helper } from './b.js'
export function used() {
  return 'MARK_USED'
}
export function unused() {
  return helper()
}
`,
      'b.js': `export function helper() {
  return 'MARK_B'
}
`,
    }
    /** As seroval's `const RETURN = () => T`: a free name its own source reads, used as text. */
    const freeRead = {
      'a.js': `const RETURN = () => T
export const used = () => /=>/.test(RETURN.toString())
`,
    }
    const entry = {
      'entry.js': `import { used } from 'dep'
export const read = () => used()
`,
      // Transforms standing for a compiler under test that changes the
      // dependency: one loses `a`'s binding of `helper`, as a broken
      // compiler would; the other only marks the module.
      'lose-binding-loader.cjs': `module.exports = (source) => source.replace("import { helper } from './b.js'\\n", '')\n`,
      'mark-loader.cjs': `module.exports = (source) => source + '\\n// transformed\\n'\n`,
    }
    const transformDependency = (loader: string) => [
      { test: /a\.js$/, include: /\.dependency-/, loader },
    ]

    // Ruling "dangling-name attribution" (amended 2026-10-20): the check
    // covers the modules the compilers under test produced or changed.
    test(
      'an untouched dependency is out of scope, even when the bundler drops its import bindings',
      async () => {
        const app = await bundleApp({
          bundler,
          env: 'client',
          minify: false,
          entry: 'entry.js',
          files: entry,
          symlinks: await dependency(unusedImport),
        })
        expect(app.entry.code).toMatch(/return .*helper.*\(\)/)
        // Rspack ships the read without its binding; webpack declares it.
        expect(unboundNames(app.entry.code).has('helper')).toBe(
          bundler === 'rspack',
        )
        expect((await app.run('return entry.read()')).result).toBe('MARK_USED')
      },
      timeout,
    )

    test(
      'a dependency module whose import binding a transform dropped is rejected',
      async () => {
        await expect(
          bundleApp({
            bundler,
            env: 'client',
            minify: false,
            entry: 'entry.js',
            files: entry,
            symlinks: await dependency(unusedImport),
            sourceRules: transformDependency('./lose-binding-loader.cjs'),
          }),
        ).rejects.toMatchObject({
          name: 'DanglingNameError',
          names: { 'entry.mjs': ['helper'] },
        })
      },
      timeout,
    )

    test(
      'a transformed dependency module that reads a name free in its own source passes; the same code in the app is rejected',
      async () => {
        const app = await bundleApp({
          bundler,
          env: 'client',
          minify: false,
          entry: 'entry.js',
          files: entry,
          symlinks: await dependency(freeRead),
          sourceRules: transformDependency('./mark-loader.cjs'),
        })
        expect(app.entry.code).toContain('// transformed')
        expect(unboundNames(app.entry.code).has('T')).toBe(true)
        expect((await app.run('return entry.read()')).result).toBe(true)

        await expect(
          bundleApp({
            bundler,
            env: 'client',
            minify: false,
            entry: 'entry.js',
            files: {
              'entry.js': `export { used as read } from './free.js'\n`,
              'free.js': freeRead['a.js'],
            },
          }),
        ).rejects.toMatchObject({
          name: 'DanglingNameError',
          names: { 'entry.mjs': ['T'] },
        })
      },
      timeout,
    )

    // Coupling N19 / RULES-AUDIT R11: attribution comes from the chunk's
    // source map, not from printed module headers, so a minified build (no
    // headers) is attributed like an unminified one.
    test(
      'minified: an untouched dependency reading a name free in its own source passes; a transform that makes a dependency read a dangling name is rejected',
      async () => {
        const app = await bundleApp({
          bundler,
          env: 'client',
          entry: 'entry.js',
          files: entry,
          symlinks: await dependency(freeRead),
        })
        expect(unboundNames(app.entry.code).has('T')).toBe(true)
        expect((await app.run('return entry.read()')).result).toBe(true)

        await expect(
          bundleApp({
            bundler,
            env: 'client',
            entry: 'entry.js',
            files: {
              ...entry,
              'dangling-loader.cjs': `module.exports = (source) => source.replace("'MARK_USED'", 'lostBinding')\n`,
            },
            symlinks: await dependency(unusedImport),
            sourceRules: transformDependency('./dangling-loader.cjs'),
          }),
        ).rejects.toMatchObject({
          name: 'DanglingNameError',
          names: { 'entry.mjs': ['lostBinding'] },
        })
      },
      timeout,
    )

    if (bundler === 'rspack') {
      // The provenance is what the build changed, not who changed it: a
      // compiler under test may be a built-in transform (here Rspack's
      // built-in SWC loader inlining a constant module), which the old
      // check left out of scope by its `builtin:` loader name.
      test(
        'a dependency a built-in transform changed is in scope',
        async () => {
          await expect(
            bundleApp({
              bundler,
              env: 'client',
              // Unminified: the old check attributed by printed module
              // headers here, and left the dependency out by the loader's
              // name
              minify: false,
              entry: 'entry.js',
              files: entry,
              symlinks: await dependency({
                'a.js': `import { flag } from 'config'
export const used = () => flag
`,
              }),
              sourceRules: [
                {
                  test: /a\.js$/,
                  include: /\.dependency-/,
                  loader: 'builtin:swc-loader',
                  options: {
                    jsc: {
                      target: 'esnext',
                      transform: {
                        constModules: {
                          globals: { config: { flag: 'builtinLost' } },
                        },
                      },
                    },
                  },
                },
              ],
            }),
          ).rejects.toMatchObject({
            name: 'DanglingNameError',
            names: { 'entry.mjs': ['builtinLost'] },
          })
        },
        timeout,
      )
    }
  },
)

describe('dangling names in Vite production client builds', () => {
  /** A dependency linked into the app, as in the webpack/Rspack block. */
  async function dependency(files: Record<string, string>) {
    const directory = await mkdtemp(path.join(testsDir, '.dependency-'))
    onTestFinished(() => rm(directory, { recursive: true, force: true }))
    await writeFile(
      path.join(directory, 'package.json'),
      `{ "name": "dep", "type": "module", "main": "./a.js" }\n`,
    )
    for (const [file, code] of Object.entries(files)) {
      await writeFile(path.join(directory, file), code)
    }
    return { 'node_modules/dep': directory }
  }
  const entry = {
    'entry.js': `import { used } from 'dep'
export const read = () => used()
`,
  }

  test(
    'an untouched dependency reading a name free in its own source passes (minified), the same code in the app is rejected',
    async () => {
      const app = await bundleApp({
        bundler: 'vite',
        env: 'client',
        entry: 'entry.js',
        files: entry,
        symlinks: await dependency({
          'a.js': `const RETURN = () => T
export const used = () => /=>/.test(RETURN.toString())
`,
        }),
      })
      expect(unboundNames(app.entry.code).has('T')).toBe(true)
      expect(
        app.chunks
          .map((chunk) => chunk.fileName)
          .filter((file) => file.endsWith('.map')),
      ).toEqual([])

      await expect(
        bundleApp({
          bundler: 'vite',
          env: 'client',
          entry: 'entry.js',
          files: {
            'entry.js': `const RETURN = () => T
export const read = () => /=>/.test(RETURN.toString())
`,
          },
        }),
      ).rejects.toMatchObject({ name: 'DanglingNameError' })
    },
    timeout,
  )

  test(
    "a dependency a plugin's transform hook made read a dangling name is rejected",
    async () => {
      await expect(
        bundleApp({
          bundler: 'vite',
          env: 'client',
          entry: 'entry.js',
          files: entry,
          symlinks: await dependency({
            'a.js': `export const used = () => 'MARK_USED'\n`,
          }),
          plugins: {
            vite: () => [
              {
                name: 'loses-a-binding',
                transform(code: string, id: string) {
                  return id.includes('.dependency-')
                    ? code.replace("'MARK_USED'", 'viteLost')
                    : null
                },
              },
            ],
          },
        }),
      ).rejects.toMatchObject({
        name: 'DanglingNameError',
        names: { 'entry.mjs': ['viteLost'] },
      })
    },
    timeout,
  )

  // A splitting compiler serves one file as several modules (`a.js` and
  // `a.js?split`): the evidence is per module, so the binding the split
  // module keeps does not hide the dangling read the other ships.
  test(
    'a file served as two modules: a dangling read in one is not hidden by the binding in the other',
    async () => {
      await expect(
        bundleApp({
          bundler: 'vite',
          env: 'client',
          entry: 'entry.js',
          files: {
            'entry.js': `import { read } from './a.js'
export const run = () => read()
`,
            'a.js': `export const read = () => 'MARK'\n`,
          },
          plugins: {
            vite: () => [
              {
                name: 'splits-a-binding-away',
                transform(_code: string, id: string) {
                  if (id.endsWith('/a.js')) {
                    return `import './a.js?split'
export const read = () => splitLost
`
                  }
                  return id.endsWith('/a.js?split')
                    ? `const splitLost = 1
export const Component = () => splitLost
`
                    : null
                },
              },
            ],
          },
        }),
      ).rejects.toMatchObject({
        name: 'DanglingNameError',
        names: { 'entry.mjs': ['splitLost'] },
      })
    },
    timeout,
  )
})

describe('client runs in the browser', () => {
  /** Describes classic script chunks written to an app's `dist`. */
  async function classicBuild(files: Record<string, string>) {
    const app = await createApp({
      dir: testsDir,
      registerCleanup: onTestFinished,
      files: Object.fromEntries(
        Object.entries(files).map(([file, code]) => [`dist/${file}`, code]),
      ),
    })
    return describeBuild({
      bundler: 'rspack',
      env: 'client',
      mode: 'development',
      esModules: false,
      root: app.root,
      outDir: path.join(app.root, 'dist'),
      chunks: [
        {
          fileName: 'static/index.js',
          isEntry: true,
          imports: ['static/vendor.js'],
          dynamicImports: [],
        },
        {
          fileName: 'static/vendor.js',
          isEntry: false,
          imports: ['static/index.js'],
          dynamicImports: [],
        },
      ],
      warnings: [],
      consoleMessages: [],
      duration: 0,
      dispose: app.dispose,
      entryGlobal: '__entry',
    })
  }

  test('a classic script entry loads with the chunks of its group, and the page is /', async () => {
    const build = await classicBuild({
      'static/vendor.js': `var vendorValue = 'MARK_VENDOR'\n`,
      'static/index.js': `globalThis.__entry = { read: () => [vendorValue, this === window, location.pathname] }\n`,
    })
    expect((await build.run('return entry.read()')).result).toEqual([
      'MARK_VENDOR',
      true,
      '/',
    ])
  })

  test('an error the page does not catch fails the run', async () => {
    const build = await classicBuild({
      'static/vendor.js': '',
      'static/index.js': `globalThis.__entry = {}
setTimeout(() => { throw new Error('MARK_UNCAUGHT') })
`,
    })
    await expect(
      build.run('await new Promise((resolve) => setTimeout(resolve, 50))'),
    ).rejects.toThrow(/MARK_UNCAUGHT/)
  })
})

describe('registerCleanup', () => {
  test('receives the dispose() that removes the app directory', async () => {
    const cleanups: Array<() => Promise<void>> = []
    const app = await createApp({
      dir: testsDir,
      files: { 'entry.ts': `export const value = 1\n` },
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    })
    expect(cleanups).toEqual([app.dispose])
    expect(existsSync(app.root)).toBe(true)
    await cleanups[0]!()
    expect(existsSync(app.root)).toBe(false)
  })

  test('without it, the app stays until dispose()', async () => {
    const app = await createApp({
      dir: testsDir,
      files: { 'entry.ts': `export const value = 1\n` },
    })
    try {
      expect(existsSync(app.root)).toBe(true)
    } finally {
      await app.dispose()
    }
    expect(existsSync(app.root)).toBe(false)
  })
})

test.each(['webpack', 'rspack'] as const)(
  '%s: concurrent native loaders keep console messages in their own builds',
  async (bundler) => {
    const build = () =>
      bundleApp({
        files: {
          'entry.js': 'export const value = 1',
          'warning-loader.cjs': `module.exports = function(code) { console.warn(this.resourcePath + ' MARK_LOADER_WARNING'); return code }`,
        },
        bundler,
        env: 'ssr',
        entry: 'entry.js',
        configure(options) {
          const rules = (options.module as { rules: Array<unknown> }).rules
          rules.push({
            test: /\.js$/,
            loader: path.join(String(options.context), 'warning-loader.cjs'),
          })
        },
      })
    const [first, second] = await Promise.all([build(), build()])
    for (const [app, other] of [
      [first, second],
      [second, first],
    ] as const) {
      expect(
        app.consoleMessages.some(
          ({ text }) =>
            text.includes(app.root) && text.includes('MARK_LOADER_WARNING'),
        ),
      ).toBe(true)
      expect(
        app.consoleMessages.some(({ text }) => text.includes(other.root)),
      ).toBe(false)
    }
  },
  timeout,
)
