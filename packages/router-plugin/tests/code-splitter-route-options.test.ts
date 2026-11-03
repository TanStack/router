import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  declarationOf,
  expectValidModules,
  head,
  importSources,
  importedNames,
} from './regression-helpers'

describe('route options', () => {
  it('are split when declared in a variable', async () => {
    const { modules } =
      compileRouteModules(`${head}import { fetchPosts } from './api'
function Posts() {
  return <ul>{Route.useLoaderData().length}</ul>
}
const options = {
  loader: () => fetchPosts(),
  component: Posts,
}
export const Route = createFileRoute('/posts')(options)
`)
    expect(modules.reference).toContain('tsr-split=component')
    expect(modules.reference).not.toMatch(declarationOf('Posts'))
    expect(importedNames(modules.reference!, './api')).toEqual(['fetchPosts'])
    const chunk = modules['virtual component']!
    expect(chunk).toMatch(declarationOf('Posts'))
    // The split component reads the Route singleton from the reference module
    expect(importedNames(chunk, 'route.tsx')).toEqual(['Route'])
    expect(importSources(chunk)).not.toContain('./api')
    await expectValidModules(modules)
  })

  // `satisfies` and `as` change the type, not the object: the options are
  // split as if written bare.
  it.each([
    {
      name: 'an inline literal with `satisfies`',
      declarations: '',
      argument: (options: string) => `${options} satisfies RouteOptions`,
    },
    {
      name: 'an inline literal with `as`',
      declarations: '',
      argument: (options: string) => `${options} as RouteOptions`,
    },
    {
      name: 'a variable with `satisfies`',
      declarations: 'const options = OPTIONS satisfies RouteOptions\n',
      argument: () => 'options',
    },
  ])('are split when given as $name', async ({ declarations, argument }) => {
    const options = `{
  loader: () => fetchPosts(),
  component: Posts,
}`
    const { modules } =
      compileRouteModules(`${head}import { fetchPosts } from './api'
import type { RouteOptions } from './types'
function Posts() {
  return <ul>{Route.useLoaderData().length}</ul>
}
${declarations.replace('OPTIONS', options)}export const Route = createFileRoute('/posts')(${argument(options)})
`)
    expect(modules.reference).toContain(
      "lazyRouteComponent($$splitComponentImporter, 'component')",
    )
    expect(modules.reference).not.toMatch(declarationOf('Posts'))
    const chunk = modules['virtual component']!
    expect(chunk).toMatch(declarationOf('Posts'))
    expect(chunk).toContain('export { Posts as component }')
    await expectValidModules(modules)
  })

  // The chunk exports the value under the same wrappers the reference file
  // sees through, instead of failing the build.
  it.each([
    {
      name: '`satisfies`',
      value: 'Posts satisfies FC',
      exported: 'export { Posts as component }',
    },
    {
      name: 'a non-null assertion',
      value: 'Posts!',
      exported: 'export { Posts as component }',
    },
    {
      name: '`as`',
      value: 'Posts as FC',
      exported: 'export { Posts as component }',
    },
    {
      name: '`satisfies` on an inline function',
      value: '(() => <Posts />) satisfies FC',
      exported: 'export { SplitComponent as component }',
    },
  ])('split a component behind $name', async ({ value, exported }) => {
    const { modules } =
      compileRouteModules(`${head}import type { FC } from 'react'
function Posts() {
  return <p>posts</p>
}
export const Route = createFileRoute('/posts')({
  component: ${value},
})
`)
    expect(modules.reference).toContain(
      "lazyRouteComponent($$splitComponentImporter, 'component')",
    )
    expect(modules.reference).not.toMatch(declarationOf('Posts'))
    expect(modules['virtual component']).toContain(exported)
    await expectValidModules(modules)
  })

  // Top-level code that reads a split component keeps its declaration in
  // the reference file, so the route module still evaluates.
  it.each([
    { name: 'written bare', value: 'Posts' },
    { name: 'behind `as`', value: 'Posts as FC' },
    { name: 'behind `satisfies`', value: 'Posts satisfies FC' },
    { name: 'behind a non-null assertion', value: 'Posts!' },
  ])(
    'keep a split component $name that top-level code reads at runtime',
    async ({ value }) => {
      const result = await buildAndRun(
        `${head}import type { FC } from 'react'
function Posts() {
  return <p>posts</p>
}
Posts.displayName = 'Posts'
export const Route = createFileRoute('/')({
  component: ${value},
})
`,
        `return { rendered: await entry.render(entry.Route.options.component) }`,
        { groupings: [['component']] },
      )
      expect(result).toEqual({ rendered: '<p>posts</p>' })
    },
    30_000,
  )

  it('keep an exported component behind a wrapper in the reference file', async () => {
    const warn = console.warn
    console.warn = () => {}
    try {
      const { modules } =
        compileRouteModules(`${head}import type { FC } from 'react'
export function Posts() {
  return <p>posts</p>
}
export const Route = createFileRoute('/posts')({
  component: Posts satisfies FC,
})
`)
      expect(modules.reference).toContain('component: Posts satisfies FC')
      expect(modules.reference).not.toContain('lazyRouteComponent')
      expect(modules['virtual component']).not.toContain('as component }')
      await expectValidModules(modules)
    } finally {
      console.warn = warn
    }
  })

  it('that repeat a split key are split like the runtime object: the last one wins', async () => {
    const { modules } =
      compileRouteModules(`${head}export const Route = createFileRoute('/')({
  component: () => <div>first-marker</div>,
  component: () => <div>last-marker</div>,
})
`)
    expect(modules['virtual component']).toContain('last-marker')
    expect(modules['virtual component']).not.toContain('first-marker')
    await expectValidModules(modules)
  })
})

