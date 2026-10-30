/**
 * Controls of the public in-process plugin host (plugin-host.ts), fast
 * tier: the plugins a user configures run in a real Vite dev server
 * (middleware mode) on an app on disk, and the host hands the test what a
 * user gets, by resolved module, not by spelling:
 * - server code evaluates through the environment's module runner; a module
 *   reached through different specifiers (relative, root-absolute, through a
 *   plugin's virtual module) is one instance;
 * - an edit settles and the next evaluation sees it;
 * - what a plugin reports on any channel is in `diagnostics`.
 * The plugins here stand for any public plugin: nothing in the host knows
 * them (no hook placement, id or query).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, onTestFinished, test } from 'vitest'
import { expectNoProblems, problems } from '../src/diagnostic-channel'
import { expectDiagnostic } from '../src/diagnostics'
import { createPluginHost } from '../src/plugin-host'
import type { Plugin } from 'vite'

const testsDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * A plugin as a user configures one: serves `virtual:counter` (a module
 * that re-exports the app's counter through a root-absolute specifier) and
 * rewrites `__MARK__` in the app's modules.
 */
function userPlugin(options: { warn?: 'console' | 'context' } = {}): Plugin {
  return {
    name: 'user-plugin',
    resolveId(id) {
      return id === 'virtual:counter' ? '\0virtual:counter' : null
    },
    load(id) {
      return id === '\0virtual:counter'
        ? `export { count, increment } from '/src/counter.ts'\n`
        : null
    },
    transform(code, id) {
      if (!id.includes('/src/') || !code.includes('__MARK__')) {
        return null
      }
      if (options.warn === 'console') {
        console.warn(`[user-plugin] rewrote a marker in ${id}`)
      } else if (options.warn === 'context') {
        this.warn(`rewrote a marker in ${id}`)
      }
      return code.replaceAll('__MARK__', 'MARKED')
    },
  }
}

const files = {
  'src/counter.ts': `export let count = 0
export const increment = () => ++count
`,
  'src/server.ts': `import { increment } from './counter'
import { count, increment as viaVirtual } from 'virtual:counter'
import { count as viaRoot } from '/src/counter.ts'
export const marker = '__MARK__'
export const run = () => {
  increment()
  viaVirtual()
  return { count, viaRoot }
}
`,
}

async function host(warn?: 'console' | 'context') {
  return createPluginHost({
    dir: testsDir,
    registerCleanup: onTestFinished,
    files,
    plugins: [userPlugin({ warn })],
  })
}

test('server code runs through the module runner; a module is one instance whatever the specifier', async () => {
  const app = await host()
  const server = await app.importServer('/src/server.ts')
  expect(server.marker).toBe('MARKED')
  // Two increments through two spellings, read through a third: one module
  expect(server.run()).toEqual({ count: 2, viaRoot: 2 })
  expect(await app.transform('/src/server.ts', 'ssr')).toContain('MARKED')
})

test('an edit settles; the next evaluation runs the edited module', async () => {
  const app = await host()
  expect((await app.importServer('/src/server.ts')).marker).toBe('MARKED')
  await app.edit({
    'src/server.ts': `export const marker = 'edited __MARK__'\n`,
  })
  expect((await app.importServer('/src/server.ts')).marker).toBe(
    'edited MARKED',
  )
})

test.each(['console', 'context'] as const)(
  'a plugin warning through %s is in the merged diagnostics',
  async (warn) => {
    const app = await host(warn)
    const since = app.diagnostics.length
    await app.importServer('/src/server.ts')
    const reported = app.diagnostics.slice(since)
    expectDiagnostic(problems(reported), {
      severity: 'warning',
      file: 'src/server.ts',
      root: app.root,
    })
    expect(() => expectNoProblems(reported)).toThrow()
    // The dev server's text log reads the same channels
    expect(app.dev.logs.some((log) => log.includes('rewrote a marker'))).toBe(
      true,
    )
  },
)

test('nothing reported: a quiet plugin leaves no problem on any channel', async () => {
  const app = await host()
  await app.importServer('/src/server.ts')
  expectNoProblems(app.diagnostics)
})

test('two live apps keep console diagnostics scoped to their own work', async () => {
  const [first, second] = await Promise.all([host('console'), host('console')])
  await Promise.all([
    first.importServer('/src/server.ts'),
    second.importServer('/src/server.ts'),
  ])
  for (const [app, other] of [
    [first, second],
    [second, first],
  ]) {
    expectDiagnostic(app!.diagnostics, {
      severity: 'warning',
      file: 'src/server.ts',
      root: app!.root,
      times: 1,
    })
    expect(
      app!.diagnostics.some(({ text }) => text.includes(other!.root)),
    ).toBe(false)
  }
})
