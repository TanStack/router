import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { normalizePath } from '../src/core/utils'
import {
  createCodeSplitterTransforms,
  createRouteHmrTransform,
  head,
  expectValidModules,
  importSources,
  routeFile,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'
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
    const output = transformWith({
      target: 'solid',
      plugin: { hmr: { style: 'webpack' } },
    })
    expect(output).toContain('import.meta.webpackHot')
    expect(output).not.toContain('import.meta.hot.')
    expect(output).toContain('"/hmr"')
    expect(output).not.toContain('__react_refresh_utils__')
    expect(await getModuleErrors(output)).toEqual([])
  })
})

describe('a route created inside a function', () => {
  const routeInHelper = `
import { createFileRoute } from '@tanstack/react-router'
function makeRoute() {
  return createFileRoute('/made')({ component: () => <p>made</p> })
}
export const Route = makeRoute()
`
  const routeInIife = `
import { createFileRoute } from '@tanstack/react-router'
export const Route = (() =>
  createFileRoute('/made')({ component: () => <p>made</p> }))()
`
  const moduleRoute = `
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/made')({ component: () => <p>made</p> })
`
  const moduleRouteWithCodeRouteInHelper = `
import { createFileRoute, createRoute } from '@tanstack/react-router'
export function makeChild(label: string) {
  return createRoute({
    getParentRoute: () => Route,
    path: label,
    component: () => <p>{label}</p>,
  })
}
export const Route = createFileRoute('/made')({ component: () => <p>made</p> })
`
  const warning = (file: string) =>
    expect.stringContaining(
      `[tanstack-router] The route in "${file}" is created inside a function.`,
    )

  // Each plugin path: a transform of `file` (registered as the route `/made`)
  // and the spy on the warnings it reports to the bundler.
  const pluginPaths = {
    'code splitter': async (files: Array<string>) => {
      const splitter = await createCodeSplitterTransforms(
        {},
        Object.fromEntries(files.map((file) => [file, '/made'])),
      )
      return { transform: splitter.reference, warn: splitter.warn }
    },
    'route HMR plugin': async (files: Array<string>) =>
      createRouteHmrTransform(
        { target: 'react' },
        Object.fromEntries(files.map((file) => [file, '/made'])),
      ),
  }

  describe.each(Object.entries(pluginPaths))('through the %s', (_, create) => {
    it.each([
      ['a helper function', routeInHelper],
      ['an IIFE', routeInIife],
    ])('is reported when built in %s', async (_, code) => {
      const file = routeFile('made')
      const { transform, warn } = await create([file])
      transform(code, file)
      expect(warn).toHaveBeenCalledExactlyOnceWith(warning(file))
      expect(warn.mock.calls[0]![0]).toContain(
        "export const Route = createFileRoute('/path')({ ... })",
      )
    })

    it.each([
      ['a module-scope route', moduleRoute],
      [
        'a module-scope route next to a code route a function creates',
        moduleRouteWithCodeRouteInHelper,
      ],
    ])('is not reported for %s', async (_, code) => {
      const file = routeFile('made')
      const { transform, warn } = await create([file])
      transform(code, file)
      expect(warn).not.toHaveBeenCalled()
    })

    it('is reported once per file across repeated transforms', async () => {
      const files = [routeFile('made'), routeFile('other')]
      const { transform, warn } = await create(files)
      for (let edit = 0; edit < 3; edit++) {
        for (const file of files) {
          transform(`${routeInHelper}// edit ${edit}\n`, file)
        }
      }
      expect(warn.mock.calls).toEqual(files.map((file) => [warning(file)]))
    })
  })
})

