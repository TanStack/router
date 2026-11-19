import { describe, expect, test } from 'vitest'
import {
  compileCode,
  compileFor,
  evaluateModule,
  importSources,
} from '../regression-helpers'

// A test run compiles a server module that declares server functions as the
// caller and the provider at once (`singleServerFnModule`), so that the file
// is evaluated once and its handlers share its state with its other code.

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const single = { singleServerFnModule: true }

async function compileSingle(code: string, options = {}) {
  const compiled = await compileFor('ssr', code, { ...single, ...options })
  expect(compiled.code).not.toBeNull()
  return { code: compiled.code!, serverFns: compiled.serverFns }
}

describe('a server module of a test run', () => {
  test('runs a handler in the module that declares it', async () => {
    const { code } = await compileSingle(`${head}let count = 0
export const increment = createServerFn().handler(() => ++count)
export function read() {
  return count
}`)
    const module = await evaluateModule(code)

    expect(await module.increment()).toBe(1)
    expect(module.read()).toBe(1)
  })

  test('keeps the exports of the module and adds none', async () => {
    const { code } =
      await compileSingle(`${head}const local = createServerFn().handler(() => 'local')
export const exported = createServerFn().handler(() => 'exported')
export const callLocal = () => local()
export default 1`)
    const module = await evaluateModule(code)

    expect(Object.keys(module).sort()).toEqual([
      'callLocal',
      'default',
      'exported',
    ])
    expect(await module.exported()).toBe('exported')
    expect(await module.callLocal()).toBe('local')
  })

  test('keeps what only a handler imports', async () => {
    const { code } =
      await compileSingle(`${head}import { db } from './db.server'
export const fn = createServerFn().handler(() => db.x())`)

    expect(importSources(code)).toEqual(['./db.server'])
    const module = await evaluateModule(code, {
      './db.server': `export const db = { x: () => 'x' }`,
    })
    expect(await module.fn()).toBe('x')
  })

  test('reports its server functions under the ids of the other outputs', async () => {
    const code = `${head}export const fn = createServerFn().handler(() => 1)`
    const caller = await compileFor('ssr', code)
    const { serverFns } = await compileSingle(code)

    expect(Object.keys(serverFns)).toHaveLength(1)
    expect(serverFns).toEqual(caller.serverFns)
  })

  test('gets no directive of the provider module', async () => {
    const { code } = await compileSingle(
      `${head}export const fn = createServerFn().handler(() => 1)`,
      { directives: ['use server-entry'] },
    )

    expect(code).not.toContain('use server-entry')
  })
})

describe('the other outputs of a test run', () => {
  const code = `${head}import { db } from './db.server'
export const fn = createServerFn().handler(() => db.x())`

  test('the client module calls over RPC', async () => {
    expect(await compileCode('client', code, single)).toBe(
      await compileCode('client', code),
    )
  })

  // A request to the URL of a server function resolves to this module.
  test('the provider module is still there', async () => {
    expect(await compileCode('provider', code, single)).toBe(
      await compileCode('provider', code),
    )
  })
})
