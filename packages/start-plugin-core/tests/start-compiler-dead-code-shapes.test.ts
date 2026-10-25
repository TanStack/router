import { describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  deadCodeShapes,
  depSource,
  recordFile,
  shapeSetup,
} from '@tanstack/compiler-test-utils/dead-code-shapes'
import {
  callServerFnThroughCallers,
  fromPage,
  inPage,
  serveCase,
  settle,
  throwsError,
  useStartHost,
} from './regression-helpers'
import type { PageSettled, ServedCase } from './regression-helpers'

// Every removal of the Start compiler takes with it, in that module, what
// only the removed code used, whatever the shape of the code in between,
// before the bundler sees it (SPEC G16, J4.1, J4.9, J4.10, J4.11, J4.12):
// the environment the code leaves does not load the module only that code
// imported. Kept code keeps what it reads, and code already dead before the
// transform keeps running (G3). Every cell runs through the public Start
// host: the module is served and evaluated in both environments, the client
// in a real page, the server in the SSR environment and in real requests.
// "Not loaded" is what the environment's module graph reaches.

/**
 * No import protection (its dev mock would hide a leaked import from the
 * loads) and `verbatimModuleSyntax` (without it, the TypeScript transform
 * drops imports nothing reads after the compiler and hides leaks).
 */
const host = useStartHost({
  start: { importProtection: { enabled: false } },
  files: {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'Bundler',
        jsx: 'react-jsx',
        strict: true,
        verbatimModuleSyntax: true,
      },
    }),
  },
})

type Environment = 'client' | 'ssr'

/** `expression` (with the case module as `module`) in an environment. */
async function read(
  served: ServedCase,
  environment: Environment,
  expression: string,
) {
  if (environment === 'client') {
    return inPage(served, `return ${expression}`)
  }
  const module = await served.ssr()
  return (new Function('module', `return (${expression})`) as any)(module)
}

/** What calling `module.fn` gives in an environment (`settle`). */
async function settled(served: ServedCase, environment: Environment) {
  if (environment === 'client') {
    return fromPage(
      await inPage<PageSettled>(served, 'return settle(module.fn)'),
    )
  }
  return settle((await served.ssr()).fn)
}

interface Removal {
  name: string
  /** The environment the removed code leaves. */
  removedFrom: Environment
  /** The module's code around `root`, the expression the removed code returns. */
  code: (root: string) => string
  /** What the module gives each environment, with `expected` from `root`. */
  check: (served: ServedCase, expected: unknown) => Promise<void>
}

const removals: Array<Removal> = [
  {
    name: 'a server fn handler',
    removedFrom: 'client',
    code: (root) => `import { createServerFn } from '@tanstack/react-start'
export const fn = createServerFn().handler(async () => ${root})`,
    check: async (served, expected) => {
      expect(await callServerFnThroughCallers(served, 'module.fn')).toEqual(
        expected,
      )
    },
  },
  {
    name: 'a createServerOnlyFn body',
    removedFrom: 'client',
    code: (root) => `import { createServerOnlyFn } from '@tanstack/react-start'
export const fn = createServerOnlyFn(() => ${root})`,
    check: async (served, expected) => {
      expect([
        await settled(served, 'client'),
        await settled(served, 'ssr'),
      ]).toEqual([throwsError, expected])
    },
  },
  {
    name: 'an isomorphic .server()',
    removedFrom: 'client',
    code: (root) => `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = createIsomorphicFn().server(() => ${root}).client(() => 'client')`,
    check: async (served, expected) => {
      expect([
        await settled(served, 'client'),
        await settled(served, 'ssr'),
      ]).toEqual(['client', expected])
    },
  },
  {
    name: 'a createClientOnlyFn body',
    removedFrom: 'ssr',
    code: (root) => `import { createClientOnlyFn } from '@tanstack/react-start'
export const fn = createClientOnlyFn(() => ${root})`,
    check: async (served, expected) => {
      expect([
        await settled(served, 'client'),
        await settled(served, 'ssr'),
      ]).toEqual([expected, throwsError])
    },
  },
  {
    name: 'an isomorphic .client()',
    removedFrom: 'ssr',
    code: (root) => `import { createIsomorphicFn } from '@tanstack/react-start'
export const fn = createIsomorphicFn().server(() => 'server').client(() => ${root})`,
    check: async (served, expected) => {
      expect([
        await settled(served, 'client'),
        await settled(served, 'ssr'),
      ]).toEqual([expected, 'server'])
    },
  },
]

describe.each(removals)('$name', (removal) => {
  // The module only the removed code needs is a `*.server.*` file where
  // server code leaves the client, and a neutral module where client code
  // leaves the server (J4.11: dropped whatever the file's name).
  const dep = removal.removedFrom === 'client' ? 'dep.server' : 'dep'
  for (const shape of deadCodeShapes) {
    test(`takes with it what only it uses through ${shape.name}`, async () => {
      const kept = shape.kept
        ? `\nexport const kept = () => ${shape.kept.expression}
export { ${shape.kept.binding} as aliased }`
        : ''
      const served = await serveCase(await host(), {
        'module.tsx': `${shapeSetup(shape, `./${dep}`)}
${removal.code(shape.root)}${kept}`,
        [`${dep}.ts`]: depSource,
        ...recordFile,
      })
      await removal.check(served, shape.expected)
      if (shape.kept) {
        expect(
          await read(
            served,
            removal.removedFrom,
            '[module.kept(), module.aliased()]',
          ),
        ).toEqual([shape.kept.expected, 'dep'])
      } else {
        expectNotLoaded(
          removal.removedFrom === 'client'
            ? await served.loads()
            : await served.serverLoads(),
          [`./${dep}`],
        )
      }
      if (shape.alreadyDead) {
        expect(
          removal.removedFrom === 'client'
            ? await read(
                served,
                'client',
                `[...(await load('record.ts')).calls]`,
              )
            : (await served.ssr('record.ts')).calls,
        ).toContain('dead')
      }
    })
  }
})

