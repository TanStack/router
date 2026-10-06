/**
 * Edge cases ported from the `@vitejs/plugin-rsc` transform tests
 * (vitejs/vite-plugin-react, packages/plugin-rsc/src/transforms, MIT).
 * plugin-rsc hoists inline `'use server'` functions out of their scope and
 * analyses which outer bindings they close over; the code splitter moves
 * route components into virtual modules together with the module-level code
 * they read. Each test names the plugin-rsc fixture it is ported from.
 */
import { describe, expect, it } from 'vitest'
import { compileRouteModules, evaluateModule } from './regression-helpers'
import { getModuleErrors } from './validate-module'

function compileReference(code: string) {
  return compileRouteModules(code).modules.reference!
}

function compileComponent(code: string) {
  return compileRouteModules(code).modules['virtual component']!
}

const route = (
  body: string,
) => `import { createFileRoute } from '@tanstack/react-router'
${body}
export const Route = createFileRoute('/')({ component: Page })
`

describe('split route components keep the module bindings they read', () => {
  it.each([
    {
      // hoist/function-hoist-block.js
      name: 'past a function declared in a nested block',
      body: `const value = 'outer'
function Page() {
  const seen = value
  {
    function value() {}
  }
  return seen
}`,
      expected: 'outer',
    },
    {
      // scope/param-default-var-hoisting.js
      name: 'from a parameter default next to a var of the same name',
      body: `const value = 'outer'
function Page(props, seen = value) {
  var value = 'inner'
  return seen + ':' + value
}`,
      expected: 'outer:inner',
    },
    {
      // scope/label.js
      name: 'next to a label of the same name',
      body: `const value = 'outer'
function Page() {
  value: for (const item of [1]) {
    if (item) {
      break value
    }
  }
  return value
}`,
      expected: 'outer',
    },
    {
      // hoist/catch-binding-shadow.js; React Compiler try-catch-* fixtures
      name: 'next to a catch parameter of the same name',
      body: `const err = { message: 'outer' }
function Page() {
  const readOuter = () => err.message
  try {
    throw new Error('inner')
  } catch (err) {
    return err.message + ':' + readOuter()
  }
}`,
      expected: 'inner:outer',
    },
    {
      // hoist/computed-destructuring-key-captures-outer-binding.js
      name: 'through a computed destructuring key',
      body: `const key = 'value'
function Page() {
  const { [key]: picked } = { value: 'picked' }
  return picked
}`,
      expected: 'picked',
    },
    {
      // hoist/class-declaration-in-body.js
      name: 'from a class declared in the component',
      body: `const config = { value: 'config' }
function Page() {
  class Helper {
    run() {
      return config.value
    }
  }
  return new Helper().run()
}`,
      expected: 'config',
    },
    {
      // hoist/var-hoist-block.js, hoist/shadow-var-nested-block.js
      name: 'unless a var in a nested block shadows them',
      body: `const value = 'outer'
function Page() {
  if (Math.random() < 2) {
    var value = 'inner'
  }
  return value
}`,
      expected: 'inner',
    },
  ])('$name', async ({ body, expected }) => {
    const code = route(body)
    const component = compileComponent(code)
    expect(await getModuleErrors(component)).toEqual([])
    const module = await evaluateModule(component)
    expect(module.component!({})).toBe(expected)
    expect(await getModuleErrors(compileReference(code))).toEqual([])
  })
})

describe('reference modules keep imports read through nested scopes', () => {
  it.each([
    {
      // hoist/function-hoist-block.js
      name: 'past a function declared in a nested block',
      loader: `() => {
  {
    function store() {}
  }
  return store.value
}`,
    },
    {
      // scope/param-default-var-hoisting.js
      name: 'from a parameter default next to a var of the same name',
      loader: `(ctx, value = store.value) => {
  var store = 'local'
  return value
}`,
    },
    {
      // hoist/catch-binding-shadow.js
      name: 'in a try block whose catch parameter shadows it',
      loader: `() => {
  try {
    return store.value
  } catch (store) {
    return store
  }
}`,
    },
  ])('$name', async ({ loader }) => {
    const reference =
      compileReference(`import { createFileRoute } from '@tanstack/react-router'
import { store } from './store'
function Page() {
  return 'page'
}
export const Route = createFileRoute('/')({ loader: ${loader}, component: Page })
`)
    expect(await getModuleErrors(reference)).toEqual([])
    expect(reference).toMatch(/import \{ store \} from ['"]\.\/store['"]/)
  })
})

describe('route modules with a directive prologue', () => {
  // utils.test.ts "recognizes directive prologues", mixed-directives
  it("keeps 'use strict' and 'use client' first in every output", async () => {
    const code = `'use strict'
'use client'
${route(`function Page() {
  return 'page'
}`)}`
    const prologue = /^\s*(["'])use strict\1;?\s*(["'])use client\2/
    const reference = compileReference(code)
    const component = compileComponent(code)
    for (const output of [reference, component]) {
      expect(await getModuleErrors(output)).toEqual([])
      expect(output).toMatch(prologue)
    }
  })
})
