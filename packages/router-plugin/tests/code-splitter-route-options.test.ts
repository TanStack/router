import { describe, expect, it } from 'vitest'
import {
  buildAndRun,
  compileRouteModules,
  declarationOf,
  evaluateModule,
  expectValidModules,
  exportedNames,
  head,
  importSources,
  importedNames,
  loadRouteModules,
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

  // Source: React Router route-chunks-test.ts "chunkable" detection of export values
  it.each([
    {
      name: 'a satisfies expression',
      code: `import type { FC } from 'react'
function Page() {
  return <div>page</div>
}
export const Route = createFileRoute('/')({ component: Page satisfies FC })`,
    },
    {
      name: 'a non-null assertion',
      code: `const Page: (() => any) | undefined = () => <div>page</div>
export const Route = createFileRoute('/')({ component: Page! })`,
    },
  ])('are split when wrapped in $name', async ({ code }) => {
    const { modules } = compileRouteModules(`${head}${code}\n`)
    expect(modules.reference).toContain('tsr-split=component')
    expect(modules.reference).not.toMatch(declarationOf('Page'))
    expect(modules['virtual component']).toMatch(declarationOf('Page'))
    await expectValidModules(modules)
  })

  // Source: React Router route-chunks-test.ts "isolated exported destructured
  // array variable declarations sharing an export statement" and "exported
  // destructured array variable declarations sharing an assignment"
  it.each([
    {
      name: 'its own array destructuring',
      code: `import { chunkMessage, mainMessage } from './messages'
const [Page] = [() => <div>{chunkMessage}</div>],
  [main] = [mainMessage]
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})`,
    },
    {
      name: 'an array destructuring shared with the errorComponent',
      code: `import { createPair } from './factory'
const [Page, ErrorView] = createPair()
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: ErrorView,
})`,
    },
  ])('are split when declared by $name', async ({ code }) => {
    const { modules } = compileRouteModules(`${head}${code}\n`)
    expect(modules.reference).toContain('tsr-split=component')
    expect(modules.reference).not.toMatch(/\bPage\b/)
    expect(exportedNames(modules['virtual component']!)).toEqual(['component'])
    await expectValidModules(modules)
  })

  // Source: React Router route-chunks-test.ts "exported destructured array
  // variable declarations sharing an assignment"
  it('keep the modules valid for a component declared by an array destructuring shared with the loader', async () => {
    const { modules } =
      compileRouteModules(`${head}import { chunkMessage, mainMessage } from './messages'
const [Page, main] = [() => <div>{chunkMessage}</div>, mainMessage]
export const Route = createFileRoute('/')({
  loader: () => main,
  component: Page,
})
`)
    // Known limitation: a destructuring is initialized in one module, so the
    // whole declaration moves to the shared module that the route module
    // imports for `main`, and the component is not lazy-loaded.
    await expectValidModules(modules)
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

describe('route options written as methods or accessors', () => {
  // Only property values are split; splitting method shorthands is proposed in
  // https://github.com/TanStack/router/pull/8459.
  it('stay in the route module and keep working, while arrow options are split', async () => {
    const { modules, options, chunks } =
      await loadRouteModules(`${head}const state = { count: 0 }
export const Route = createFileRoute('/')({
  loader() {
    return state
  },
  get component() {
    return () => <div>{state.count}</div>
  },
  set component(_value) {
    state.count++
  },
  errorComponent: () => <div>{state.count}</div>,
})`)
    expect(Object.keys(chunks)).toEqual(['errorComponent'])
    options.component = null
    expect([
      options.loader().count,
      options.component(),
      chunks.errorComponent!.errorComponent(),
    ]).toEqual([1, '<div>1</div>', '<div>1</div>'])
    await expectValidModules(modules)
  })
})

describe('split loaders', () => {
  /** Loads `/` with a real router and returns each match's loader data. */
  const routerEntry = `import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export async function load() {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  return router.state.matches.map((match) => match.loaderData ?? null)
}`

  function loadWithSplitLoader(loader: string) {
    return buildAndRun(
      `${head}export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})`,
      `return await entry.load()`,
      {
        files: { 'entry.ts': routerEntry },
        groupings: [['loader'], ['component']],
      },
    )
  }

  it('load route data', async () => {
    expect(await loadWithSplitLoader(`() => 'loaded'`)).toEqual([
      null,
      'loaded',
    ])
  }, 30_000)

  it('load route data in object form', async () => {
    expect(
      await loadWithSplitLoader(
        `{ handler: () => 'loaded', staleReloadMode: 'blocking' }`,
      ),
    ).toEqual([null, 'loaded'])
  }, 30_000)

  // The router reads the other keys of a loader object (`staleReloadMode`)
  // from the route options when the route loads.
  it('move only the handler of a loader in object form into their chunk', async () => {
    const { modules, sharedBindings } = compileRouteModules(
      `${head}import { fetchPosts } from './api'
import { init } from './state'
const mode = init('blocking')
export const Route = createFileRoute('/')({
  loader: {
    handler: () => [mode, fetchPosts()],
    staleReloadMode: mode,
  },
  component: () => <p>index</p>,
})
`,
      { groupings: [['loader'], ['component']] },
    )
    // `mode` is read by the handler and by the route module: initialized once
    expect(sharedBindings).toEqual(['mode'])
    expect(importSources(modules.reference!)).not.toContain('./api')
    expect(modules.reference).toContain('staleReloadMode')
    const chunk = await evaluateModule(modules['virtual loader']!, {
      './api': { fetchPosts: () => 'posts' },
      'route.tsx?tsr-shared=1': { mode: 'blocking' },
    })
    expect(chunk.loader!()).toEqual(['blocking', 'posts'])
    await expectValidModules(modules)
  })

  it.each([
    {
      name: 'a method',
      loader: `{ handler() { return fetchPosts() } }`,
    },
    {
      name: 'a spread after the handler',
      loader: `{ handler: () => fetchPosts(), ...defaults }`,
    },
  ])(
    'keep a loader object whose handler is $name in the route module',
    async ({ loader }) => {
      const { modules } = compileRouteModules(
        `${head}import { fetchPosts, defaults } from './api'
export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>index</p>,
})
`,
        { groupings: [['loader'], ['component']] },
      )
      expect(importedNames(modules.reference!, './api')).toContain('fetchPosts')
      expect(modules.reference).not.toContain('tsr-split=loader')
      await expectValidModules(modules)
    },
  )
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
      // The loader's helpers stay out of the component chunk
      expect(modules['virtual component']).not.toMatch(
        declarationOf('fetchPosts'),
      )
      expect(modules['virtual component']).not.toMatch(declarationOf('prefix'))
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
