import { transformWithOxc } from 'vite'
import { afterEach, describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { declarationOf, getModuleErrors } from './validate-module'

// Inputs adapted from the React Compiler fixture corpus
// (facebook/react, compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler, MIT).

const filename = 'route.tsx'

/** Compiles a route file into every module the code splitter emits for it. */
function compileRouteModules(code: string) {
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: defaultCodeSplitGroupings,
  })
  const shared = sharedBindings.size > 0 ? sharedBindings : undefined
  const reference = compileCodeSplitReferenceRoute({
    code,
    filename,
    id: filename,
    addHmr: false,
    codeSplitGroupings: defaultCodeSplitGroupings,
    targetFramework: 'react',
    sharedBindings: shared,
  })
  const modules: Record<string, string> = {
    reference: reference?.code ?? code,
  }
  for (const targets of defaultCodeSplitGroupings) {
    const split = targets.join('-')
    modules[`virtual ${split}`] = compileCodeSplitVirtualRoute({
      code,
      filename: `${filename}?tsr-split=${split}`,
      splitTargets: targets,
      sharedBindings: shared,
    }).code
  }
  if (shared) {
    modules.shared = compileCodeSplitSharedRoute({
      code,
      sharedBindings: shared,
      filename: `${filename}?tsr-shared=1`,
    }).code
  }
  return modules
}

/**
 * Evaluates a self-contained module (no imports) like a bundler would: JSX
 * becomes plain function calls and intrinsic elements become tags.
 */
