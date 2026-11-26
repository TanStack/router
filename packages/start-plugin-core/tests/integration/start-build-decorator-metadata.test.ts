/**
 * A type never keeps a value (user decision, 2026-11-25), but decorator
 * metadata (`emitDecoratorMetadata`: DI containers, ORMs, validation DTOs)
 * reads the type of a decorated member by value when the class is defined:
 * a class only that annotation names stays, and the client records it
 * instead of throwing a ReferenceError; so does a constructor of the module
 * that a keyword type serializes to (`string`: the module's `String`), which
 * the client records instead of the built-in. A decorator itself is no
 * read: a class only types name is removed with it. Vite's Oxc reads the
 * setting from the tsconfig; Rsbuild's SWC from its decorator options.
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

const tsconfig = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ESNext',
    moduleResolution: 'Bundler',
    jsx: 'react-jsx',
    strict: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    useDefineForClassFields: false,
  },
})

const head = `import { createServerFn } from '@tanstack/react-start'
;(Reflect as any).metadata = (key: string, value: any) => (target: any) => {
  if (key === 'design:type') target.constructor.recorded = value.name
}
const seen = (..._args: Array<unknown>): any => {}
`
const tail = `export const fn = createServerFn().handler(async () => 1)
export const recorded = () => (Entity as any).recorded
`

const rows: Array<{
  name: string
  body: string
  recorded: string
  /** The one bundler the row builds with. */
  only?: (typeof startBundlers)[number]
}> = [
  {
    name: 'a class only a decorated member names in its type stays for its metadata',
    body: `class Model {}
export class Entity {
  @seen model!: Model
}
`,
    recorded: 'Model',
  },
  {
    // (Astra 2: \`string\` serializes to the \`String\` where the class is)
    name: 'a constructor of the module a keyword type serializes to stays',
    body: `const String = class Actual {}
export class Entity {
  @seen name!: string
}
export const check = (x?: typeof String) => 1
`,
    recorded: 'Actual',
  },
  // (Astra's and Gemini's re-checks of 52b0c43a0e: what a method, a union,
  // an intersection or a negative bigint serializes to is the module's own
  // constructor of that name; any of them a class with metadata may read)
  ...(
    [
      ['a decorated method', 'Function', '@seen run() {}'],
      ['a union of string literals', 'String', `@seen kind!: 'a' | 'b'`],
      ['an intersection of strings', 'String', '@seen kind!: string & string'],
      // (Rsbuild only: Oxc's legacy metadata panics on a negative bigint
      // type, `oxc_transformer` 0.156 `decorator/legacy/metadata.rs:612`)
      ['a negative bigint literal', 'BigInt', '@seen big!: -1n', 'rsbuild'],
    ] as const
  ).map(([what, ctor, member, only]) => ({
    name: `the module's ${ctor} that ${what} serializes to stays`,
    body: `const ${ctor} = class Actual {}
export class Entity {
  ${member}
}
export const check = (x?: typeof ${ctor}) => 1
`,
    recorded: 'Actual',
    only,
  })),
  {
    // a class only types name is removed with its decorators and static
    // blocks (the user's decision on self-registering classes, 2026-11-25:
    // accepted as built; Fable's review of 5d77f89358): the source records
    // `x-el`, the client nothing
    name: 'a decorated class only types name is removed with its decorator',
    body: `const registry: Array<string> = []
const register = (name: string) => (_target: unknown) => {
  registry.push(name)
}
@register('x-el')
class MyEl {}
export class Entity {
  static get recorded() {
    return registry.join(',') || 'none'
  }
}
export const check = (el?: MyEl) => 1
`,
    recorded: 'none',
  },
]

describe.each(startBundlers)('%s build', (bundler) => {
  test.each(rows.filter((row) => (row.only ?? bundler) === bundler))(
    '$name',
    async ({ body, recorded }) => {
      const build = await buildStart({
        bundler,
        files: {
          'src/module.ts': head + body + tail,
          'src/entry.ts': `export { recorded } from './module'\n`,
          'tsconfig.json': tsconfig,
        },
        entry: 'src/entry.ts',
        // (unminified: the class keeps its name)
        minify: false,
        ...(bundler === 'rsbuild' && {
          rsbuildConfig: {
            source: { decorators: { version: 'legacy' } },
            tools: {
              swc: { jsc: { transform: { decoratorMetadata: true } } },
            },
          },
        }),
      })
      expect((await build.client.run('return entry.recorded()')).result).toBe(
        recorded,
      )
    },
    timeout,
  )
})
