/**
 * Controls of the dangling-name check's reachability (SPEC G8,
 * free-names.ts): a read in code that never runs is no read, and one in code
 * that runs counts, also in a function declared where code never runs but
 * called from code that does (hoisted: directly, through another such
 * function, from another `case`), and in a `case` test, which runs before
 * its consequent. Real builds, minified or not; each read row loads the
 * chunk where the check passes it, and the page throws `ReferenceError`.
 * Source: the X1 round-4 review probes (Fable's 30 cells, Astra's apps).
 */
import { expect } from 'vitest'
import { DanglingNameError } from '../../src/build-harness'
import { test } from '../../src/test'

const head = `export function label(productLabel: string) {
  return productLabel.toUpperCase()
}
`
const entry = { 'entry.ts': `export const load = () => import('./lazy')\n` }
/** Lazy modules whose `MARK_READ` statement runs when the chunk loads. */
const shapes: Record<string, Record<string, string>> = {
  'at the module top level': {
    ...entry,
    'lazy.ts': `${head}console.log('MARK_READ')\n`,
  },
  'in a function declared after a return and called in it': {
    ...entry,
    'lazy.ts': `${head}export function make() {
  return { run }
  function run() {
    return console.log('MARK_READ')
  }
}
make().run()
`,
  },
  'in a function declared after a return, called only by another one': {
    ...entry,
    'lazy.ts': `${head}export function make() {
  return { run }
  function run() {
    return helper()
  }
  function helper() {
    return console.log('MARK_READ')
  }
}
make().run()
`,
  },
  'in a case test whose consequent throws, then breaks': {
    ...entry,
    'lazy.ts': `${head}export function pick(kind: unknown) {
  switch (kind) {
    case console.log('MARK_READ'):
      throw new Error('picked')
      break
    default:
      return 1
  }
}
pick(1)
`,
  },
  'in a function declared in a case after its return, called in a later case': {
    ...entry,
    'lazy.ts': `${head}export function pick(kind: number) {
  switch (kind) {
    case 1:
      return 0
      function helper() {
        return console.log('MARK_READ')
      }
    default:
      return helper()
  }
}
pick(2)
`,
  },
}

