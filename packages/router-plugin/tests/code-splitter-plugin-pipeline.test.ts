import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createServer } from 'vite'
import { describe, expect, it } from 'vitest'
import { normalizePath } from '../src/core/utils'
import { tanstackRouter } from '../src/vite'
import {
  createCodeSplitterTransforms,
  createRouteHmrTransform,
  expectValidModules,
  exportedNames,
  head,
  importSources,
  importedNames,
  routeFile,
  transformWithRouteHmrPlugin,
} from './regression-helpers'
import { getModuleErrors } from './validate-module'
import type { ViteDevServer } from 'vite'
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

/**
 * In dev, an edit invalidates every module of the route file: the route
 * module, its `?tsr-split=` chunks and its `?tsr-shared=1` module. The browser
 * requests them again in no fixed order (unbundled Vite dev sends one request
 * each, in parallel), and Vite keeps each result until the next edit. These
 * tests request the chunks and the shared module before the route module, and
 * compare them with what a dev server started after the edit compiles.
 */
describe('a dev server compiling an edited route out of order', () => {
  const route = '/routes/page.tsx'
  const shared = `${route}?tsr-shared=1`

  function startServer(root: string) {
    return createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      // No watcher: the test invalidates the edited file itself, as the
      // watcher would
      server: { middlewareMode: true, watch: null },
      appType: 'custom',
      plugins: [
        tanstackRouter({
          target: 'react',
          autoCodeSplitting: true,
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
        }),
      ],
    })
  }

  /** Requests `ids` in order: errors, exports and shared imports by id. */
  async function inspect(server: ViteDevServer, ids: Array<string>) {
    const modules: Record<
      string,
      {
        errors: Array<string>
        exports: Array<string>
        fromShared: Array<string>
      }
    > = {}
    for (const id of ids) {
      const code = (await server.transformRequest(id))!.code
      modules[id] = {
        errors: await getModuleErrors(code),
        exports: exportedNames(code),
        fromShared: importedNames(code, shared),
      }
    }
    return modules
  }

  const twoCards = `${head}function CardA() { return <b>A</b> }
function CardB() { return <i>B</i> }
export const Route = createFileRoute('/page')({
  component: () => <p><CardA /><CardB /></p>,
  errorComponent: () => <p><CardA /><CardB /></p>,
})
`
  const oneCard = `${head}function CardA() { return <b>A</b> }
export const Route = createFileRoute('/page')({
  component: () => <p><CardA /></p>,
  errorComponent: () => <p><CardA /></p>,
})
`

  // Bug, already on main and much easier to hit since the Yuku migration: the
  // route module's transform computes the bindings that go to the shared
  // module and stores them by file, and the shared and split transforms read
  // that stored set instead of deriving it from the code they compile.
  // Requested before the route module after an edit, they compile the new
  // source with the previous set: a removed binding is still exported
  // ("Export 'suffix' is not defined", and the page stays broken until the
  // next edit or a restart), an added one is copied into each chunk instead of
  // shared. On main this needs a binding that two split options share (the
  // last two rows fail on main too). The migration also moves an exported
  // component's private dependencies to the shared module, so removing a
  // helper of an exported component that a split component renders hits it
  // too (the first row, which passes on main). Fails until the shared and
  // split transforms compute the set from the code they receive.
  it.each([
    [
      'removing a helper of an exported component a split component renders',
      {
        before: `${head}const prefix = 'a'
const suffix = 'b'
export function Card() { return <b>{prefix}{suffix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
        after: `${head}const prefix = 'a'
export function Card() { return <b>{prefix}</b> }
export const Route = createFileRoute('/page')({ component: () => <Card /> })
`,
        splits: ['component'],
      },
    ],
    [
      'removing a component two split options render',
      {
        before: twoCards,
        after: oneCard,
        splits: ['component', 'errorComponent'],
      },
    ],
    [
      'adding a component two split options render',
      {
        before: oneCard,
        after: twoCards,
        splits: ['component', 'errorComponent'],
      },
    ],
  ])(
    'compiles the shared module and chunks requested first from the edited source after %s',
    async (_, { before, after, splits }) => {
      const ids = [
        route,
        shared,
        ...splits.map((split) => `${route}?tsr-split=${split}`),
      ]
      // Keep the temporary app inside the package so runtime imports resolve.
      const root = await mkdtemp(path.join(__dirname, '.dev-edit-order-'))
      const file = normalizePath(path.join(root, 'routes/page.tsx'))
      let server: ViteDevServer | undefined
      try {
        await mkdir(path.join(root, 'routes'))
        await writeFile(
          path.join(root, 'routes/__root.tsx'),
          `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({})`,
        )
        await writeFile(file, before)
        server = await startServer(root)
        // The page loads: the route module first, then the modules it imports
        await inspect(server, ids)

        await writeFile(file, after)
        server.environments.client.moduleGraph.onFileChange(file)
        const outOfOrder = await inspect(server, [...ids.slice(1), route])
        await server.close()

        server = await startServer(root)
        const expected = await inspect(server, ids)
        for (const module of Object.values(expected)) {
          expect(module.errors).toEqual([])
        }
        expect(outOfOrder).toEqual(expected)
      } finally {
        await server?.close()
        await rm(root, { recursive: true, force: true })
      }
    },
    30_000,
  )
})

describe('route HMR plugin without code splitting', () => {
  function transformWith(
    options: Partial<Config> & { target: 'solid' | 'vue' },
    imports = '',
  ) {
    const code = `
import { createFileRoute } from '@tanstack/${options.target}-router'
${imports}export const Route = createFileRoute('/hmr')({
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

  // Regression in the Yuku migration: the plugin reprints Solid and Vue
  // routes and prints `import type {} from 'zod'` as `import type 'zod'`, a
  // syntax error. Yuku codegen bug,
  // https://github.com/yuku-toolchain/yuku/issues/258; passes once Yuku ships
  // the fix.
  // Source: corpus-diff, tinloof/tanstack-wsr src/types.ts (an empty type
  // import fixes TypeScript's "inferred type cannot be named" error).
  it('keeps routes with an empty type-only import valid', async () => {
    const output = transformWith(
      { target: 'solid' },
      "import type {} from 'zod'\n",
    )
    expect(output).toContain('import.meta.hot')
    expect(await getModuleErrors(output)).toEqual([])
  })

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

describe('Vite HMR boundaries', () => {
  // Vite marks a module self-accepting only when its code contains a literal
  // `import.meta.hot.accept(`. A route module that is not an HMR boundary of
  // its own propagates an edit to the route tree and the app entry, and the
  // page reloads. React Refresh makes React route modules boundaries; Solid
  // Refresh does so only for modules that declare components, and Vue JSX only
  // for exported components, so Solid and Vue rely on the route HMR code.
  it.each([
    { target: 'solid', autoCodeSplitting: true },
    { target: 'solid', autoCodeSplitting: false },
    { target: 'vue', autoCodeSplitting: true },
    { target: 'vue', autoCodeSplitting: false },
  ] as const)(
    'a $target route module accepts its own updates (autoCodeSplitting: $autoCodeSplitting)',
    async ({ target, autoCodeSplitting }) => {
      // Keep the temporary app inside the package so runtime imports resolve.
      const root = await mkdtemp(path.join(__dirname, '.hmr-boundary-'))
      const routerPackage = `@tanstack/${target}-router`
      let server: ViteDevServer | undefined
      try {
        await mkdir(path.join(root, 'routes'))
        await writeFile(
          path.join(root, 'routes/__root.tsx'),
          `import { createRootRoute } from '${routerPackage}'
export const Route = createRootRoute({})`,
        )
        await writeFile(
          path.join(root, 'routes/index.tsx'),
          `import { createFileRoute } from '${routerPackage}'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
function Page() {
  return 'page'
}`,
        )
        server = await createServer({
          root,
          configFile: false,
          logLevel: 'silent',
          server: { watch: null },
          plugins: [
            {
              // The framework packages are not dependencies of this package.
              name: 'stub-router-package',
              enforce: 'pre',
              resolveId: (id) => (id === routerPackage ? `\0${id}` : null),
              load: (id) =>
                id === `\0${routerPackage}`
                  ? 'export const createRootRoute = (o) => o, createFileRoute = () => (o) => o, lazyRouteComponent = () => null'
                  : null,
            },
            tanstackRouter({
              target,
              routesDirectory: './routes',
              generatedRouteTree: './routeTree.gen.ts',
              autoCodeSplitting,
            }),
          ],
        })
        const client = server.environments.client
        await client.transformRequest('/routes/index.tsx')
        const module =
          await client.moduleGraph.getModuleByUrl('/routes/index.tsx')
        expect(module?.isSelfAccepting).toBe(true)
      } finally {
        await server?.close()
        await rm(root, { recursive: true, force: true })
      }
    },
    30_000,
  )
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