async function evaluateModule(code: string) {
  const { code: javascript } = await transformWithOxc(code, 'module.tsx', {
    jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' },
  })
  const runtime = `const Fragment = Symbol('Fragment')
const h = (type, props, ...children) => {
  const text = children.flat(Infinity).filter((c) => c != null && c !== false).join('')
  if (type === Fragment) return text
  if (typeof type === 'function') return type({ ...props, children: text })
  return '<' + type + '>' + text + '</' + type + '>'
}
`
  return (await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(runtime + javascript)}`
  )) as Record<string, (...args: Array<any>) => unknown>
}

const route = (
  body: string,
) => `import { createFileRoute } from '@tanstack/react-router'
${body}
export const Route = createFileRoute('/')({ component: Page })
`

describe('split route components keep the behaviour of unusual function bodies', () => {
  it.each([
    {
      // complex-while.js
      name: 'a labeled break out of nested loops',
      body: `const limit = 3
function Page() {
  let out = ''
  outer: for (let i = 0; i < 10; i++) {
    for (let j = 0; j < 10; j++) {
      if (i * j >= limit) break outer
      out += j
    }
  }
  return <p>{out}</p>
}`,
      expected: '<p>0123456789012</p>',
    },
    {
      // try-catch-* fixtures
      name: 'a catch parameter shadowing a module binding',
      body: `const error = 'module'
function Page() {
  let caught
  try {
    throw 'thrown'
  } catch (error) {
    caught = error
  }
  return <p>{caught}-{error}</p>
}`,
      expected: '<p>thrown-module</p>',
    },
    {
      // fn-name-no-leak-to-nested-arrow.js
      name: 'a named function expression shadowing a module binding',
      body: `const helper = () => 'module'
function Page() {
  const local = function helper(n) {
    return n > 0 ? helper(n - 1) : 'local'
  }
  return <p>{local(2)}/{helper()}</p>
}`,
      expected: '<p>local/module</p>',
    },
    {
      // destructure-*-default fixtures
      name: 'parameter destructuring defaults reading module bindings',
      body: `const fallback = 'fb'
function Page({ title = fallback, items: [first = fallback.toUpperCase()] = [] }) {
  return <p>{title}{first}</p>
}`,
      expected: '<p>fbFB</p>',
    },
    {
      // jsx-member-expression.js
      name: 'a JSX member tag on a module object',
      body: `const ui = { Badge: (props) => <b>{props.label}</b> }
function Page() {
  return <ui.Badge label="ok" />
}`,
      expected: '<b>ok</b>',
    },
    {
      // object-computed-access-assignment.js, object-method-shorthand.js
      name: 'computed keys and getters reading module bindings',
      body: `const KEY = 'k'
const suffix = '!'
function Page() {
  const obj = { [KEY]: 'v', get loud() { return this[KEY] + suffix } }
  return <p>{obj.loud}</p>
}`,
      expected: '<p>v!</p>',
    },
    {
      // hoisting-simple-function-declaration.js
      name: 'a hoisted local function reading a module binding declared later',
      body: `function Page() {
  const x = format()
  function format() {
    return prefix + 'x'
  }
  return <p>{x}</p>
}
const prefix = 'p-'`,
      expected: '<p>p-x</p>',
    },
    {
      // optional-call-chain-*.js
      name: 'optional call chains on module objects',
      body: `const helpers = { format: (v) => '[' + v + ']' }
function Page(props) {
  return <p>{helpers?.format?.(props.v)}{helpers.missing?.(1) ?? '-'}</p>
}`,
      expected: '<p>[a]-</p>',
      props: { v: 'a' },
    },
    {
      // for-of-destructure.js, for-in-statement.js
      name: 'for-of destructuring and for-in over module values',
      body: `const entries = new Map([['a', 1], ['b', 2]])
function Page() {
  let s = ''
  for (const [k, v] of entries) {
    s += k + v
  }
  for (const k in { x: 1 }) {
    s += k
  }
  return <p>{s}</p>
}`,
      expected: '<p>a1b2x</p>',
    },
    {
      // tagged-template-literal.js
      name: 'a tagged template with a module tag',
      body: `const tag = (strings, ...values) => strings.raw.join('|') + values.join(',')
function Page() {
  return <p>{tag\`a\${1}b\${2}c\`}</p>
}`,
      expected: '<p>a|b|c1,2</p>',
    },
    {
      // class fixtures (static blocks, private fields)
      name: 'a local class with a static block and a private field',
      body: `const base = 2
function Page() {
  class Counter {
    static start
    static {
      Counter.start = base * 2
    }
    #n = Counter.start
    get n() {
      return this.#n
    }
  }
  return <p>{new Counter().n}</p>
}`,
      expected: '<p>4</p>',
    },
  ])(
    'the split component renders like the original with $name',
    async ({ body, expected, props }) => {
      const modules = compileRouteModules(route(body))
      const errors: Record<string, Array<string>> = {}
      for (const [name, code] of Object.entries(modules)) {
        errors[name] = await getModuleErrors(code)
      }
      expect(errors).toEqual(
        Object.fromEntries(Object.keys(modules).map((name) => [name, []])),
      )
      expect(modules.reference).not.toMatch(declarationOf('Page'))
      const chunk = await evaluateModule(modules['virtual component']!)
      expect(chunk.component!(props ?? {})).toBe(expected)
    },
  )
})

describe('shared route modules keep side effects of shared functions', () => {
  afterEach(() => {
    delete (globalThis as { __portedTrack?: unknown }).__portedTrack
  })

  // Adapted from hook-ref-callback.js and
  // dont-memoize-primitive-function-call-non-escaping.js: a function shared by
  // the loader and the split component declares a local it never reads.
  it.each([
    { name: 'a call', initializer: 'track(id)' },
    { name: 'an optional call', initializer: 'track?.(id)' },
    { name: 'a member read of a call', initializer: 'track(id).length' },
  ])(
    'an unused local initialized by $name still runs',
    async ({ initializer }) => {
      const modules =
        compileRouteModules(`import { createFileRoute } from '@tanstack/react-router'
function track(label) {
  globalThis.__portedTrack.push(label)
  return label
}
function useShared(id) {
  const unused = ${initializer}
  return id
}
export const Route = createFileRoute('/')({
  loader: () => useShared('loader'),
  component: () => <p>{useShared('component')}</p>,
})
`)
      expect(modules.shared).toBeDefined()
      const calls: Array<string> = []
      ;(globalThis as { __portedTrack?: Array<string> }).__portedTrack = calls
      const shared = await evaluateModule(modules.shared!)
      expect(shared.useShared!('render')).toBe('render')
      expect(calls).toEqual(['render'])
    },
  )
})
