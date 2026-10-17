/**
 * Control tests of the real-build harness (build-harness.ts): for each
 * bundler, the harness reports eager and lazy placement correctly, `run()`
 * executes SSR and client output, and side-effect hints reach the bundler.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, onTestFinished, test } from 'vitest'
import {
  bundleApp as bundleAppIn,
  bundlers,
  createApp,
  namedSegments,
  originalFrameOf,
} from '../src/build-harness'
import type { BundleOptions, Placement } from '../src/build-harness'

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
        'failing.ts': `export function fail(): string {
  // MARK_FAIL throws on line 3
  throw new Error('MARK_FAIL')
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
      line: 3,
    })
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