describe('route file diagnostics', () => {
  const file = routeFile('diagnosed')
  const createSplitter = () =>
    createCodeSplitterTransforms({}, { [file]: '/diagnosed' })

  describe('a route file that creates two file routes', () => {
    it('fails to compile, naming the file and both calls', async () => {
      const splitter = await createSplitter()
      const code = `${head}export const Route = createFileRoute('/diagnosed')({ component: () => <p>a</p> })
const Other = createFileRoute('/other')({ component: () => <p>b</p> })
`
      expect(() => splitter.reference(code, file)).toThrow(
        [
          `[tanstack-router] "${file}" calls createFileRoute 2 times:`,
          `- ${file}:2:22`,
          `- ${file}:3:15`,
          'A route file creates exactly one file route.',
        ].join('\n'),
      )
    })

    it('compiles a root route next to a file route', async () => {
      const splitter = await createSplitter()
      const code = `import { createFileRoute, createRootRoute } from '@tanstack/react-router'
export const Root = createRootRoute({})
export const Route = createFileRoute('/diagnosed')({ component: () => <p>a</p> })
`
      expect(splitter.reference(code, file)).toContain('tsr-split=component')
      expect(splitter.warn).not.toHaveBeenCalled()
    })
  })

  it('reports an exported split option once per file in a build, where it is the only split option', async () => {
    const code = `${head}export function Page() { return <p>page</p> }
export const Route = createFileRoute('/diagnosed')({ component: Page })
`
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const splitter = await createSplitter()
    expect(splitter.reference(code, file)).toBeNull()
    expect(splitter.reference(`${code}// edit\n`, file)).toBeNull()
    expect(splitter.warn).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(
        `[tanstack-router] These exports from "${file}" will not be code-split and will increase your bundle size:\n- Page`,
      ),
    )
    // The bundler reports it, not the console of the build process
    expect(consoleWarn).not.toHaveBeenCalled()
    consoleWarn.mockRestore()
  })

  describe('route options the code splitter cannot read', () => {
    it.each([
      [
        'a method',
        'component() { return <p>a</p> }',
        '"component" route option at {file}:4:3 is a method',
      ],
      [
        'a getter',
        'get component() { return () => <p>a</p> }',
        '"component" route option at {file}:4:3 is a getter',
      ],
      [
        'a computed key',
        "['component']: () => <p>a</p>",
        '"component" route option at {file}:4:3 uses a computed key',
      ],
    ])('reports %s', async (_, option, message) => {
      const splitter = await createSplitter()
      splitter.reference(
        `${head}export const Route = createFileRoute('/diagnosed')({
  loader: () => null,
  ${option},
})
`,
        file,
      )
      expect(splitter.warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(message.replace('{file}', file)),
      )
    })

    it('does not report a method the groupings do not split', async () => {
      const splitter = await createSplitter()
      splitter.reference(
        `${head}export const Route = createFileRoute('/diagnosed')({
  loader() { return null },
  component: () => <p>a</p>,
})
`,
        file,
      )
      expect(splitter.warn).not.toHaveBeenCalled()
    })

    it('rejects codeSplitGroupings behind a computed key', async () => {
      const splitter = await createSplitter()
      expect(() =>
        splitter.reference(
          `${head}export const Route = createFileRoute('/diagnosed')({
  ['codeSplitGroupings']: [['component', 'errorComponent']],
  component: () => <p>a</p>,
})
`,
          file,
        ),
      ).toThrow('use a computed key, so they cannot be read')
    })

    it('reports split options and codeSplitGroupings spread from another object', async () => {
      const splitter = await createSplitter()
      splitter.reference(
        `${head}const shared = {
  codeSplitGroupings: [['component', 'errorComponent']],
  component: () => <p>a</p>,
  errorComponent: () => <p>error</p>,
}
export const Route = createFileRoute('/diagnosed')({
  ...shared,
  errorComponent: () => <p>own error</p>,
})
`,
        file,
      )
      expect(splitter.warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(
          `The route options at ${file}:8:3 spread codeSplitGroupings, component from another object.`,
        ),
      )
    })
  })

  describe('a renamed route factory', () => {
    const aliased = `import { createFileRoute as cfr } from '@tanstack/react-router'
export const Route = cfr('/diagnosed')({ component: () => <p>a</p> })
`
    const namespaced = `import * as Router from '@tanstack/react-router'
export const Route = Router.createFileRoute('/diagnosed')({ component: () => <p>a</p> })
`
    const warnings = [
      [
        expect.stringContaining(
          `"${file}" imports createFileRoute as cfr. Route factories are only recognized by their own name`,
        ),
      ],
      [
        expect.stringContaining(
          `"${file}" calls Router.createFileRoute through a namespace import.`,
        ),
      ],
    ]

    it('is reported by the code splitter', async () => {
      const splitter = await createSplitter()
      splitter.reference(aliased, file)
      splitter.reference(namespaced, file)
      expect(splitter.warn.mock.calls).toEqual(warnings)
    })

    it('is reported by the route HMR plugin', () => {
      const hmr = createRouteHmrTransform(
        { target: 'react' },
        { [file]: '/diagnosed' },
      )
      hmr.transform(aliased, file)
      hmr.transform(namespaced, file)
      expect(hmr.warn.mock.calls).toEqual(warnings)
    })
  })
})