describe('split options that read the Route singleton', () => {
  // `Route` stays in the reference module, so reading it from a split option
  // must not attribute every dependency of the route options to that option.
  it.each([
    {
      name: 'an inline arrow component',
      component: `() => <p>{format(Route.useLoaderData().length)}</p>`,
    },
    {
      name: 'an inline named function component',
      component: `function Posts() {
    const { page } = Route.useSearch()
    return <p>{format(page)}</p>
  }`,
    },
  ])(
    'share only what the loader and $name both read',
    async ({ component }) => {
      const { modules, sharedBindings } =
        compileRouteModules(`${head}const format = (value: unknown) => String(value)
const prefix = 'post:'
function fetchPosts() {
  return [prefix + 1]
}
export const Route = createFileRoute('/posts')({
  loader: () => [fetchPosts(), format(0)],
  component: ${component},
})
`)
      expect(sharedBindings).toEqual(['format'])
      expect(modules.reference).toMatch(declarationOf('fetchPosts'))
      expect(modules.reference).toMatch(declarationOf('prefix'))
      await expectValidModules(modules)
    },
  )

  it('do not turn a reassigned loader-only binding into an import', () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}let label = 'initial'
label = 'updated'
export const Route = createFileRoute('/label')({
  loader: () => label,
  component: () => <p>{Route.useLoaderData()}</p>,
})
`)
    expect(sharedBindings).toEqual([])
    // An imported binding is read-only: `label = ...` would throw at runtime
    expect(modules.reference).toMatch(declarationOf('label'))
    expect(importSources(modules.reference!)).toEqual([
      '@tanstack/react-router',
    ])
  })

  it('never share a destructuring whose sibling depends on Route', async () => {
    const { modules, sharedBindings } =
      compileRouteModules(`${head}const getRoute = () => Route
const [cache, routeGetter] = [new Map(), getRoute]
export const Route = createFileRoute('/')({
  loader: () => cache.size,
  component: () => <div>{cache.size}{typeof routeGetter}</div>,
})
`)
    // Intended trade-off (packages/router-plugin/AGENTS.md): bindings that
    // depend on `Route` are never shared, so each module that reads `cache`
    // creates its own copy.
    expect(sharedBindings).toEqual([])
    await expectValidModules(modules)
  })
})
