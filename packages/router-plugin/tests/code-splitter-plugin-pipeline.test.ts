import { describe, expect, it } from 'vitest'
import {
  compileRouteModules,
  createCodeSplitterTransforms,
  evaluateModule,
  expectValidModules,
  importRequests,
  importSources,
  loadRoute,
  parseModule,
  routeFile,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import type { Config } from '../src/core/config'

const routeSource = (name: string) => `
import { createFileRoute } from '@tanstack/react-router'
const state = { name: ${JSON.stringify(name)} }
export const Route = createFileRoute('/${name}')({
  loader: () => state,
  head: () => ({ meta: [{ title: state.name }] }),
  component: () => <p>{state.name}</p>,
  errorComponent: () => <p>error in ${name}</p>,
})
`

/** Ids of the modules of `file` a compiled module imports, by kind. */
function routeModuleRequests(code: string, file: string) {
  const requests = importRequests(code).filter(
    ({ specifier }) => specifier.split('?')[0] === file,
  )
  return {
    lazy: requests.filter((request) => request.dynamic),
    eager: requests.filter((request) => !request.dynamic),
  }
}

type Transforms = Awaited<ReturnType<typeof createCodeSplitterTransforms>>

/**
 * Compiles a route file and every module of it its output imports, like a
 * bundler: the route module, then the modules it imports lazily (split
 * chunks) and statically.
 */
function compileAll(splitter: Transforms, code: string, file: string) {
  const modules: Record<string, string | null> = {
    [file]: splitter.reference(code, file),
  }
  const queue = [modules[file]!]
  while (queue.length > 0) {
    const { lazy, eager } = routeModuleRequests(queue.shift()!, file)
    for (const { specifier } of [...lazy, ...eager]) {
      if (specifier in modules) {
        continue
      }
      const compile = specifier.includes('tsr-split=')
        ? splitter.virtual
        : splitter.shared
      modules[specifier] = compile(code, specifier)
      queue.push(modules[specifier] ?? '')
    }
  }
  return modules
}

describe('code-splitter plugin pipeline', () => {
  it('compiles a split module the same way when its id has extra query parameters', async () => {
    const file = routeFile('query')
    const code = routeSource('query')
    const splitter = await createCodeSplitterTransforms(
      {},
      { [file]: '/query' },
    )
    const { lazy, eager } = routeModuleRequests(
      splitter.reference(code, file)!,
      file,
    )
    expect(lazy.length).toBeGreaterThan(0)
    for (const { specifier } of [...lazy, ...eager]) {
      const compile = lazy.some((request) => request.specifier === specifier)
        ? splitter.virtual
        : splitter.shared
      const query = specifier.slice(file.length + 1)
      const output = compile(code, specifier)
      expect(output, specifier).toEqual(expect.any(String))
      expect(compile(code, `${file}?${query}&t=123`)).toBe(output)
      expect(compile(code, `${file}?t=123&${query}`)).toBe(output)
    }
  })

  it('compiles the modules of a route the same way after compiling another route', async () => {
    const files = {
      first: routeFile('first'),
      other: routeFile('other'),
    }
    const routes = { [files.first]: '/first', [files.other]: '/other' }
    const code = routeSource('first')
    const fresh = compileAll(
      await createCodeSplitterTransforms({}, routes),
      code,
      files.first,
    )
    const reused = await createCodeSplitterTransforms({}, routes)
    reused.reference(
      `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({ component: () => <p /> })
`,
      files.other,
    )
    expect(Object.keys(fresh).length).toBeGreaterThan(1)
    expect(compileAll(reused, code, files.first)).toEqual(fresh)
  })

  it('splits by the plugin-level splitBehavior for the route id', async () => {
    const splitBehavior: NonNullable<
      Config['codeSplittingOptions']
    >['splitBehavior'] = ({ routeId }) =>
      routeId === '/behavior'
        ? [['loader', 'component', 'errorComponent']]
        : undefined
    const route = await loadRoute(routeSource('behavior'), {
      routeId: '/behavior',
      pluginOptions: { codeSplittingOptions: { splitBehavior } },
    })
    await expectValidModules(route.modules)
    const lazy = routeModuleRequests(
      route.modules.reference!,
      route.graph.id,
    ).lazy
    // One lazy module provides the three options.
    expect(new Set(lazy.map((request) => request.specifier)).size).toBe(1)
    const evaluatedBefore = route.evaluated.length
    const values = []
    for (const option of ['loader', 'component', 'errorComponent']) {
      expect(route.isLazy(option), option).toBe(true)
      values.push(await route.load(option))
    }
    expect(route.evaluated.length).toBe(evaluatedBefore + 1)
    expect([values[0](), values[1](), values[2]()]).toEqual([
      { name: 'behavior' },
      '<p>behavior</p>',
      '<p>error in behavior</p>',
    ])
  })

  it('rejects invalid splitBehavior groupings', async () => {
    const file = routeFile('invalid')
    const splitter = await createCodeSplitterTransforms(
      {
        codeSplittingOptions: {
          splitBehavior: () => [['component'], ['component']],
        },
      },
      { [file]: '/invalid' },
    )
    expect(() => splitter.reference(routeSource('invalid'), file)).toThrow(
      'The groupings returned when using `splitBehavior` for the route',
    )
  })

  it('passes the deleteNodes option to the reference compiler', async () => {
    const file = routeFile('deleted')
    const splitter = await createCodeSplitterTransforms(
      { codeSplittingOptions: { deleteNodes: ['head'] } },
      { [file]: '/deleted' },
    )
    const reference = splitter.reference(routeSource('deleted'), file)!
    expect(reference).not.toContain('head')
    expect(reference).toContain('loader')
  })

  it('reports a split module id without a split value', async () => {
    const file = routeFile('missing')
    const splitter = await createCodeSplitterTransforms(
      {},
      { [file]: '/missing' },
    )
    expect(() =>
      splitter.virtual(routeSource('missing'), `${file}?tsr-split=`),
    ).toThrow('The split value for the virtual route')
  })

  it('leaves a shared module id alone when its route has no shared bindings', async () => {
    const file = routeFile('unshared')
    const code = `
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/unshared')({
  component: () => <p>unshared</p>,
})
`
    const splitter = await createCodeSplitterTransforms(
      {},
      { [file]: '/unshared' },
    )
    expect(splitter.reference(code, file)).toContain('tsr-split=component')
    expect(splitter.shared(code, `${file}?tsr-shared=1`)).toBeNull()
  })

  // File names from real apps: optional segments, pathless groups and escaped dots.
  it.each([
    'src/routes/{-$locale}/changelog.tsx',
    'src/routes/(marketing)/about.tsx',
    'src/routes/api/[.]well-known/security[.]txt.tsx',
  ])('loads the split modules of %s', async (filename) => {
    const route = await loadRoute(routeSource('route'), { filename })
    await expectValidModules(route.modules)
    expect(route.isLazy('component')).toBe(true)
    expect([route.options.loader(), (await route.load('component'))()]).toEqual(
      [{ name: 'route' }, '<p>route</p>'],
    )
  })

  it('only checks the plugin order when the router plugin is in the resolved config', async () => {
    const reactPlugin = { name: 'vite:react-babel' }
    const routerPlugin = {
      name: 'tanstack-router:code-splitter:compile-reference-file',
    }
    await expect(
      createCodeSplitterTransforms({}, {}, [reactPlugin]),
    ).resolves.toBeDefined()
    await expect(
      createCodeSplitterTransforms({}, {}, [reactPlugin, routerPlugin]),
    ).rejects.toThrow('Plugin order error')
  })

  it('imports the lazy route helpers of the Solid router for a Solid route', async () => {
    const route = await loadRoute(
      `import { createFileRoute, Outlet } from '@tanstack/solid-router'
import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
  loader: fetchPosts,
  component: PostsComponent,
})
const PostsComponent = () => {
  const posts = Route.useLoaderData()
  return <ul>{posts().length}<Outlet /></ul>
}
`,
      {
        targetFramework: 'solid',
        stubs: {
          './posts': { fetchPosts: () => [] },
          '@tanstack/solid-router': {
            createFileRoute: () => (options: unknown) => ({
              options,
              useLoaderData: () => () => ['a'],
            }),
          },
        },
      },
    )
    await expectValidModules(route.modules)
    for (const code of Object.values(route.modules)) {
      expect(importSources(code)).not.toContain('@tanstack/react-router')
    }
    expect(importSources(route.modules.reference!)).toContain(
      '@tanstack/solid-router',
    )
    expect(route.isLazy('component')).toBe(true)
    expect((await route.load('component'))()).toBe('<ul>1</ul>')
  })
})

describe('modules that are not route files', () => {
  it.each([
    {
      // Code-splitter fixture destructuring
      name: 'a module without a route',
      code: `import thing from 'thing'

export function test() {
  const {
    foo: {
      bar: { destructured },
    },
  } = thing

  return destructured
}
`,
    },
    {
      // Code-splitter fixture function-as-parameter
      name: 'a module passing named function expressions',
      code: `import * as React from 'react'
import { useMemo } from 'tan-react'

const ReactUseMemoCall = React.useMemo(function performAction() {
  return 'true'
}, [])

const UseMemoCall = useMemo(function performAction() {
  return 'true'
}, [])

console.info(ReactUseMemoCall, UseMemoCall)
`,
    },
    {
      name: 'a module mentioning a route factory in a string',
      code: `export const docs = "call createFileRoute('/path')({ component }) in a route file"
`,
    },
  ])('are left as written: $name', ({ code }) => {
    const { modules } = compileRouteModules(code)
    expect(modules).toEqual({ reference: code })
  })
})

// Source: code-splitter fixture directive-prologue. A directive only applies
// as the first statement of a module.
it('keeps the directive prologue of a route file first in every module', () => {
  const { modules } = compileRouteModules(`'use client'

import { createFileRoute } from '@tanstack/react-router'

const label = 'directive preserved'

export const Route = createFileRoute('/directive')({
  loader: () => label,
  component: () => <div>{label}</div>,
  errorComponent: () => <div>error</div>,
})
`)
  expect(Object.keys(modules).length).toBeGreaterThan(1)
  for (const [name, code] of Object.entries(modules)) {
    const [first] = parseModule(code).body
    expect(
      first?.type === 'ExpressionStatement' ? first.directive : undefined,
      name,
    ).toBe('use client')
  }
})

describe('route HMR plugin without code splitting', () => {
  function transformWith(
    options: Partial<Config> & { target: 'solid' | 'vue' },
  ) {
    const code = `
import { createFileRoute } from '@tanstack/${options.target}-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`
    return transformWithRouteHmrPlugin(code, options, {
      file: routeFile('hmr'),
      routeId: '/hmr',
    })
  }

  /** Stubs of the router package of `target`. */
  const routerStubs = (target: 'solid' | 'vue') => ({
    [`@tanstack/${target}-router`]: {
      createFileRoute: () => (options: unknown) => ({ options }),
    },
  })

  it.each(['solid', 'vue'] as const)(
    'appends Vite HMR handling to %s routes without changing them',
    async (target) => {
      const output = transformWith({ target })
      expect(await getModuleErrors(output)).toEqual([])
      let accepted = 0
      const { Route } = await evaluateModule(output, routerStubs(target), {
        importMeta: {
          hot: {
            data: {},
            accept: () => {
              accepted++
            },
            dispose: () => {},
          },
        },
      })
      expect(accepted).toBe(1)
      expect((Route as any).options.component()).toBe('<p>hmr</p>')
    },
  )

  it('uses webpack HMR with the generated route id for non-React routes', async () => {
    const output = transformWith({
      target: 'solid',
      plugin: { hmr: { style: 'webpack' } },
    })
    expect(await getModuleErrors(output)).toEqual([])
    const calls = { accept: 0 }
    const disposers: Array<(data: Record<string, unknown>) => void> = []
    const { Route } = await evaluateModule(output, routerStubs('solid'), {
      importMeta: {
        webpackHot: {
          data: {},
          accept: () => {
            calls.accept++
          },
          dispose: (callback: (data: Record<string, unknown>) => void) => {
            disposers.push(callback)
          },
        },
      },
    })
    expect((Route as any).options.component()).toBe('<p>hmr</p>')
    expect(calls.accept).toBe(1)
    // The next version of the module gets the route id through hot data.
    const data: Record<string, unknown> = {}
    disposers.forEach((dispose) => dispose(data))
    expect(Object.values(data)).toContain('/hmr')
  })
})
