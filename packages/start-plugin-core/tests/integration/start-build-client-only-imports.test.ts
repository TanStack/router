/**
 * Modules import protection denies on the server (by default `**\/*.client.*`
 * files and modules marked `@tanstack/react-start/client-only`), used only by
 * client-only code, are eliminated from the server build: a default-config
 * Start build reports no import-protection violation, the server bundle
 * holds none of their code, and each environment runs its implementation
 * (SPEC J4.11, §5.12). So is an installed browser-only package (it reads
 * `window` when it loads) that only client-only code reads, through a
 * diamond and a cycle of helpers: the server build neither bundles nor
 * imports it, and reports nothing about it (G16).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'
import { reportedViolations } from '../importProtection/start-apps'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const files = {
  'node_modules/browser-lib/package.json': JSON.stringify({
    name: 'browser-lib',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/browser-lib/index.js': `const width = window.innerWidth
export const measure = () => 'MARK_BROWSER_LIB:' + typeof width
`,
  'src/chart.client.ts': `export const draw = () => 'MARK_CHART'\n`,
  'src/paint.ts': `import '@tanstack/react-start/client-only'
export const paint = () => 'MARK_PAINT'
`,
  'src/entry.ts': `import { createClientOnlyFn, createIsomorphicFn } from '@tanstack/react-start'
import { draw } from './chart.client'
import { paint } from './paint'
import { measure } from 'browser-lib'
const measured = () => measure()
const left = () => measured()
const right = () => measured()
function ping(n: number): string { return n > 0 ? pong(n - 1) : left() + right() }
function pong(n: number): string { return n > 0 ? ping(n - 1) : '' }
export const render = createClientOnlyFn(() => draw())
export const repaint = createIsomorphicFn()
  .server(() => 'server')
  .client(() => paint())
export const size = createClientOnlyFn(() => measure())
export const resize = createIsomorphicFn()
  .server(() => 'server')
  .client(() => ping(2))
`,
}

/** What `render()` and `repaint()` give in an environment of the build. */
const run = `const settle = (fn) => {
  if (typeof fn !== 'function') {
    return fn
  }
  try {
    return fn()
  } catch (error) {
    return { thrown: { name: error.name, message: error.message } }
  }
}
return [settle(entry.render), settle(entry.repaint), settle(entry.size), settle(entry.resize)]`

describe.each(startBundlers)('%s build', (bundler) => {
  let build: StartBuild
  const cleanups: Array<() => Promise<void>> = []

  beforeAll(async () => {
    build = await buildStart({
      bundler,
      files,
      entry: 'src/entry.ts',
      registerCleanup: (cleanup) => cleanups.push(cleanup),
    })
  }, timeout)

  afterAll(async () => {
    await Promise.all(cleanups.map((cleanup) => cleanup()))
  })

  test('reports no import-protection violation', () => {
    expect(
      // (everything the build reported, on every channel)
      reportedViolations(build),
    ).toEqual([])
  })

  test('the server bundle holds none of the client-only modules', () => {
    expect([
      build.ssr.where('MARK_CHART'),
      build.ssr.where('MARK_PAINT'),
      build.ssr.where('MARK_BROWSER_LIB'),
    ]).toEqual(['nowhere', 'nowhere', 'nowhere'])
    // (nothing about the module that imports them either)
    expect(
      findDiagnostics(build.ssr.warnings, {
        file: 'src/entry.ts',
        root: build.root,
      }),
    ).toEqual([])
  })

  test('each environment runs its implementation', async () => {
    expect((await build.client.run(run)).result).toEqual([
      'MARK_CHART',
      'MARK_PAINT',
      'MARK_BROWSER_LIB:number',
      'MARK_BROWSER_LIB:numberMARK_BROWSER_LIB:number',
    ])
    // The server build loads (and would crash on) no browser-only package.
    expect((await build.ssr.run(run)).result).toEqual([
      { thrown: expect.anything() },
      'server',
      { thrown: expect.anything() },
      'server',
    ])
  })
})