/** The read the rows add after the build: a name nothing binds. */
const addRead = (code: string) =>
  code.replace(/(["'`])MARK_READ\1/, '$&,droppedLabel')

const webpackLike = () => ({
  apply(compiler: {
    webpack: {
      Compilation: { PROCESS_ASSETS_STAGE_REPORT: number }
      sources: { RawSource: new (code: string) => unknown }
    }
    hooks: {
      thisCompilation: {
        tap: (name: string, run: (compilation: never) => void) => void
      }
    }
  }) {
    const { Compilation, sources } = compiler.webpack
    compiler.hooks.thisCompilation.tap(
      'add-read',
      (compilation: {
        hooks: {
          processAssets: {
            tap: (
              options: { name: string; stage: number },
              run: (assets: Record<string, unknown>) => void,
            ) => void
          }
        }
        getAsset: (name: string) => { source: { source: () => unknown } }
        updateAsset: (name: string, source: unknown) => void
      }) => {
        compilation.hooks.processAssets.tap(
          { name: 'add-read', stage: Compilation.PROCESS_ASSETS_STAGE_REPORT },
          (assets) => {
            for (const name of Object.keys(assets)) {
              const code = String(compilation.getAsset(name).source.source())
              if (/\.[cm]?js$/.test(name) && code.includes('MARK_READ')) {
                compilation.updateAsset(
                  name,
                  new sources.RawSource(addRead(code)),
                )
              }
            }
          },
        )
      },
    )
  },
})

test.for(
  (['vite', 'webpack', 'rspack'] as const).flatMap((bundler) =>
    Object.keys(shapes).flatMap((shape) =>
      [false, true].map((minify) => [bundler, shape, minify] as const),
    ),
  ),
)(
  '%s: a read %s is dangling (minified: %s)',
  async ([bundler, shape, minify], { build }) => {
    const outcome = await build({
      bundler,
      env: 'client',
      minify,
      files: shapes[shape]!,
      plugins: {
        webpack: webpackLike,
        rspack: webpackLike,
        vite: () => ({
          name: 'add-read',
          generateBundle(
            _: unknown,
            bundle: Record<string, { type: string; code?: string }>,
          ) {
            for (const chunk of Object.values(bundle)) {
              if (chunk.type === 'chunk' && chunk.code?.includes('MARK_READ')) {
                chunk.code = addRead(chunk.code)
              }
            }
          },
        }),
      },
    }).then(
      (app) =>
        app.run('await entry.load()\nreturn "loaded"').then(
          ({ result }) => result,
          (thrown: unknown) => thrown,
        ),
      (thrown: unknown) => thrown,
    )
    expect(outcome).toBeInstanceOf(DanglingNameError)
    expect(Object.values((outcome as DanglingNameError).names).flat()).toEqual([
      'droppedLabel',
    ])
  },
)

// An app's own function whose read follows a return: only the reads it runs
// count (minified or not; webpack, as Astra's apps).
test.for(
  (
    [
      [
        'through two hoisted functions',
        'return first()\n  function first() { return second() }\n  function second() { return productLabel }',
        'dangling',
      ],
      [
        'in a case test whose consequent breaks',
        'switch (0) {\n    case productLabel:\n      break\n      void 0\n  }',
        'dangling',
      ],
      [
        'after a try that returns, with an empty finally',
        'try { return 1 } finally {}\n  return productLabel',
        1,
      ],
      [
        'through a direct eval',
        'return eval("first()")\n  function first() { return productLabel }',
        'dangling',
      ],
      [
        'nowhere: a direct eval only a function nothing calls holds',
        'return 42\n  function never() { return eval("first()") }\n  function first() { return productLabel }',
        42,
      ],
      [
        'nowhere: the same functions read a literal',
        'return first()\n  function first() { return second() }\n  function second() { return 42 }',
        42,
      ],
    ] as const
  ).flatMap(([name, body, outcome]) =>
    [false, true].map((minimize) => [name, minimize, body, outcome] as const),
  ),
)(
  'webpack: an app function reading a name nothing binds %s (minimized: %s)',
  async ([_, minimize, body, expected], { build }) => {
    const outcome = await build({
      bundler: 'webpack',
      env: 'client',
      files: {
        'entry.ts': `export function read() {\n  ${body}\n}\n`,
      },
      configure: (options) => {
        ;(options.optimization as Record<string, unknown>).minimize = minimize
      },
    }).then(
      (app) =>
        app.run('return entry.read()').then(
          ({ result }) => result,
          (thrown: unknown) => thrown,
        ),
      (thrown: unknown) => thrown,
    )
    if (expected === 'dangling') {
      expect(outcome).toBeInstanceOf(DanglingNameError)
      expect(
        Object.values((outcome as DanglingNameError).names).flat(),
      ).toEqual(['productLabel'])
    } else {
      expect(outcome).toBe(expected)
    }
  },
)

// A bundle-level read after a `try` that always returns never runs: the
// chunk loads.
test('webpack: a footer read after a try that returns, with an empty finally, is no read', async ({
  build,
}) => {
  const footer = () => ({
    apply(compiler: {
      webpack: {
        Compilation: { PROCESS_ASSETS_STAGE_REPORT: number }
        sources: { RawSource: new (code: string) => unknown }
      }
      hooks: {
        thisCompilation: {
          tap: (name: string, run: (compilation: never) => void) => void
        }
      }
    }) {
      const { Compilation, sources } = compiler.webpack
      compiler.hooks.thisCompilation.tap(
        'footer',
        (compilation: {
          hooks: {
            processAssets: {
              tap: (
                options: { name: string; stage: number },
                run: (assets: Record<string, unknown>) => void,
              ) => void
            }
          }
          getAsset: (name: string) => { source: { source: () => unknown } }
          updateAsset: (name: string, source: unknown) => void
        }) => {
          compilation.hooks.processAssets.tap(
            {
              name: 'footer',
              stage: Compilation.PROCESS_ASSETS_STAGE_REPORT,
            },
            (assets) => {
              for (const name of Object.keys(assets)) {
                if (/\.[cm]?js$/.test(name)) {
                  const code = String(
                    compilation.getAsset(name).source.source(),
                  )
                  compilation.updateAsset(
                    name,
                    new sources.RawSource(
                      `${code}\n;(() => {\n  try {\n    return 1\n  } finally {\n  }\n  return droppedLabel\n})()\n`,
                    ),
                  )
                }
              }
            },
          )
        },
      )
    },
  })
  const outcome = await build({
    bundler: 'webpack',
    env: 'client',
    files: { 'entry.ts': `export const value = () => 1\n` },
    plugins: { webpack: footer },
  }).then(
    (app) =>
      app.run('return entry.value()').then(
        ({ result }) => result,
        (thrown: unknown) => thrown,
      ),
    (thrown: unknown) => thrown,
  )
  expect(outcome).toBe(1)
})
