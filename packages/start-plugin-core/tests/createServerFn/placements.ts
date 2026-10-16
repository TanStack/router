/**
 * Places a `createServerFn` can be written other than a top-level `const`
 * declarator, shared by the loosened placement tests
 * (declaration-sites.test.ts), their goal pins and the bug pins
 * (known-bugs-start-compiler.test.ts). Each handler reads the server-only
 * module (`serverOnlyModule`, `db.inner()`); `read` returns, from an
 * evaluated caller, the server fn the placement creates.
 */
export interface Placement {
  name: string
  code: string
  /** The server fn in an evaluated module of the placement's code. */
  read?: (module: Record<string, any>) => unknown
  /** The server fn is created inside a function. */
  nested?: boolean
  /**
   * The server fn initializes a variable declarator below the module top
   * level (in a function body, a block or a switch case).
   */
  declarator?: boolean
}

/** The import heads the placements are compiled under. */
export const placementHeads = {
  'createServerFn alone': {
    head: `import { createServerFn } from '@tanstack/react-start'\nimport { db } from './db.server'\n`,
    tail: '',
  },
  'another Start factory': {
    head: `import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'\nimport { db } from './db.server'\n`,
    tail: `\nexport const serverOnly = createServerOnlyFn(() => db.top())`,
  },
}

export type PlacementHead = keyof typeof placementHeads

/** `code` of a placement under an import head. */
export function placementModule(head: PlacementHead, code: string) {
  const { head: imports, tail } = placementHeads[head]
  return `${imports}${code}${tail}`
}

export const placements: Array<Placement> = [
  {
    name: 'a function body',
    code: `export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`,
    read: (module) => module.make(),
    nested: true,
    declarator: true,
  },
  {
    name: 'a function body next to a top-level server fn',
    code: `export const top = createServerFn().handler(async () => db.top())
export function make() {
  const inner = createServerFn().handler(async () => db.inner())
  return inner
}`,
    read: (module) => module.make(),
    nested: true,
    declarator: true,
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
    read: (module) => module.pick('a'),
    nested: true,
    declarator: true,
  },
  {
    name: 'a function return value',
    code: `export function make() {
  return createServerFn().handler(async () => db.inner())
}`,
    read: (module) => module.make(),
    nested: true,
  },
  {
    name: 'a switch case at the module top level',
    code: `export const registry: Array<unknown> = []
const mode: string = 'a'
switch (mode) {
  case 'a':
    const inner = createServerFn().handler(async () => db.inner())
    registry.push(inner)
}`,
    read: (module) => module.registry[0],
    declarator: true,
  },
  {
    name: 'a block at the module top level',
    code: `export const registry: Array<unknown> = []
{
  const inner = createServerFn().handler(async () => db.inner())
  registry.push(inner)
}`,
    read: (module) => module.registry[0],
    declarator: true,
  },
  {
    name: 'an object property',
    code: `export const api = { read: createServerFn().handler(async () => db.inner()) }`,
    read: (module) => module.api.read,
  },
  {
    name: 'a class field',
    code: `export class Api { read = createServerFn().handler(async () => db.inner()) }`,
    read: (module) => new module.Api().read,
  },
  {
    name: 'an anonymous default export',
    code: `export default createServerFn().handler(async () => db.inner())`,
    read: (module) => module.default,
  },
  {
    name: 'an assignment',
    code: `export let fn: unknown
fn = createServerFn().handler(async () => db.inner())`,
    read: (module) => module.fn,
  },
  {
    // Source: SolidStart compile.spec.ts "keeps client and server ids
    // aligned around nested server functions"; #8504
    // declaration-sites.test.ts
    name: 'the handler of another server fn',
    code: `export const outer = createServerFn().handler(async () => {
  const inner = createServerFn().handler(async () => db.inner())
  return typeof inner
})`,
    nested: true,
    declarator: true,
  },
  {
    // Source: #8504 declaration-sites.test.ts
    name: 'a call argument',
    code: `export const registered: Array<unknown> = []
function register(fn: unknown) {
  registered.push(fn)
}
register(createServerFn().handler(async () => db.inner()))`,
  },
  {
    // Source: Next.js server-actions fixtures server-graph/18, /19; #8504
    // declaration-sites.test.ts
    name: 'a JSX attribute',
    code: `export function Page() {
  return <form action={createServerFn().handler(async () => db.inner()) as any} />
}`,
  },
  {
    // Source: #8504 declaration-sites.test.ts
    name: 'a conditional initializer',
    code: `export const fn = Math.random() < 2 ? createServerFn().handler(async () => db.inner()) : null`,
  },
  {
    // Source: Next.js server-actions fixtures server-graph/56; #8504
    // declaration-sites.test.ts
    name: 'an object destructuring declarator',
    code: `export const { fn } = { fn: createServerFn().handler(async () => db.inner()) }`,
  },
  {
    // Source: Next.js server-actions fixtures server-graph/20; #8504
    // declaration-sites.test.ts
    name: 'an array destructuring declarator',
    code: `export const [fn] = [createServerFn().handler(async () => db.inner())]`,
  },
]

/**
 * A server fn nested in a function whose handler reads a local of that
 * function: it cannot run on its own in the provider, so the compiler must
 * reject it.
 */
export const capturingPlacement: Placement = {
  name: 'a function body, with a handler reading a local of the function',
  code: `export function make(id: string) {
  const inner = createServerFn().handler(async () => db.inner(id))
  return inner
}`,
  nested: true,
  declarator: true,
}