// Function-local declarations only the removed code read go with it too
// (SPEC J4.12), whatever their statement shape: several declarators of one
// statement (two neighbours orphaned by one erasure once made the compile
// fail), declarators without initialisers, a block of the module level. The
// module keeps working: the client stub throws, the server runs the body.
describe('function-local declarations only the removed code read', () => {
  test.each<{ name: string; body: string; expected: unknown }>([
    {
      name: 'two declarators of one statement',
      body: `const a = 1, b = 2
  const run = createServerOnlyFn(() => a + b)
  return run()`,
      expected: 3,
    },
    {
      name: 'three declarators of one statement',
      body: `const a = 1, b = 2, c = 3
  const run = createServerOnlyFn(() => a + b + c)
  return run()`,
      expected: 6,
    },
    {
      name: 'a kept declarator between two orphaned ones',
      body: `const a = 1, b = 2, c = 3
  const run = createServerOnlyFn(() => a + c)
  return run() + b`,
      expected: 6,
    },
    {
      name: 'declarators without initialisers',
      body: `let a, b
  const run = createServerOnlyFn(() => { a = 1; b = 2; return a + b })
  return run()`,
      expected: 3,
    },
    // An impure initialiser stays for its effects, as an expression: one
    // that cannot start a statement (an object literal, a function or class
    // expression) still parses.
    {
      name: 'an impure object literal',
      body: `const options = { label: String(1), size: 2 }
  const run = createServerOnlyFn(() => options.size)
  return run()`,
      expected: 2,
    },
    {
      name: 'an impure function expression',
      body: `const value = function () { return 3 }()
  const run = createServerOnlyFn(() => value)
  return run()`,
      expected: 3,
    },
    {
      name: 'an impure class expression',
      body: `const Box = class { static value = String(4) }
  const run = createServerOnlyFn(() => Box.value)
  return run()`,
      expected: '4',
    },
  ])('$name', async ({ body, expected }) => {
    const served = await serveCase(await host(), {
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
export function fn() {
  ${body}
}
`,
    })
    expect([
      await settled(served, 'client'),
      await settled(served, 'ssr'),
    ]).toEqual([throwsError, expected])
  })
})

// A destructured binding only the removed code read goes with it, beside
// bindings of the same pattern kept code reads (SPEC G16 "destructuring",
// J4.12), however the pattern holds it: a rest element only the removed
// code read goes too, so a sibling whose default reads the module only the
// removed code needs can go; an array element leaves a hole, so the
// iterator is still stepped as often as the source steps it (G3).
describe('destructured bindings only the removed code read', () => {
  test('an object pattern with a rest element', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
import { dep } from './dep.server'
const source: Record<string, string | undefined> = { kept: 'kept', extra: 'extra' }
const { picked = dep.value, kept, ...others } = source
export const keptValue = kept
export const fn = createServerOnlyFn(() => [picked, others.extra])
`,
      'dep.server.ts': depSource,
    })
    expect([
      await settled(served, 'client'),
      await settled(served, 'ssr'),
    ]).toEqual([throwsError, ['dep', 'extra']])
    expect(await read(served, 'client', 'module.keptValue')).toBe('kept')
    expectNotLoaded(await served.loads(), ['./dep.server'])
  })

  test('a function-level pattern whose every binding the removed code read', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
import { dep } from './dep.server'
export function fn() {
  const { value, ...rest } = dep
  const run = createServerOnlyFn(() => [value, Object.keys(rest).length])
  return run()
}
`,
      'dep.server.ts': depSource,
    })
    expect([
      await settled(served, 'client'),
      await settled(served, 'ssr'),
    ]).toEqual([throwsError, ['dep', 0]])
    expectNotLoaded(await served.loads(), ['./dep.server'])
  })

  test('an array pattern reading an iterator', async () => {
    const served = await serveCase(await host(), {
      'module.tsx': `import { createServerOnlyFn } from '@tanstack/react-start'
export const steps: Array<number> = []
function* sequence() {
  steps.push(1)
  yield 'kept'
  steps.push(2)
  yield 'dropped'
  steps.push(3)
}
const [kept, dropped] = sequence()
export const keptValue = kept
export const fn = createServerOnlyFn(() => dropped)
`,
    })
    expect([
      await settled(served, 'client'),
      await settled(served, 'ssr'),
    ]).toEqual([throwsError, 'dropped'])
    expect(
      await read(served, 'client', '[module.keptValue, module.steps]'),
    ).toEqual(['kept', [1, 2]])
  })
})
