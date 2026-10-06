import { describe, expect, it } from 'vitest'
import { compileRouteModules, expectValidModules } from './regression-helpers'
import { declarationOf, getModuleErrors } from './validate-module'

describe('code-splitter emits valid modules', () => {
  it.each([
    { name: 'as-is', exports: 'export { Foo }' },
    { name: 'renamed', exports: 'export { Foo as Bar }' },
  ])(
    'does not redeclare an imported binding that is re-exported $name',
    async ({ exports }) => {
      const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
import { Foo } from './foo'
${exports}
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <Foo />
}
`)
      await expectValidModules(modules)
    },
  )

  it('does not redeclare an exported binding destructured next to a non-exported one', async () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
const { a, b } = getStuff()
export { a }
export const Route = createFileRoute('/')({
  component: () => <div>{a}{b}</div>,
})
`)
    await expectValidModules(modules)
  })

  it.each([
    { name: 'function', declaration: 'function () {\n  return null\n}' },
    { name: 'class', declaration: 'class {\n  x = 1\n}' },
  ])(
    'keeps an anonymous default-exported $name valid in split chunks',
    async ({ declaration }) => {
      const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: Page })
function Page() {
  return <div />
}
export default ${declaration}
`)
      await expectValidModules(modules)
    },
  )

  it.each([
    { name: 'function', declaration: 'function () {\n  return null\n}' },
    { name: 'class', declaration: 'class {\n  x = 1\n}' },
  ])(
    'keeps an anonymous default-exported $name valid when bindings are shared',
    async ({ declaration }) => {
      const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
const cache = new Map()
export const Route = createFileRoute('/')({
  loader: () => cache.get('x'),
  component: () => <div>{cache.size}</div>,
})
export default ${declaration}
`)
      expect(Object.keys(modules)).toContain('shared')
      await expectValidModules(modules)
    },
  )
})

describe('code-splitter preserves module semantics', () => {
  it.each([
    {
      name: 'a store subscription that unsubscribes itself',
      sideEffect: 'store.subscribe(',
      declared: ['unsubscribe'],
      setup: `import { store } from './store'
const unsubscribe = store.subscribe(() => {
  if (store.state.done) unsubscribe()
})`,
    },
    {
      name: 'an interval that clears itself',
      sideEffect: 'setInterval(',
      declared: ['ticks', 'interval'],
      setup: `let ticks = 0
const interval = setInterval(() => {
  ticks++
  if (ticks > 3) clearInterval(interval)
}, 1000)`,
    },
    {
      name: 'mutually-referencing declarations',
      sideEffect: 'createPersister(',
      declared: ['persister', 'restore'],
      setup: `import { createPersister } from './persist'
const persister = createPersister({ onRestore: () => restore() })
function restore() {
  persister.restore()
}`,
    },
  ])(
    'keeps $name in the reference module',
    async ({ setup, sideEffect, declared }) => {
      const {
        modules: { reference },
      } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
${setup}
export const Route = createFileRoute('/')({ component: () => <div /> })
`)
      expect(reference).toContain(sideEffect)
      // The side effects' callbacks reference these bindings, and the module
      // validator does not report references to undeclared names.
      for (const name of declared) {
        expect(reference).toMatch(declarationOf(name))
      }
      expect(await getModuleErrors(reference!)).toEqual([])
    },
  )

  it('keeps the namespace import that a TypeScript import alias refers to', () => {
    const { modules } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
import * as lib from './lib'
import Helper = lib.Helper
export const Route = createFileRoute('/')({
  component: () => <div>{Helper.x}</div>,
})
`)
    expect(modules['virtual component']).toMatch(
      /import \* as lib from ['"]\.\/lib['"]/,
    )
  })

  it('keeps decorators before `export` for legacy decorator transforms', () => {
    // TypeScript `experimentalDecorators` and Babel `decorators-legacy` only
    // accept decorators before the `export` keyword.
    const {
      modules: { reference },
    } = compileRouteModules(`
import { createFileRoute } from '@tanstack/react-router'
@observable export class Store { @observable count = 0 }
export const Route = createFileRoute('/')({ component: () => <div /> })
`)
    expect(reference).toMatch(/@observable\s+export class Store\b/)
  })
})
