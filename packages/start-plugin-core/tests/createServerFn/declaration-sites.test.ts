import { expect, test } from 'vitest'
import { compileFor, outputs } from '../regression-helpers'
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

// Only module-level `createServerFn` declarations are extracted. One declared
// below the module top level must neither make the compiler throw nor produce
// an invalid module, and top-level server fns next to it are still extracted.
// Known limitation on main: the nested one is left untransformed, so its
// handler ships to the client.
test.each([
  { name: 'a function', code: inFunction, extracted: [] },
  {
    name: 'a switch case inside a function',
    code: inSwitchCase,
    extracted: [],
  },
  {
    name: 'a switch case at the module top level',
    code: `switch (import.meta.env.MODE) {
  case 'a':
    const fn = createServerFn().handler(async () => 'nested')
    console.log(fn)
}`,
    extracted: [],
  },
  {
    name: 'a function next to a top-level one',
    code: `${top}${inFunction}`,
    extracted: ['top'],
  },
  {
    name: 'a switch case next to a top-level one',
    code: `${top}${inSwitchCase}`,
    extracted: ['top'],
  },
])(
  'a server fn declared in $name compiles to valid modules',
  async ({ code, extracted }) => {
    const errors: Record<string, Array<string>> = {}
    let extractedNames: Array<string> = []
    for (const output of outputs) {
      const result = await compileFor(output, `${head}${code}`)
      errors[output] =
        result.code === null ? [] : await getModuleErrors(result.code)
      if (output === 'client') {
        extractedNames = Object.values(result.serverFns).map(
          (fn) => fn.functionName,
        )
      }
    }
    expect(errors).toEqual({ client: [], ssr: [], provider: [] })
    expect(extractedNames).toEqual(
      extracted.map((name) => `${name}_createServerFn_handler`),
    )
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
