import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { normalizePath } from '../src/core/utils'
import {
  createCodeSplitterTransforms,
  declarationOf,
  expectValidModules,
  exportedNames,
  importSources,
  importedNames,
  routeFile,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'
import type { CodeSplittingOptions, Config } from '../src/core/config'
import type { HmrStyle } from '../src/core/hmr'

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

describe('code-splitter plugin pipeline', () => {
  it('compiles a split module the same way when its id has extra query parameters', async () => {
    const file = routeFile('query')
    const code = routeSource('query')
    const splitter = await createCodeSplitterTransforms(
      {},
      { [file]: '/query' },
    )
    expect(splitter.reference(code, file)).toContain('tsr-split=component')

    const virtual = splitter.virtual(code, `${file}?tsr-split=component`)
    expect(virtual).toContain('state.name')
    expect(splitter.virtual(code, `${file}?tsr-split=component&t=123`)).toBe(
      virtual,
    )
    expect(splitter.virtual(code, `${file}?t=123&tsr-split=component`)).toBe(
      virtual,
    )
    const shared = splitter.shared(code, `${file}?tsr-shared=1`)
    expect(shared).toContain('"query"')
    expect(splitter.shared(code, `${file}?tsr-shared=1&t=123`)).toBe(shared)
  })

  it('compiles the split modules of a route with its own shared bindings after another route', async () => {
    const files = {
      shared: routeFile('shared'),
      unshared: routeFile('unshared'),
    }
    const splitter = await createCodeSplitterTransforms(
      {},
      { [files.shared]: '/shared', [files.unshared]: '/unshared' },
    )
    const code = routeSource('shared')
    // Bundlers transform the route modules first, then the chunks they import.
    splitter.reference(code, files.shared)
    splitter.reference(
      `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/unshared')({ component: () => <p /> })
`,
      files.unshared,
    )
    const component = splitter.virtual(
      code,
      `${files.shared}?tsr-split=component`,
    )!
    expect(importSources(component)).toContain(`${files.shared}?tsr-shared=1`)
    expect(splitter.shared(code, `${files.shared}?tsr-shared=1`)).toContain(
      '"shared"',
    )
  })

  it('splits by the plugin-level splitBehavior for the route id', async () => {
    const file = routeFile('behavior')
    const code = routeSource('behavior')
    const splitter = await createCodeSplitterTransforms(
      {
        codeSplittingOptions: {
          splitBehavior: ({ routeId }) =>
            routeId === '/behavior'
              ? [['loader', 'component', 'errorComponent']]
              : undefined,
        },
      },
      { [file]: '/behavior' },
    )
    const reference = splitter.reference(code, file)!
    expect(reference).toContain('tsr-split=component---errorComponent---loader')
    expect(reference).not.toMatch(/tsr-split=component["']/)
    const virtual = splitter.virtual(
      code,
      `${file}?tsr-split=component---errorComponent---loader`,
    )!
    expect(virtual).toContain('error in behavior')
    expect(await getModuleErrors(virtual)).toEqual([])
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

  // A tool with a persistent transform cache (Vitest's `fsModuleCache`) can
  // restore the compiled route module from disk. That process then compiles a
  // split or shared module of a route whose reference module it never compiled.
  describe('when the reference module was not compiled in this process', () => {
    const file = routeFile('posts')
    const sharedId = `${file}?tsr-shared=1`
    const routes = { [file]: '/posts' }
    const postsSource = (routeOptions = '') => `
import { createFileRoute } from '@tanstack/react-router'
import { createStore } from './store'
const visits = createStore(0)
export const Route = createFileRoute('/posts')({${routeOptions}
  loader: () => {
    visits.set(visits.get() + 1)
  },
  component: () => <p>{visits.get()}</p>,
})
`

    it('imports the shared bindings into a split module', async () => {
      const code = postsSource()
      const splitter = await createCodeSplitterTransforms({}, routes)
      const component = splitter.virtual(code, `${file}?tsr-split=component`)!
      expect(importedNames(component, sharedId)).toEqual(['visits'])
      expect(component).not.toMatch(declarationOf('visits'))

      // A bundler compiles the reference module first.
      splitter.reference(code, file)
      expect(splitter.virtual(code, `${file}?tsr-split=component`)).toBe(
        component,
      )
    })

    it('compiles the shared module', async () => {
      const code = postsSource()
      const splitter = await createCodeSplitterTransforms({}, routes)
      const shared = splitter.shared(code, sharedId)
      expect(shared).not.toBeNull()
      expect(exportedNames(shared!)).toEqual(['visits'])
      expect(shared).toMatch(declarationOf('visits'))
      expect(shared).not.toContain('createFileRoute')

      splitter.reference(code, file)
      expect(splitter.shared(code, sharedId)).toBe(shared)
    })

    const cases: Array<{
      name: string
      code: string
      options: CodeSplittingOptions
      split: string
      shared: Array<string>
    }> = [
      {
        name: 'the groupings in the route file',
        code: postsSource(`\n  codeSplitGroupings: [['component']],`),
        options: { splitBehavior: () => [['loader', 'component']] },
        split: 'component',
        shared: ['visits'],
      },
      {
        name: 'the splitBehavior for the route id',
        code: postsSource(),
        options: {
          defaultBehavior: [['loader', 'component']],
          splitBehavior: ({ routeId }) =>
            routeId === '/posts' ? [['component']] : undefined,
        },
        split: 'component',
        shared: ['visits'],
      },
      {
        name: 'the default behavior',
        code: postsSource(),
        options: { defaultBehavior: [['loader', 'component']] },
        split: 'component---loader',
        shared: [],
      },
    ]

    it.each(cases)(
      'splits by $name, like the reference module',
      async ({ code, options, split, shared }) => {
        const splitter = await createCodeSplitterTransforms(
          { codeSplittingOptions: options },
          routes,
        )
        const chunk = splitter.virtual(code, `${file}?tsr-split=${split}`)!
        expect(importedNames(chunk, sharedId)).toEqual(shared)
        const sharedModule = splitter.shared(code, sharedId)
        expect(
          sharedModule === null ? [] : exportedNames(sharedModule),
        ).toEqual(shared)

        splitter.reference(code, file)
        expect(splitter.virtual(code, `${file}?tsr-split=${split}`)).toBe(chunk)
        expect(splitter.shared(code, sharedId)).toBe(sharedModule)
      },
    )

    // `splitBehavior` decides by route id, which such a file does not have.
    it('splits a file that is not a known route by its own groupings or the default behavior', async () => {
      const code = postsSource()
      const splitBehavior = vi.fn(() => undefined)
      const splitter = await createCodeSplitterTransforms(
        { codeSplittingOptions: { splitBehavior } },
        {},
      )
      const component = splitter.virtual(code, `${file}?tsr-split=component`)!
      expect(importedNames(component, sharedId)).toEqual(['visits'])
      expect(exportedNames(splitter.shared(code, sharedId)!)).toEqual([
        'visits',
      ])
      expect(splitBehavior).not.toHaveBeenCalled()
    })
  })

  // File names from real apps: optional segments, pathless groups and escaped dots.
  it.each([
    'src/routes/{-$locale}/changelog.tsx',
    'src/routes/(marketing)/about.tsx',
    'src/routes/api/[.]well-known/security[.]txt.tsx',
  ])('imports the split modules of %s by its id', async (name) => {
    const file = normalizePath(path.join(process.cwd(), name))
    const code = routeSource('route')
    const splitter = await createCodeSplitterTransforms(
      {},
      { [file]: '/route' },
    )
    const modules = {
      reference: splitter.reference(code, file)!,
      component: splitter.virtual(code, `${file}?tsr-split=component`)!,
      shared: splitter.shared(code, `${file}?tsr-shared=1`)!,
    }
    expect(modules.reference).toContain(`${file}?tsr-split=component`)
    expect(importSources(modules.reference)).toContain(`${file}?tsr-shared=1`)
    expect(importSources(modules.component)).toContain(`${file}?tsr-shared=1`)
    await expectValidModules(modules)
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
})

describe('route HMR plugin without code splitting', () => {
  function transformWith(
    options: Partial<Config> & { target: 'solid' | 'vue' },
    hmrStyle?: HmrStyle,
  ) {
    const code = `
import { createFileRoute } from '@tanstack/${options.target}-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`
    return transformWithRouteHmrPlugin(
      code,
      options,
      { file: routeFile('hmr'), routeId: '/hmr' },
      hmrStyle,
    )
  }

  it.each(['solid', 'vue'] as const)(
    'appends Vite HMR handling to %s routes without changing them',
    async (target) => {
      const output = transformWith({ target })
      expect(output).toContain('import.meta.hot')
      expect(output).toContain('"/hmr"')
      expect(output).toContain('<p>hmr</p>')
      expect(output).not.toContain('TSRComponent')
      expect(await getModuleErrors(output)).toEqual([])
    },
  )

  it('uses webpack HMR with the generated route id for non-React routes', async () => {
    const output = transformWith({ target: 'solid' }, 'webpack')
    expect(output).toContain('import.meta.webpackHot')
    expect(output).not.toContain('import.meta.hot.')
    expect(output).toContain('"/hmr"')
    expect(output).not.toContain('__react_refresh_utils__')
    expect(await getModuleErrors(output)).toEqual([])
  })
})
