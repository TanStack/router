/**
 * Control tests of the real-build harness (build-harness.ts): for each
 * bundler, the harness reports eager and lazy placement correctly, `run()`
 * executes SSR output in Node and client output in a real browser, and
 * side-effect hints reach the bundler.
 */
import { existsSync } from 'node:fs'
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
import type {
  BundleOptions,
  BundlerPlugins,
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
