import { describe, expect, test } from 'vitest'
import {
  compileCode,
  compileHydrate,
  evaluateModule,
  importSources,
} from './regression-helpers'
import { declarationOf, getModuleErrors } from './validate-module'

// The compiler removes code that only served a transformed call. Everything
// else is user code that must survive, even when nothing seems to read it.

// A declaration that only references itself, or a sibling that references
// it back, is still live: its initializer runs side effects.
test.each([
  {
    name: 'a self-clearing interval',
    sideEffect: 'setInterval(',
    declared: ['interval'],
    code: `import { createServerFn } from '@tanstack/react-start'
const interval = setInterval(() => {
  clearInterval(interval)
}, 1000)
export const fn = createServerFn().handler(async () => 1)`,
  },
  {
    name: 'mutually-referencing declarations',
    sideEffect: 'createPersister(',
    declared: ['persister', 'restore'],
    code: `import { createServerFn } from '@tanstack/react-start'
import { createPersister } from './persist'
const persister = createPersister({ onRestore: () => restore() })
function restore() {
  persister.restore()
}
export const fn = createServerFn().handler(async () => 1)`,
  },
])('keeps $name', async ({ code, sideEffect, declared }) => {
  const client = await compileCode('client', code)
  expect(client).toContain(sideEffect)
  // The validator does not report references to undeclared names.
  for (const name of declared) {
    expect(client).toMatch(declarationOf(name))
  }
  expect(await getModuleErrors(client!)).toEqual([])
})

// TypeScript erases type positions, so a declaration whose binding only
// appears in a type is still live JavaScript: its initializer runs once at
// import time.
describe('keeps a declaration only referenced from types', () => {
  const typeQuery = {
    name: 'a typeof type query',
    marker: 'analytics-marker',
    declared: 'analytics',
    imported: './analytics',
    code: `import { createServerFn } from '@tanstack/react-start'
import { registerAnalytics } from './analytics'
const analytics = registerAnalytics('analytics-marker')
type Analytics = typeof analytics
export function describeClient(client?: Analytics) {
  return client ? 'custom' : 'default'
}
export const getPosts = createServerFn().handler(async () => [])`,
  }
  const globalAugmentation = {
    name: 'a global augmentation',
    marker: 'store-marker',
    declared: 'store',
    imported: './store',
    code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { createStore } from './store'
const store = createStore('store-marker')
declare global {
  interface Window {
    appStore?: typeof store
  }
}
export const getKind = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')`,
  }

  test.each([
    { output: 'client', ...typeQuery },
    { output: 'client', ...globalAugmentation },
    { output: 'provider', ...typeQuery },
  ] as const)(
    '$output: $name',
    async ({ output, code, marker, declared, imported }) => {
      const compiled = await compileCode(output, code)
      expect(compiled).toContain(marker)
      expect(compiled).toMatch(declarationOf(declared))
      expect(importSources(compiled!)).toContain(imported)
      expect(await getModuleErrors(compiled!)).toEqual([])
    },
  )
})

test('accepts a TypeScript type and a value exported under the same name', async () => {
  const client = await compileCode(
    'client',
    `import { createServerFn } from '@tanstack/react-start'
export type User = { name: string }
function User(name: string): User {
  return { name }
}
export { User }
export const getUser = createServerFn().handler(async () => User('Ada'))`,
  )
  const module = await evaluateModule(client!)
  expect(module.User('Ada')).toEqual({ name: 'Ada' })
})

test('keeps a React import the classic JSX runtime needs', async () => {
  // With the classic runtime the bundler compiles JSX to React.createElement
  // after this compiler ran, so an import only used in types is still needed.
  const client = await compileCode(
    'client',
    `import * as React from 'react'
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => 'hi')
export function Greeting({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>
}`,
  )
  expect(importSources(client!)).toEqual(['react'])
})

test('keeps a namespace only read through a TypeScript import alias', async () => {
  // `import red = Labels.red` compiles to `var red = Labels.red`.
  const client = await compileCode(
    'client',
    `import { createServerFn } from '@tanstack/react-start'
namespace Labels {
  export const red = 'red'
}
import red = Labels.red
export const label = red
export const fn = createServerFn().handler(async () => red)`,
  )
  expect((await evaluateModule(client!)).label).toBe('red')
})

// An empty destructuring pattern binds nothing, but its initializer still
// runs.
// Source: babel-dead-code-elimination "object pattern" > "unzips if all
// variables are unused", "array pattern" > "unzips if all variables are
// unused"
test.each(['client', 'provider'] as const)(
  '%s: keeps the initializers of empty destructuring patterns',
  async (output) => {
    const result = await compileCode(
      output,
      `import { createServerFn } from '@tanstack/react-start'
import { init, other } from './init'
const {} = init()
const [] = other()
const { a: {} } = init()
export const fn = createServerFn().handler(async () => 'ok')`,
    )
    const calls: Array<string> = []
    await evaluateModule(result!, {
      './init': {
        init: () => {
          calls.push('init')
          return { a: {} }
        },
        other: () => {
          calls.push('other')
          return []
        },
      },
    })
    expect(calls).toEqual(['init', 'other', 'init'])
  },
)

// Source: typescript-eslint type-assertion/increment/as-increment.js,
// type-assertion/increment/non-null-increment.js, type-assertion/satisfies.js
test('keeps the parentheses of asserted update operands', async () => {
  const client = await compileCode(
    'client',
    `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => 1)
let count = 0
export function bump() {
  ;(count as number)++
  ;(count satisfies number)++
  count!++
  ;(count as any) += 1
  return count
}`,
  )
  expect(await getModuleErrors(client!)).toEqual([])
  expect((await evaluateModule(client!)).bump()).toBe(4)
})

// Bundlers read these comments: minifiers keep legal comments, and Rollup and
// Rolldown treat calls of functions annotated `__NO_SIDE_EFFECTS__` as pure.
describe('keeps the comments bundlers read', () => {
  const legal = '/*! Example Corp. | MIT License */'

  test('client: a leading legal comment survives the removal of the import it leads', async () => {
    const client = await compileCode(
      'client',
      `${legal}
import { createIsomorphicFn } from '@tanstack/react-start'
const where = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')
export const label = () => where()`,
    )
    expect(client).toContain(legal)
  })

  test('client: a Hydrate chunk keeps the leading legal comment of its module', async () => {
    const { chunks } = await compileHydrate(
      'client',
      `${legal}
import { Hydrate } from '@tanstack/react-start'
export function Page() {
  return <Hydrate><p>hi</p></Hydrate>
}`,
    )
    expect(chunks[0]).toContain(legal)
  })

  test.each([
    {
      name: 'function',
      code: `/* #__NO_SIDE_EFFECTS__ */
export function makeLabel() {
  return 'label'
}`,
    },
    {
      name: 'arrow function',
      code: `/* @__NO_SIDE_EFFECTS__ */
export const makeLabel = () => 'label'`,
    },
  ])(
    'the annotation of an exported $name copied to a Hydrate chunk and the provider',
    async ({ code }) => {
      const source = `import { Hydrate, createServerFn } from '@tanstack/react-start'
${code}
export const fn = createServerFn().handler(async () => makeLabel())
export function Page() {
  return <Hydrate><p>{makeLabel()}</p></Hydrate>
}`
      const { chunks } = await compileHydrate('client', source)
      const provider = await compileCode('provider', source)
      for (const output of [chunks[0]!, provider!]) {
        expect(output).toMatch(
          /__NO_SIDE_EFFECTS__ \*\/\s*(?:function|const) makeLabel\b/,
        )
      }
    },
  )
})
