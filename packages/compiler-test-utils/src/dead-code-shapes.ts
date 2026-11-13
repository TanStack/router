/**
 * The dependency shapes of code a transform removes (SPEC G16): each shape
 * declares, at module level, what the removed code (`root`) needs, reading
 * a module (`DEP` in `setup`) that only that code imports. Whatever removes
 * `root` must take the shape's declarations and the import with it in that
 * module, keep what kept code still reads (`kept`) and keep code that was
 * already dead before the transform (`alreadyDead`: its initializer still
 * runs). Every removal runs every shape: start-plugin-core
 * `tests/start-compiler-dead-code-shapes.test.ts` (server fns, environment
 * functions) and `tests/integration/pages/hydrate-dead-code-shapes.test.ts`
 * (`<Hydrate>` children); router-plugin
 * `tests/integration/pages/code-splitter-dead-code-shapes.test.ts` (split
 * options, `deleteNodes`).
 */

export interface DeadCodeShape {
  name: string
  /**
   * Module-level code: imports `dep` (`{ value: 'dep' }`) from `'DEP'`, the
   * module only the removed code needs, and declares what `root` reads.
   */
  setup: string
  /** The expression the removed code evaluates. */
  root: string
  /** What `root` gives where it runs. */
  expected: unknown
  /**
   * Kept code reads the shared declaration (`binding`) too: it stays, with
   * its import. `expression` is the kept reader (an export of the module
   * gives its value, `expected`); the module also exports `binding` as
   * `aliased`, read through `export { binding as aliased }`.
   */
  kept?: { expression: string; binding: string; expected: unknown }
  /**
   * A declaration nothing read before the transform, whose initializer
   * records `'dead'` (`./record`): it is not the transform's to remove, so
   * it still runs where the removal happens.
   */
  alreadyDead?: true
}

/** The module only the removed code needs (`'DEP'`). */
export const depSource = `export const dep = { value: 'dep' }\n`

/** `./record`: what initializers ran (`calls`). */
export const recordFile = {
  'record.ts': `export const calls: Array<string> = []
export const record = (name: string) => {
  calls.push(name)
  return name
}
`,
}

/** `shape.setup` importing `dep` from `specifier`. */
export function shapeSetup(shape: DeadCodeShape, specifier: string) {
  return shape.setup.replaceAll(`'DEP'`, JSON.stringify(specifier))
}

export const deadCodeShapes: Array<DeadCodeShape> = [
  {
    name: 'a chain',
    setup: `import { dep } from 'DEP'
const c = () => dep.value
const b = () => c()
const a = () => b()`,
    root: 'a()',
    expected: 'dep',
  },
  {
    name: 'a diamond',
    setup: `import { dep } from 'DEP'
const c = () => dep.value
const a = () => c() + 'a'
const b = () => c() + 'b'
const both = () => a() + b()`,
    root: 'both()',
    expected: 'depadepb',
  },
  {
    name: 'mutually recursive functions',
    setup: `import { dep } from 'DEP'
function ping(n: number): string { return n > 0 ? pong(n - 1) : dep.value }
function pong(n: number): string { return n > 0 ? ping(n - 1) : 'pong' }`,
    root: 'ping(2)',
    expected: 'dep',
  },
  {
    name: 'a class and a const that read each other',
    setup: `import { dep } from 'DEP'
const registry = { make: () => new Repo() }
class Repo {
  static registry = registry
  read() { return dep.value }
}`,
    root: 'Repo.registry.make().read()',
    expected: 'dep',
  },
  {
    name: 'a helper kept code reads too',
    setup: `import { dep } from 'DEP'
const Shared = () => dep.value
const only = () => Shared() + '!'`,
    root: 'only()',
    expected: 'dep!',
    // The kept reads: a runtime `typeof`, a shorthand property, a JSX tag.
    kept: {
      expression: `[typeof Shared, { Shared }.Shared(), [<Shared />][0].type()]`,
      binding: 'Shared',
      expected: ['function', 'dep', 'dep'],
    },
  },
  {
    name: 'code already dead before the transform',
    setup: `import { dep } from 'DEP'
import { record } from './record'
const unused = record('dead')
const c = () => dep.value`,
    root: 'c()',
    expected: 'dep',
    alreadyDead: true,
  },
  {
    name: 'a let a function assigns',
    setup: `import { dep } from 'DEP'
let value: string | undefined
function init() { value = dep.value }
const read = () => {
  init()
  return value
}`,
    root: 'read()',
    expected: 'dep',
  },
  {
    name: 'an object and an array holding the helper',
    setup: `import { dep } from 'DEP'
const run = () => dep.value
const registry = { run, list: [run] }`,
    root: 'registry.run() + registry.list[0]()',
    expected: 'depdep',
  },
  {
    name: 'a closure a factory call returns',
    setup: `import { dep } from 'DEP'
const make = () => {
  const value = dep.value
  return () => value
}
const run = make()`,
    root: 'run()',
    expected: 'dep',
  },
  {
    name: 'a default parameter',
    setup: `import { dep } from 'DEP'
function readId(id = dep.value) { return id }`,
    root: 'readId()',
    expected: 'dep',
  },
  {
    name: 'a namespace import',
    setup: `import * as ns from 'DEP'`,
    root: 'ns.dep.value',
    expected: 'dep',
  },
  {
    name: 'a top-level await',
    setup: `import { dep } from 'DEP'
const conn = await Promise.resolve(dep.value)`,
    root: 'conn',
    expected: 'dep',
  },
]
