import { describe, expect, test } from 'vitest'
import {
  callProvider,
  compileAll,
  compileErrorMessage,
  compileFor,
  outputs,
} from '../regression-helpers'

// A server fn must initialize a module-level variable: the provider module
// exports its extracted handler next to that declaration. Anywhere else it is
// rejected with a clear compile error in every output, whatever else the
// module imports, instead of shipping its handler and server-only imports to
// the client.

const notAssigned = 'createServerFn must be assigned to a variable!'
const nested =
  'createServerFn must be assigned to a top-level variable, not declared inside a function or block!'

const imports = {
  'createServerFn alone': {
    head: `import { createServerFn } from '@tanstack/react-start'\n`,
    tail: '',
  },
  'another Start factory': {
    head: `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'\n`,
    tail: `\nexport const serverOnly = createServerOnlyFn(() => db.top())`,
  },
}

describe.each(Object.entries(imports))(
  'with %s imported',
  (_, { head, tail }) => {
    test.each([
      {
        name: 'a function body',
        code: `export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`,
        error: nested,
      },
      {
        name: 'a function body next to a top-level server fn',
        code: `export const top = createServerFn().handler(async () => db.top())
export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`,
        error: nested,
      },
      {
        name: 'a switch case inside a function',
        code: `export function pick(kind: string) {
  switch (kind) {
    case 'a':
      const inner = createServerFn().handler(async () => db.inner())
      return inner
  }
}`,
        error: nested,
      },
      {
        name: 'a switch case at the module top level',
        code: `switch (import.meta.env.MODE) {
  case 'a':
    const inner = createServerFn().handler(async () => db.inner())
    console.log(inner)
}`,
        error: nested,
      },
      {
        name: 'a block at the module top level',
        code: `export const registry: Array<unknown> = []
{
  const inner = createServerFn().handler(async () => db.inner())
  registry.push(inner)
}`,
        error: nested,
      },
      {
        // Source: SolidStart compile.spec.ts "keeps client and server ids
        // aligned around nested server functions"
        name: 'the handler of another server fn',
        code: `export const outer = createServerFn().handler(async () => {
  const inner = createServerFn().handler(async () => db.inner())
  return typeof inner
})`,
        error: nested,
      },
      {
        name: 'an object property',
        code: `export const api = { read: createServerFn().handler(async () => db.inner()) }`,
        error: notAssigned,
      },
      {
        name: 'a class field',
        code: `export class Api { read = createServerFn().handler(async () => db.inner()) }`,
        error: notAssigned,
      },
      {
        name: 'an anonymous default export',
        code: `export default createServerFn().handler(async () => db.inner())`,
        error: notAssigned,
      },
      {
        name: 'an assignment',
        code: `export let fn
fn = createServerFn().handler(async () => db.inner())`,
        error: notAssigned,
      },
      {
        name: 'a function return value',
        code: `export function make() {
  return createServerFn().handler(async () => db.inner())
}`,
        error: notAssigned,
      },
      {
        name: 'a call argument',
        code: `register(createServerFn().handler(async () => db.inner()))`,
        error: notAssigned,
      },
      {
        // Source: Next.js server-actions fixtures server-graph/18, /19
        name: 'a JSX attribute',
        code: `export function Page() {
  return <form action={createServerFn().handler(async () => db.inner()) as any} />
}`,
        error: notAssigned,
      },
      {
        name: 'a conditional initializer',
        code: `export const fn = import.meta.env.SSR ? createServerFn().handler(async () => db.inner()) : null`,
        error: notAssigned,
      },
      {
        // Source: Next.js server-actions fixtures server-graph/56
        name: 'an object destructuring declarator',
        code: `export const { fn } = { fn: createServerFn().handler(async () => db.inner()) }`,
        error: notAssigned,
      },
      {
        // Source: Next.js server-actions fixtures server-graph/20
        name: 'an array destructuring declarator',
        code: `export const [fn] = [createServerFn().handler(async () => db.inner())]`,
        error: notAssigned,
      },
      {
        name: 'a validator call without a validator',
        code: `export const fn = createServerFn().validator().handler(async () => db.inner())`,
        error: 'createServerFn().validator() must be called with a validator!',
      },
    ])('every output rejects a server fn in $name', async ({ code, error }) => {
      const source = `${head}import { db } from './db.server'\n${code}${tail}`
      for (const output of outputs) {
        const thrown = await compileFor(output, source).then(
          () => undefined,
          (caught: unknown) => caught,
        )
        expect(thrown, output).toBeInstanceOf(Error)
        expect(compileErrorMessage(thrown), output).toContain(error)
      }
    })
  },
)

test('compileErrorMessage drops the code frame that quotes the source', async () => {
  const error = await compileFor(
    'client',
    `${imports['createServerFn alone'].head}const args: Array<() => unknown> = []
export const fn = createServerFn().handler(...args)`,
  ).catch((caught: unknown) => caught)
  expect((error as Error).message).toContain('export const fn')
  const message = compileErrorMessage(error)
  expect(message).toMatch(/handler\(\) must be called with an expression/)
  expect(message).not.toContain('export const fn')
})

test('a server fn created through an optional call chain compiles like a plain chain', async () => {
  const { client, provider } = await compileAll(
    `${imports['createServerFn alone'].head}export const fn = createServerFn()?.handler(async () => 'from the server')`,
  )
  expect(client).toContain('createClientRpc')
  expect(client).not.toContain('from the server')
  expect(await callProvider(provider, 'fn')).toBe('from the server')
})

test('a .ts module in a directory whose name contains # compiles as TypeScript', async () => {
  const { code } = await compileFor(
    'client',
    `${imports['createServerFn alone'].head}export const fn = createServerFn().handler(async ({ data }) => <string>data)`,
    { id: '/test/c#proj/src/module.ts' },
  )
  expect(code).toContain('createClientRpc')
})
