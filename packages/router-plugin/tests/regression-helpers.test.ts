/**
 * Controls for the regression harness itself: module discovery, lazy
 * evaluation, output validation and snapshot formatting (module linking:
 * `@tanstack/compiler-test-utils`).
 */
import { describe, expect, it } from 'vitest'
import { formatSnapshot } from './format-snapshot'
import {
  compileRouteModules,
  expectRegisteredRouteOption,
  expectValidModules,
  head,
  importSources,
  loadRoute,
  routeModuleSources,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'

describe('compileRouteModules', () => {
  const route = `${head}export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})`

  it('returns the modules the output imports, and only those', () => {
    const { modules, ids } = compileRouteModules(route)
    expect(Object.keys(modules)).toEqual(['reference', 'virtual component'])
    // Every module but the route module is imported by another one.
    const imported = Object.values(modules).flatMap((code) => [
      ...importSources(code),
      ...[...code.matchAll(/import\(['"]([^'"]+)['"]\)/g)].map(
        (match) => match[1]!,
      ),
    ])
    expect(imported).toContain(ids['virtual component'])
  })

  it('labels a module that the route module and a chunk import statically as shared', () => {
    const { modules, ids, sharedBindings } =
      compileRouteModules(`${head}const shared = { value: 1 }
export const Route = createFileRoute('/')({
  loader: () => shared.value,
  component: () => <p>{shared.value}</p>,
})`)
    expect(Object.keys(modules).sort()).toEqual([
      'reference',
      'shared',
      'virtual component',
    ])
    expect(routeModuleSources(modules.reference!)).toContain(ids.shared)
    expect(sharedBindings).toEqual(['shared'])
  })
})

describe('loadRoute', () => {
  it('evaluates the route module first and a split option when it loads', async () => {
    const effects: Array<string> = []
    const route = await loadRoute(
      `${head}import { track } from './track'
track('route')
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{track('component')}</p>,
})`,
      {
        stubs: { './track': { track: (label: string) => effects.push(label) } },
      },
    )
    expect(route.evaluated).toEqual([route.ids.reference])
    expect([route.isLazy('component'), route.isLazy('loader')]).toEqual([
      true,
      false,
    ])
    expect(route.options.loader()).toBe('data')
    const component = await route.load('component')
    expect(route.evaluated).toEqual([
      route.ids.reference,
      route.ids['virtual component'],
    ])
    expect([component(), effects]).toEqual(['<p>2</p>', ['route', 'component']])
  })

  it('returns an option that is not split as it is', async () => {
    const route =
      await loadRoute(`import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <p>root</p> })`)
    expect(route.isLazy('component')).toBe(false)
    expect((await route.load('component'))()).toBe('<p>root</p>')
  })
})

describe('output validation', () => {
  it('rejects a reference to a name that is neither declared nor imported', async () => {
    expect(
      await getModuleErrors(`export const read = () => helper()
export const Page = () => <Missing />`),
    ).toEqual([
      '`helper` is referenced but never declared or imported',
      '`Missing` is referenced but never declared or imported',
    ])
  })

  it('rejects a classic JSX pragma whose factory is not imported', async () => {
    expect(
      await getModuleErrors(`/** @jsxRuntime classic */
/** @jsx jsx */
export const Page = () => <div />`),
    ).toEqual(['`jsx` is referenced but never declared or imported'])
  })

  it('accepts declared, hoisted, imported, probed and global names', async () => {
    expect(
      await getModuleErrors(`import { imported } from './lib'
label: for (const item of [1]) { if (item) break label }
export function read({ param = imported }, ...rest) {
  try { hoisted() } catch (error) { return [error, param, rest, arguments] }
  var later = 1
  class Local { static value = Local.name; method() { return this } }
  return [later, Local, { key: 1 }.key, typeof probed !== 'undefined' && probed, window, console]
}
function hoisted() {}
export const Page = () => <div>{imported}</div>`),
    ).toEqual([])
  })

  it('accepts names given as globals', async () => {
    expect(
      await getModuleErrors(
        'export const read = () => APP_VERSION',
        'module.ts',
        {
          globals: ['APP_VERSION'],
        },
      ),
    ).toEqual([])
  })

  it('lets the modules of a route read the globals the route file reads', async () => {
    const { modules } =
      compileRouteModules(`${head}export const Route = createFileRoute('/')({
  component: () => <p>{APP_VERSION}</p>,
})`)
    await expectValidModules(modules)
    await expect(
      expectValidModules({ chunk: 'export const read = () => APP_VERSION' }),
    ).rejects.toThrow()
  })
})

describe('expectRegisteredRouteOption', () => {
  it('rejects a component React Refresh does not register', async () => {
    await expect(
      expectRegisteredRouteOption(
        `${head}export const Route = createFileRoute('/')({ component: () => null })`,
        'component',
      ),
    ).rejects.toThrow('is not a component React Refresh registers')
  })

  it('returns the name React Refresh registers the component under', async () => {
    expect(
      await expectRegisteredRouteOption(
        `${head}function Page() { return null }
export const Route = createFileRoute('/')({ component: Page })`,
        'component',
      ),
    ).toBe('Page')
  })
})

describe('formatSnapshot', () => {
  it('formats output that parses', async () => {
    expect(await formatSnapshot('const   a =1\n\n\nexport {a}', 'a.tsx')).toBe(
      'const a = 1\nexport { a }\n',
    )
  })

  it('fails on output that does not parse', async () => {
    await expect(formatSnapshot('const = 1', 'a.tsx')).rejects.toThrow(
      'does not parse',
    )
  })
})
