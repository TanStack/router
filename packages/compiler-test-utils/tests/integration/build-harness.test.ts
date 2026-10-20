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
  namedSegments,
  originalFrameOf,
} from '../../src/build-harness'
import { unboundNames } from '../../src/validate-module'
import type {
  BundleOptions,
  DanglingNameError,
  Placement,
} from '../../src/build-harness'

const timeout = 60_000

const testsDir = path.dirname(fileURLToPath(import.meta.url))

/** Builds a one-off app (`bundleApp`) in this directory, without a plugin. */
function bundleApp(options: Omit<BundleOptions, 'dir'>) {
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

// Two named segments: `a` at line 1 column 0 of `x.ts`, `b` at line 2
// column 4 of `y.ts`; one segment without a name.
test('namedSegments decodes the named segments of a source map', () => {
  expect(
    namedSegments({
      version: 3,
      sources: ['x.ts', 'y.ts'],
      names: ['a', 'b'],
      mappings: 'AAAAA,EAAA;ACCIC',
    }),
  ).toEqual([
    { name: 'a', source: 'x.ts', line: 1, column: 0 },
    { name: 'b', source: 'y.ts', line: 2, column: 4 },
  ])
})

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
     * `a` imports `helper` only for an export nobody uses. Rspack keeps that
     * unused code unminified but drops the binding it reads; webpack declares
     * it.
     */
    const unusedImportApp = (a: string) => ({
      'entry.js': `import { used } from './a'
export const read = () => used()
`,
      'a.js': a,
      'b.js': `export function helper() {
  return 'MARK_B'
}
`,
      // An app transform that leaves the modules as they are (`identity`)
      // or loses `a`'s binding of `helper` (`lose-binding`), as a broken
      // compiler would.
      'identity-loader.cjs': `module.exports = (source) => source\n`,
      'lose-binding-loader.cjs': `module.exports = (source) => source.replace("import { helper } from './b'\\n", '')\n`,
    })
    const unusedImport = `import { helper } from './b'
export function used() {
  return 'MARK_USED'
}
export function unused() {
  return helper()
}
`

    test(
      'an import binding the bundler drops from unused code it ships is the bundler’s, as the module imports it',
      async () => {
        const app = await bundleApp({
          bundler,
          env: 'client',
          minify: false,
          entry: 'entry.js',
          sourceRules: [{ test: /\.js$/, loader: './identity-loader.cjs' }],
          files: unusedImportApp(unusedImport),
        })
        expect((await app.run('return entry.read()')).result).toBe(
          'MARK_USED',
        )
        // The unused code ships; Rspack's reads `helper` without a binding,
        // which this check attributes to the bundler.
        const entryCode = app.entry.code
        expect(entryCode).toMatch(/return helper\(\)/)
        expect(unboundNames(entryCode).has('helper')).toBe(
          bundler === 'rspack',
        )
      },
      timeout,
    )

    /** As Vue's `initCustomFormatter`: development-only code after a return, with a function declaration reading a `const` there. */
    const setupModule = `export function setup() {
  if (process.env.NODE_ENV === 'production') {
    return 'MARK_PRODUCTION'
  }
  const style = { color: 'MARK_STYLE' }
  function format() {
    return style.color
  }
  return format()
}
`
    test.each([
      // The bundler concatenates `setup` into the entry's module.
      ['concatenated into another module', `export { setup } from './setup'\n`],
      // A lazy chunk reads `setup` too: it keeps a module of its own.
      [
        'a module of its own',
        `export { setup } from './setup'
export const later = () => import('./later')
`,
      ],
    ])(
      'a declaration the bundler removes after a return it computed, which a kept function reads, is the bundler’s (%s)',
      async (_layout, entry) => {
        const app = await bundleApp({
          bundler,
          env: 'client',
          minify: false,
          entry: 'entry.js',
          files: {
            'entry.js': entry,
            'setup.js': setupModule,
            'later.js': `export { setup } from './setup'\n`,
          },
        })
        expect((await app.run('return entry.setup()')).result).toBe(
          'MARK_PRODUCTION',
        )
        // The kept function ships and reads `style` without a binding, which
        // this check attributes to the bundler.
        expect(app.entry.code).toMatch(/return style\.color/)
        expect(unboundNames(app.entry.code).has('style')).toBe(true)
      },
      timeout,
    )

    test(
      'a module that reads a name it does not import is rejected, also in unused code the bundler ships',
      async () => {
        await expect(
          bundleApp({
            bundler,
            env: 'client',
            minify: false,
            entry: 'entry.js',
            sourceRules: [
              { test: /\.js$/, loader: './lose-binding-loader.cjs' },
            ],
            files: unusedImportApp(unusedImport),
          }),
        ).rejects.toMatchObject({
          name: 'DanglingNameError',
          names: { 'entry.mjs': ['helper'] },
        })
      },
      timeout,
    )
  },
)

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
