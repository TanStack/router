/**
 * Decorator metadata (`emitDecoratorMetadata`: DI containers, ORMs,
 * validation DTOs) reads the type of a decorated member by value when the
 * class is defined: a class only that annotation names stays, and the client
 * records it instead of throwing a ReferenceError. What else the emitter's
 * metadata reads (`String` for `string`, a class in a union on SWC) no rule
 * models: in a module with decorators types keep what they name, as on main
 * (a type never keeps a value elsewhere; user decision, 2026-11-26), while
 * what only server code reads still leaves. Vite's Oxc reads the setting from
 * the tsconfig; Rsbuild's SWC from its decorator options. Sources: the
 * reviews of the type rule (Astra, Fable, Gemini) and its comparison with
 * main (`type-only-main-cases`).
 */
import { describe, expect, test } from 'vitest'
import { startBundlers } from '../build-harness'
import { buildStart } from '../build-start'

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

const head = `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
;(Reflect as any).metadata = (key: string, value: any) => (target: any) => {
  if (key === 'design:type') target.constructor.recorded = value?.name
}
const seen = (..._args: Array<unknown>): any => {}
`
const tail = `export const fn = createServerFn().handler(async () => 1)
export const recorded = () => (Entity as any).recorded
`

// (an effect at its top level: the bundler keeps the module where an import
// of it stays)
const server = `;(globalThis as any).setupRan = 'MARK_SETUP_SERVER'
export const setup = () => 1
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
    // (Astra's review of 5d77f89358: `string` serializes to the `String`
    // where the class is)
    name: 'a constructor of the module only a type names stays in a module with decorators',
    body: `const String = class Actual {}
export class Entity {
  @seen name!: string
}
export const check = (x?: typeof String) => 1
`,
    recorded: 'Actual',
  },
  {
    // (case 1b of the comparison with main: server code is the one reader)
    name: 'a constructor of the module only server code reads leaves, as on main',
    body: `const String = class Actual {}
export const serverOnly = createServerOnlyFn(() => String)
export class Entity {
  @seen name!: string
}
`,
    recorded: 'String',
  },
  // (case 4: SWC drops `never` and records the class; Oxc records `Object`)
  ...startBundlers.map((only) => ({
    name: 'a class a decorated member names in a union with never stays',
    body: `class Two {}
export class Entity {
  @seen t!: Two | never
}
`,
    recorded: only === 'rsbuild' ? 'Two' : 'Object',
    only,
  })),
  {
    // (Fable's re-check of 463e6587a6: SWC emits metadata for an abstract
    // member, Oxc drops it; a decorator there closes the gate too)
    name: 'a class only a decorated abstract member names stays',
    body: `class Two {}
export abstract class Entity {
  @seen abstract x: Two
}
`,
    recorded: 'Two',
    only: 'rsbuild',
  },
  {
    // (Fable's review of 5d77f89358: a self-registering class)
    name: 'a decorated class only types name stays, with its registration',
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
    recorded: 'x-el',
  },
]

const options = (bundler: (typeof startBundlers)[number]) => ({
  bundler,
  entry: 'src/entry.ts',
  // (unminified: the class keeps its name)
  minify: false,
  ...(bundler === 'rsbuild' && {
    rsbuildConfig: {
      source: { decorators: { version: 'legacy' as const } },
      tools: {
        swc: { jsc: { transform: { decoratorMetadata: true } } },
      },
    },
  }),
})

describe.each(startBundlers)('%s build', (bundler) => {
  test.each(rows.filter((row) => (row.only ?? bundler) === bundler))(
    '$name',
    async ({ body, recorded }) => {
      const build = await buildStart({
        ...options(bundler),
        files: {
          'src/module.ts': head + body + tail,
          'src/entry.ts': `export { recorded } from './module'\n`,
          'tsconfig.json': tsconfig,
        },
      })
      expect((await build.client.run('return entry.recorded()')).result).toBe(
        recorded,
      )
    },
    timeout,
  )

  // (case 1 of the comparison with main, Astra's round 3: a shadowing
  // binding only server code reads leaves with its call)
  test(
    "a metadata global's name of the module only server code reads leaves with its call",
    async () => {
      const build = await buildStart({
        ...options(bundler),
        files: {
          'src/dep.server.ts': server,
          'src/module.ts': `${head}import { setup } from './dep.server'
const Number = setup()
export const getIt = createServerOnlyFn(() => Number)
export class Entity {
  @seen name!: string
}
${tail}`,
          'src/entry.ts': `export { recorded } from './module'\n`,
          'tsconfig.json': tsconfig,
        },
      })
      expect({
        recorded: (await build.client.run('return entry.recorded()')).result,
        setup: build.client.where('MARK_SETUP_SERVER'),
      }).toEqual({ recorded: 'String', setup: 'nowhere' })
    },
    timeout,
  )
})
