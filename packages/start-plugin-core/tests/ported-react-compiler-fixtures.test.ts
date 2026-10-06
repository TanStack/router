import { afterEach, describe, expect, test } from 'vitest'
import { compileStartModule } from './compile-start-module'
import { compileHydrate, renderChunk } from './regression-helpers'
import { getModuleErrors } from './validate-module'

// Inputs adapted from the React Compiler fixture corpus
// (facebook/react, compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler, MIT).

/** Compiles a module with one `<Hydrate>` boundary and loads its client chunk. */
async function compileHydrateChunk(code: string) {
  const { parent, chunks } = await compileHydrate('client', code)
  expect(chunks).toHaveLength(1)
  return { parent, chunk: chunks[0]! }
}

const hydratePage = (
  body: string,
) => `import { Hydrate } from '@tanstack/react-start'
import { visible } from '@tanstack/react-start/hydration'
${body}
export function Page(props) {
  return (
    <Hydrate when={visible()}>
      <Widget {...props} />
    </Hydrate>
  )
}
`

describe('Hydrate chunks keep the behaviour of unusual component bodies', () => {
  test.each([
    {
      // complex-while.js
      name: 'a labeled break out of nested loops',
      body: `const limit = 3
function Widget() {
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
function Widget() {
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
function Widget() {
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
function Widget({ title = fallback, items: [first = fallback.toUpperCase()] = [] }) {
  return <p>{title}{first}</p>
}`,
      expected: '<p>fbFB</p>',
    },
    {
      // hoisting-simple-function-declaration.js
      name: 'a hoisted local function reading a module binding declared later',
      body: `function Widget() {
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
function Widget(props) {
  return <p>{helpers?.format?.(props.v)}{helpers.missing?.(1) ?? '-'}</p>
}`,
      expected: '<p>[a]-</p>',
      props: { v: 'a' },
    },
    {
      // class fixtures (static blocks, private fields)
      name: 'a local class with a static block and a private field',
      body: `const base = 2
function Widget() {
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
    'client: the split child renders like the original with $name',
    async ({ body, expected, props }) => {
      const { parent, chunk } = await compileHydrateChunk(hydratePage(body))
      expect(await getModuleErrors(parent)).toEqual([])
      expect(await getModuleErrors(chunk)).toEqual([])
      expect(await renderChunk(chunk, { props: props ?? {} })).toBe(expected)
    },
  )
})

describe('Hydrate chunks keep side effects of component bodies', () => {
  afterEach(() => {
    delete (globalThis as { __portedTrack?: unknown }).__portedTrack
  })

  // Adapted from react-namespace.js (`const foo = React.useContext(FooContext)`
  // is never read), unused-optional-method-assigned-to-variable.js and
  // error.todo-reassign-const.js: a component rendered in the split children
  // declares locals it never reads. Their initializers are hook calls or other
  // side effects and must still run when the chunk renders.
  test.each([
    { name: 'a call', initializer: `useTracked('call')` },
    { name: 'an optional call', initializer: `useTracked?.('optional')` },
    {
      name: 'a member read of a call',
      initializer: `useTracked('member').length`,
    },
  ])(
    'client: an unused local initialized by $name still runs',
    async ({ initializer }) => {
      const { chunk } = await compileHydrateChunk(
        hydratePage(`function useTracked(label) {
  globalThis.__portedTrack.push(label)
  return label
}
function Widget() {
  const unused = ${initializer}
  return <p>widget</p>
}`),
      )
      const calls: Array<string> = []
      ;(globalThis as { __portedTrack?: Array<string> }).__portedTrack = calls
      expect(await renderChunk(chunk, { props: {} })).toBe('<p>widget</p>')
      expect(calls).toHaveLength(1)
    },
  )
})

describe('server function handlers with unusual bodies stay off the client', () => {
  // Bodies adapted from the same fixture shapes; each reads a server-only
  // import through a different syntax position.
  test.each([
    {
      name: 'a labeled block',
      body: `found: {
    for (const key of Object.keys(secrets)) {
      if (key) break found
    }
  }
  return 1`,
    },
    {
      name: 'a catch parameter shadowing it elsewhere',
      body: `try {
    return secrets.read()
  } catch (secrets) {
    return String(secrets)
  }`,
    },
    {
      name: 'a parameter default',
      body: `const read = (source = secrets) => source.read()
  return read()`,
    },
    {
      name: 'a computed key and a shorthand property',
      body: `return { [secrets.key]: 1, secrets }`,
    },
    {
      name: 'a class static block',
      body: `class Vault {
    static value
    static {
      Vault.value = secrets.read()
    }
  }
  return Vault.value`,
    },
    {
      name: 'a tagged template',
      body: 'return secrets.tag`id-${1}`',
    },
  ])('$name', async ({ body }) => {
    const code = `import { createServerFn } from '@tanstack/react-start'
import { secrets } from './server-secrets'
export const read = createServerFn().handler(async () => {
  ${body}
})
`
    const client = await compileStartModule({ env: 'client', code })
    expect(client).not.toContain('server-secrets')
    expect(await getModuleErrors(client!)).toEqual([])
    const provider = await compileStartModule({
      env: 'server',
      code,
      provider: true,
    })
    expect(provider).toContain('server-secrets')
    expect(await getModuleErrors(provider!)).toEqual([])
  })
})
