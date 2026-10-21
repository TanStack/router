/**
 * Modules import protection denies on the server (by default `**\/*.client.*`
 * files and modules marked `@tanstack/react-start/client-only`), used only by
 * client-only code, are eliminated from the server build: a default-config
 * Start build reports no import-protection violation, the server bundle
 * holds none of their code, and each environment runs its implementation.
 * Source: user ruling 2026-10-18 (E1 ASK-1).
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { envRestrictionError } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'
import { reportedViolations } from '../importProtection/start-apps'
import type { StartBuild } from '../build-harness'

const timeout = 60_000

const files = {
  'src/chart.client.ts': `export const draw = () => 'MARK_CHART'\n`,
  'src/paint.ts': `import '@tanstack/react-start/client-only'
export const paint = () => 'MARK_PAINT'
`,
  'src/entry.ts': `import { createClientOnlyFn, createIsomorphicFn } from '@tanstack/react-start'
import { draw } from './chart.client'
import { paint } from './paint'
export const render = createClientOnlyFn(() => draw())
export const repaint = createIsomorphicFn()
  .server(() => 'server')
  .client(() => paint())
`,
}

/** What `render()` and `repaint()` give in an environment of the build. */
const run = `const settle = (fn) => {
  try {
    return fn()
  } catch (error) {
    return { thrown: { name: error.name, message: error.message } }
  }
}
return [settle(entry.render), settle(entry.repaint)]`

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
    ]).toEqual(['nowhere', 'nowhere'])
  })

  test('each environment runs its implementation', async () => {
    expect((await build.client.run(run)).result).toEqual([
      'MARK_CHART',
      'MARK_PAINT',
    ])
    expect((await build.ssr.run(run)).result).toEqual([
      { thrown: envRestrictionError('client') },
      'server',
    ])
  })
})
