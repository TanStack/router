import { expect, test } from 'vitest'
import {
  callProvider,
  compileAll,
  compileFor,
  outputs,
} from '../regression-helpers'
import { getModuleErrors } from '../validate-module'

const head = `import { createServerFn } from '@tanstack/react-start'\n`
const top = `export const top = createServerFn().handler(async () => 'top')\n`
const inFunction = `export function make() {
  const fn = createServerFn().handler(async () => 'nested')
  return fn
}`
const inSwitchCase = `export function pick(kind: string) {
  switch (kind) {
    case 'a':
      const fn = createServerFn().handler(async () => 'nested')
      return fn
  }
}`

// A `createServerFn` declared below the module top level must not produce an
// invalid module, and top-level server fns next to it are still extracted.
// Rejecting it with a compile error is valid too, but not crashing on it.
// Known limitation on main: only module-level declarations are extracted; the
// nested one is left untransformed, so its handler ships to the client. Which
// nested server fns are extracted is left open here.
test.each([
  { name: 'a function', code: inFunction, topLevel: [] },
  {
    name: 'a switch case inside a function',
    code: inSwitchCase,
    topLevel: [],
  },
  {
    name: 'a switch case at the module top level',
    code: `switch (import.meta.env.MODE) {
  case 'a':
    const fn = createServerFn().handler(async () => 'nested')
    console.log(fn)
}`,
    topLevel: [],
  },
  {
    name: 'a function next to a top-level one',
    code: `${top}${inFunction}`,
    topLevel: ['top'],
  },
  {
    name: 'a switch case next to a top-level one',
    code: `${top}${inSwitchCase}`,
    topLevel: ['top'],
  },
])(
  'a server fn declared in $name compiles to valid modules or is rejected',
  async ({ code, topLevel }) => {
    const errors: Record<string, Array<string>> = {}
    for (const output of outputs) {
      let result: Awaited<ReturnType<typeof compileFor>>
      try {
        result = await compileFor(output, `${head}${code}`)
      } catch (error) {
        expect((error as Error).message, output).not.toMatch(
          /Expected createServerFn declaration in a statement list/,
        )
        continue
      }
      errors[output] =
        result.code === null ? [] : await getModuleErrors(result.code)
      if (output === 'client') {
        const extractedNames = Object.values(result.serverFns).map(
          (fn) => fn.functionName,
        )
        expect(extractedNames).toEqual(
          expect.arrayContaining(
            topLevel.map((name) => `${name}_createServerFn_handler`),
          ),
        )
      }
    }
    for (const [output, moduleErrors] of Object.entries(errors)) {
      expect(moduleErrors, output).toEqual([])
    }
  },
)

// A server fn must be a variable initializer; anywhere else it is rejected
// in every output instead of being shipped untransformed.
// Known limitation on main: with createServerFn as the only factory import
// these modules are returned untransformed, so the extra import is needed.
const rejectionHead = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'\n`
test.each([
  {
    name: 'an object property',
    code: `export const api = { read: createServerFn().handler(async () => 1) }`,
    error: 'createServerFn must be assigned to a variable!',
  },
  {
    name: 'a class field',
    code: `export class Api { read = createServerFn().handler(async () => 1) }`,
    error: 'createServerFn must be assigned to a variable!',
  },
  {
    name: 'an anonymous default export',
    code: `export default createServerFn().handler(async () => 1)`,
    error: 'createServerFn must be assigned to a variable!',
  },
  {
    name: 'an assignment',
    code: `export let fn\nfn = createServerFn().handler(async () => 1)`,
    error: 'createServerFn must be assigned to a variable!',
  },
  {
    name: 'a validator call without a validator',
    code: `export const fn = createServerFn().validator().handler(async () => 1)`,
    error: 'createServerFn().validator() must be called with a validator!',
  },
])('rejects $name', async ({ code, error }) => {
  for (const output of outputs) {
    await expect(
      compileFor(output, `${rejectionHead}${code}`),
      output,
    ).rejects.toThrow(error)
  }
})

// Sources: TanStack/router#5496 and #5892, where `.handler<T>(...)` was not
// recognized as a server fn and its body reached the client.
test.each([
  { name: 'a type argument', handler: `.handler<number>(() => 1)` },
  {
    name: 'a Promise type argument',
    handler: `.handler<Promise<{ secret: number }>>(async () => ({ secret: 1 }))`,
  },
])('extracts a server fn whose handler has $name', async ({ handler }) => {
  const compiled = await compileAll(
    `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn({ method: 'GET' })${handler}`,
  )
  expect(Object.keys(compiled.serverFns)).toHaveLength(1)
  expect(compiled.client).not.toMatch(/=>\s*(1|\(\{ secret: 1 \}\))/)
  expect(await callProvider(compiled.provider, 'fn')).toEqual(
    handler.includes('secret') ? { secret: 1 } : 1,
  )
})
