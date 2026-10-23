/**
 * Outside the compiler corpus: harness controls of the public Start host
 * (`../start-host.ts`) and the test kit on it (`../regression-helpers.ts`,
 * `../diagnostics.ts`). They check the oracle, not the compiler (ctu
 * AGENTS.md, "Harness controls"): each helper observes what it claims to,
 * through the real tools, and fails on the wrong behaviour it exists to
 * catch (a wrong output is simulated with a user Vite plugin, a public
 * extension point, never by changing the compiler).
 */
import { afterAll, describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  Thrown,
  callFromClient,
  callOnServer,
  compileError,
  createStartHost,
  expectCompileError,
  expectNoClientHandler,
  fromPage,
  inPage,
  serveCase,
  serverFnUrls,
  throwsError,
  useStartHost,
} from '../regression-helpers'
import type { PageSettled, StartHost } from '../regression-helpers'
import type { Plugin } from 'vite'

const host = useStartHost()

describe('loads', () => {
  test('lists the static imports of the module and of the modules it imports, and the targets of its dynamic imports', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `import { a } from './a'
import './side-effect'
export { b } from './b'
export const load = () => import('./lazy')
export const value = a`,
      'a.ts': `export { a } from './deep'\n`,
      'deep.ts': `export const a = 'a'\n`,
      'side-effect.ts': `globalThis.sideEffect = true\n`,
      'b.ts': `export const b = 'b'\n`,
      'lazy.ts': `export const lazy = 'lazy'\n`,
    })
    expect(await startCase.loads()).toEqual(
      expect.arrayContaining([
        './a',
        './deep',
        './side-effect',
        './b',
        './lazy',
      ]),
    )
  })

  test('does not list a module a type-only import or a string names', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `import type { T } from './types'
const text = "import x from './in-a-string'"
export const value: T | string = text`,
      'types.ts': `export type T = string\n`,
      'in-a-string.ts': `export default 1\n`,
    })
    const loads = await startCase.loads()
    expect(loads).not.toContain('./types')
    expect(loads).not.toContain('./in-a-string')
  })

  test('lists a module whose top-level code throws', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `import { db } from './db.server'
export const value = db.x()`,
      'db.server.ts': `throw new Error('server-only module evaluated')\nexport const db = {}\n`,
    })
    expect(await startCase.loads()).toContain('./db.server')
  })

  test('fails for a module that does not link', async () => {
    const startCase = await (
      await host()
    ).case({
      'module.tsx': `import { missing } from './other'
export const value = missing`,
      'other.ts': `export const present = 1\n`,
    })
    await expect(startCase.loads()).rejects.toThrow('did not load')
  })
})

// Concurrent tests share a file's host: each page run holds a page of the
// host alone, so what a run reports is its own.
describe.concurrent('page runs of concurrent tests', () => {
  for (const name of ['first', 'second', 'third']) {
    test(`a run reports only its own page errors and requests (${name})`, async () => {
      const startCase = await (
        await host()
      ).case({
        'module.tsx': `import { own } from './own-${name}'
export const value = own
`,
        [`own-${name}.ts`]: `export const own = 'MARK_${name}'\n`,
      })
      const run = await startCase.client<string>(`// The runs overlap
await new Promise((resolve) => setTimeout(resolve, 300))
console.error('MARK_ERROR_${name}')
return module.value`)
      expect(run.result).toBe(`MARK_${name}`)
      expect(run.errors).toEqual([`MARK_ERROR_${name}`])
      expect(
        run.requests.filter((request) => request.includes('/own-')),
      ).toEqual([`${startCase.dir.replace(/^/, '/')}/own-${name}.ts`])
    })
  }
})

describe('server fn calls', () => {
  const code = `import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
export const where = createServerFn().handler(() => ({
  window: typeof window,
  path: getRequestUrl().pathname,
}))
export const other = createServerFn().handler(() => 'other')
export const plain = () => 'plain'`

  test('a client call reaches the handler on the server, through its own request', async () => {
    const startCase = await serveCase(await host(), { 'module.tsx': code })
    const result = (await callFromClient(startCase, 'module.where')) as {
      window: string
      path: string
    }
    expect(result.window).toBe('undefined')
    expect(result.path).not.toBe('/harness-probe')
  })

  test('a server call runs the handler inside the request it is made in', async () => {
    const startCase = await serveCase(await host(), { 'module.tsx': code })
    expect(await callOnServer(startCase, 'module.where')).toEqual({
      window: 'undefined',
      path: '/harness-probe',
    })
  })

  test('serverFnUrls counts the server fns by their distinct urls', async () => {
    const startCase = await serveCase(await host(), { 'module.tsx': code })
    expect(await serverFnUrls(startCase)).toHaveLength(2)
  })

  test('a throw in the page comes back as a Thrown with its message', async () => {
    const startCase = await serveCase(await host(), {
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
export const secret = createServerOnlyFn(() => 'secret')`,
    })
    const settled = await inPage<PageSettled>(
      startCase,
      'return settle(() => module.secret())',
    )
    const thrown = fromPage(settled)
    expect(thrown).toBeInstanceOf(Thrown)
    expect(thrown).toEqual(throwsError)
  })
})

describe('compile errors', () => {
  test('compileError gives the error a transform throws, with its position', async () => {
    const source = `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler()`
    const startCase = await (await host()).case({ 'module.tsx': source })
    const error = await compileError(startCase)
    expectCompileError(error, {
      source,
      at: 'createServerFn()',
    })
    expect(
      await compileError(
        await (await host()).case({ 'module.tsx': 'export const a = 1\n' }),
      ),
    ).toBeUndefined()
  })
})

/**
 * A user plugin that makes the client output of every case module ship a
 * handler body that reads the server-only module: what a broken compiler
 * would serve.
 */
function leakHandler(): Plugin {
  return {
    name: 'start-host-control:leak',
    applyToEnvironment: (environment) => environment.name === 'client',
    enforce: 'post',
    transform(code, id) {
      if (!/\/src\/cases\/c\d+\/module\.tsx$/.test(id.split('?')[0]!)) {
        return null
      }
      return `${code}
import { db as __leakedDb } from './db.server'
export const __leaked = () => __leakedDb.inner()
`
    },
  }
}

describe('expectNoClientHandler', () => {
  const misplaced = `import { createServerFn } from '@tanstack/react-start'
import { db } from './db.server'
export function make() {
  return createServerFn().handler(() => db.inner())
}`
  let leaking: StartHost | undefined
  afterAll(() => leaking?.close())

  test('fails when the client loads the server-only module', async () => {
    leaking = await createStartHost({ plugins: [leakHandler()] })
    await expect(expectNoClientHandler(leaking, misplaced)).rejects.toThrow(
      'forbidden modules that loaded',
    )
  })
})

describe('production preview', () => {
  let built: StartHost | undefined
  afterAll(() => built?.close())

  test('cases run against the build, and dev-server reads throw', async () => {
    built = await createStartHost({ serve: false })
    const startCase = await built.case({
      'module.tsx': `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(() => 'built')
export const plain = 'plain'`,
    })
    const { build } = await built.preview()
    expect(Object.keys(build.environments)).toEqual(
      expect.arrayContaining(['client', 'ssr']),
    )
    expect(await callFromClient(startCase, 'module.fn')).toBe('built')
    expect(await callOnServer(startCase, 'module.fn')).toBe('built')
    expect(await inPage(startCase, 'return module.plain')).toBe('plain')
    await expect(startCase.served()).rejects.toThrow('dev server')
    expectNotLoaded([], [])
  }, 60_000)
})
