/**
 * The router plugin in a real Vite pipeline (SPEC J2.1, J2.13, G4, G5, G11):
 * the public composed `tanstackRouter` and the framework's Vite plugin in a
 * real dev server (`route-app.ts`, or `dev-page.ts` for a whole app), Vite
 * resolving the config, ordering the plugins, applying their hook filters,
 * and the page importing what the dev server serves. Diagnostics are judged
 * by content on every channel at once (the error a compile throws, the
 * console, Vite's logger).
 */
import { createServerModuleRunner, parseSync } from 'vite'
import { describe, expect, it } from 'vitest'
import {
  captureThrow,
  diagnosticPosition,
  expectDiagnostic,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  expectValidModules,
  head,
  holdsMarker,
  loadRoute,
} from '../../route-app'
import type { ESTree } from 'vite'
import type { Config } from '../../../src'
import type { RouteApp, RouteAppOptions } from '../../route-app'

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

/**
 * A virtual route config (the public `virtualRouteConfig` option) of an app
 * whose root has the route files `files` (path → route id).
 */
const routesOf = (files: Record<string, string>) =>
  ({
    type: 'root',
    file: '__root.tsx',
    children: Object.entries(files).map(([file, path]) => ({
      type: 'route',
      path,
      file,
    })),
  }) as Config['virtualRouteConfig']

/**
 * The directive prologue of a module as the page receives it: the leading
 * string-literal expression statements, after the statements Vite's import
 * analysis puts first (its hot context and the CommonJS interop of
 * dependencies, which name Vite's own `__vite__` bindings: not the
 * module's code). An independent parse of the served module.
 */
function servedPrologue(code: string) {
  const { program } = parseSync('module.js', code, { sourceType: 'module' })
  const body = program.body as Array<ESTree.Statement>
  let index = 0
  while (
    index < body.length &&
    /\b__vite__\w+/.test(code.slice(body[index]!.start, body[index]!.end))
  ) {
    index++
  }
  const directives: Array<string> = []
  for (; index < body.length; index++) {
    const statement = body[index]!
    if (
      statement.type !== 'ExpressionStatement' ||
      statement.expression.type !== 'Literal' ||
      typeof statement.expression.value !== 'string'
    ) {
      break
    }
    directives.push(statement.expression.value)
  }
  return directives
}

// The router plugin's public Vite adapter in a real Vite dev server: Vite
// resolves the config, orders the plugins, applies their hook filters and
// resolves and loads the emitted modules.
describe('code-splitter plugin pipeline', () => {
  // A request with Vite's cache-busting parameter (`t=…`) reaches a split
  // module the way real usage does: after an edit, Vite's import analysis
  // adds it to the imports of the modules the edit changed
  // (code-splitter-edits.test.ts renders the edited route in a new document;
  // the route-hmr-browser*.test.ts pages hot-update it). Vite strips the
  // parameter before any plugin hook sees a file's id, and a module whose
  // id never changes is never requested with it, so no test imports an
  // emitted module by its id (SPEC §8, §5.3).

  // One plugin instance compiles every route of an app: what it emits for a
  // route does not depend on the routes it compiled before (SPEC G4). The
  // same modules, the same groups and the same behaviour, and the same
  // diagnostics; the emitted text is free.
  it('compiles the modules of a route the same way after compiling another route', async () => {
    const options: RouteAppOptions = {
      filename: 'first.tsx',
      routeId: '/first',
      // A dev server of its own each: one compiles another route first
      fresh: true,
      files: {
        'other.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/other')({ component: () => <p /> })
`,
      },
      pluginOptions: {
        virtualRouteConfig: routesOf({
          'first.tsx': '/first',
          'other.tsx': '/other',
        }),
      },
    }
    /** What the first route is and does, and what its compile reported. */
    const observe = async (route: RouteApp) => {
      const mark = route.host.diagnostics.length
      const observed = {
        ids: (await route.modules()).ids,
        groups: await route.groups(),
        ...(await route.run<Record<string, unknown>>(`return {
  loader: await options.loader(),
  head: options.head(),
  component: await render('component'),
  errorComponent: await render('errorComponent'),
}`)),
      }
      await route.host.dev.idle()
      const reported = route.host.diagnostics
        .slice(mark)
        .map(({ severity, text }) => ({
          severity,
          text: text.replaceAll(route.host.root, '<root>'),
        }))
      return { observed, reported }
    }
    const fresh = await observe(await loadRoute(routeSource('first'), options))
    const reused = await loadRoute(routeSource('first'), options)
    // The other route of the app, compiled first (its split component too)
    await reused.host.runClient(
      '/other.tsx',
      'await module.Route.options.component.preload?.()',
    )
    const again = await observe(reused)
    expect(fresh.observed.groups).not.toEqual([])
    expect(again).toEqual(fresh)
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
      // A function option: a dev server of its own
      fresh: true,
      pluginOptions: { codeSplittingOptions: { splitBehavior } },
    })
    await expectValidModules(route)
    expect(
      await route.run(`return [
  await options.loader(),
  await render('component'),
  await render('errorComponent'),
]`),
    ).toEqual([
      { name: 'behavior' },
      '<p>behavior</p>',
      '<p>error in behavior</p>',
    ])
    // The three options load lazily, together: loading one makes the
    // others available.
    expect(await route.groups()).toEqual([
      ['component', 'errorComponent', 'loader'],
    ])
  })

  it('rejects invalid splitBehavior groupings with an error naming the option and the route file', async () => {
    const route = await loadRoute(routeSource('invalid'), {
      filename: 'invalid.tsx',
      routeId: '/invalid',
      fresh: true,
      pluginOptions: {
        codeSplittingOptions: {
          splitBehavior: () => [['component'], ['component']],
        },
      },
    })
    // The error the compile throws, with what every channel reported (the
    // wording and the channel are free, SPEC §5.7)
    const thrown = await captureThrow(() => route.transform())
    expectDiagnostic([...thrown, ...(await route.diagnostics())], {
      severity: 'error',
      file: 'invalid.tsx',
      root: route.host.root,
    })
  })

  // File names from real apps: optional segments, pathless groups and escaped dots.
  it.each([
    'src/routes/{-$locale}/changelog.tsx',
    'src/routes/(marketing)/about.tsx',
    'src/routes/api/[.]well-known/security[.]txt.tsx',
  ])('loads the split modules of %s', async (filename) => {
    const route = await loadRoute(routeSource('route'), {
      filename,
      routeId: '/route',
    })
    await expectValidModules(route)
    expect(await route.isLazy('component')).toBe(true)
    expect(
      await route.run(`return [options.loader(), await render('component')]`),
    ).toEqual([{ name: 'route' }, '<p>route</p>'])
  })

  // The documented order: the framework's JSX plugin after the router
  // plugin (the order of every route app: `@vitejs/plugin-react` /
  // `vite-plugin-solid` after `tanstackRouter`, as Vite resolves them). The
  // other order (a correct split, or an actionable diagnostic naming the
  // plugins, SPEC G11) goes through real builds:
  // integration/code-splitter-pragmas.test.ts.
  it.each([
    {
      name: '@vitejs/plugin-react',
      target: 'react' as const,
      route: routeSource('order'),
      routeId: '/order',
    },
    {
      name: 'vite-plugin-solid',
      target: 'solid' as const,
      route: `import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/')({ component: () => <p>solid</p> })
`,
      routeId: '/',
    },
  ])(
    'accepts $name after the router plugin',
    async ({ target, route, routeId }) => {
      const loaded = await loadRoute(route, {
        targetFramework: target,
        routeId,
      })
      expect(await loaded.isLazy('component')).toBe(true)
    },
  )

  // A dev server compiles each edit of a route file with the same plugin
  // instance.
  it('compiles an edited route like a fresh one after a version whose loader and component shared a binding', async () => {
    const files = { 'label.ts': `export const label = { text: 'imported' }\n` }
    const before = await loadRoute(
      `${head}const label = { text: 'before' }
export const Route = createFileRoute('/')({
  loader: () => label,
  component: () => <p>{label.text}</p>,
})
`,
      { files },
    )
    expect(await before.run(`return render('component')`)).toBe('<p>before</p>')
    const after = await loadRoute(
      `${head}import { label } from './label'
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: () => <p>{label.text}</p>,
})
`,
      { files },
    )
    await expectValidModules(after)
    expect(
      await after.run(`return [options.loader(), await render('component')]`),
    ).toEqual(['data', '<p>imported</p>'])
  })

  // Each framework's route module imports the lazy route helpers from its
  // own router package, and no module the page loads is another
  // framework's router: the routes run with the real router of their
  // framework in the page.
  describe.each(['solid', 'vue'] as const)('a %s route', (framework) => {
    const routerPackage = `@tanstack/${framework}-router`
    const otherRouters = ['react', 'solid', 'vue']
      .filter((other) => other !== framework)
      .map((other) => `${other}-router`)
    // Route hooks return an accessor in Solid and a ref in Vue
    const read = framework === 'solid' ? 'posts()' : 'posts.value'

    it.each([
      { groupings: undefined, loaderSplit: false },
      { groupings: `[['loader'], ['component']]`, loaderSplit: true },
    ])(
      'loads its split options with groupings $groupings',
      async ({ groupings, loaderSplit }) => {
        const code = `import { createFileRoute, Outlet } from '${routerPackage}'
import { fetchPosts } from './posts'
export const Route = createFileRoute('/posts')({
${groupings ? `  codeSplitGroupings: ${groupings},\n` : ''}  loader: fetchPosts,
  component: PostsComponent,
})
const PostsComponent = () => {
  const posts = Route.useLoaderData()
  return <ul>{${read}.length}<Outlet /></ul>
}
`
        const route = await loadRoute(code, {
          targetFramework: framework,
          routeId: '/posts',
          files: { 'posts.ts': `export const fetchPosts = () => ['post']\n` },
        })
        await expectValidModules(route)
        const loaded = await route.run<{
          html: string
          others: Array<string>
        }>(`await trigger('component')
await trigger('loader')
const html = (await renderRoute()).replace(/<!--.*?-->/g, '')
const others = ${JSON.stringify(otherRouters)}
return {
  html,
  others: performance
    .getEntriesByType('resource')
    .map((entry) => entry.name)
    .filter((name) => others.some((other) => name.includes(other))),
}`)
        expect([
          loaded,
          await route.isLazy('component'),
          await route.isLazy('loader'),
        ]).toEqual([{ html: '<ul>1</ul>', others: [] }, true, loaderSplit])
      },
    )
  })
})

// A route compiled for route HMR also serves where no HMR runtime runs:
// the dev server's SSR environment through a module runner without HMR
// (Vite's public \`createServerModuleRunner(environment, { hmr: false })\`,
// as a custom SSR server or a non-Node runtime creates one: no
// \`import.meta.hot\`). SPEC J3.8: without an HMR runtime the module still
// evaluates and \`Route\` works.
it.each([
  { name: 'code splitter', options: {} },
  {
    name: 'route HMR plugin (code splitting off)',
    options: { pluginOptions: { autoCodeSplitting: false } },
  },
])(
  'a route compiled for HMR by the $name evaluates and works in the SSR environment',
  async ({ options }) => {
    const route = await loadRoute(routeSource('ssr'), {
      routeId: '/ssr',
      hmr: true,
      ...options,
    })
    const runner = createServerModuleRunner(
      route.host.dev.vite.environments.ssr,
      { hmr: false },
    )
    const { Route } = await runner.import(route.url)
    const { loader, component } = Route.options
    await component.preload?.()
    await runner.close()
    expect([
      await (typeof loader === 'function' ? loader() : loader.handler()),
      typeof component,
    ]).toEqual([{ name: 'ssr' }, 'function'])
  },
)

// Shape of the deleted code-splitter snapshot fixture directive-prologue. A
// directive only applies as the first statement of a module: the route
// module and every module carrying the route file's code keep it first
// (a pure support module the compiler adds may have none, §5.8).
it('keeps the directive prologue of a route file first in the route module and every module holding its code', async () => {
  const route = await loadRoute(
    `'use client'

import { createFileRoute } from '@tanstack/react-router'

const label = 'directive preserved'

export const Route = createFileRoute('/directive')({
  loader: () => label,
  component: () => <div>{label} MARK_PAGE</div>,
  errorComponent: () => <div>MARK_ERROR</div>,
})
`,
    { routeId: '/directive' },
  )
  expect(await route.isLazy('component')).toBe(true)
  const { modules } = await route.modules()
  const carrying = Object.entries(modules).filter(
    ([name, code]) =>
      name === 'reference' ||
      ['directive preserved', 'MARK_PAGE', 'MARK_ERROR'].some((marker) =>
        holdsMarker(code, marker),
      ),
  )
  // The route module, the component's and the error component's code
  expect(carrying.length).toBeGreaterThan(2)
  for (const [name, code] of carrying) {
    expect(servedPrologue(code)[0], name).toBe('use client')
  }
})

// Source: #8504 router-utils prepend-statements.test.ts ("inserts after the
// complete prologue"), at compiler level: the route HMR code and the
// splitter's imports go after the whole prologue.
it.each([false, true])(
  'keeps the whole directive prologue first (hmr: %s)',
  async (hmr) => {
    const route = await loadRoute(
      `'use client'
'use strict'
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/directive')({
  component: () => <div>page</div>,
})
`,
      { hmr, routeId: '/directive' },
    )
    // The order among the directives of one prologue is free (SPEC §5.5):
    // both lead the module, each once.
    expect(servedPrologue(await route.transform()).sort()).toEqual([
      'use client',
      'use strict',
    ])
  },
)

// Source: #8504 router-utils diagnostics.test.ts ("reports actionable syntax
// locations"), at plugin level. Bundlers name the file of a plugin error;
// the plugin reports where in it the error is.
it.each(['\n', '\r\n', '\r', ' ', ' '])(
  'reports the line and column of a syntax error in a route file with %j line endings and Unicode source',
  async (newline) => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({})
// 😀é${newline}/* 😀é */ export const broken = ;`
    const route = await loadRoute(code, { hmr: true })
    // The error points at the unexpected `;` (structured fields or a
    // rendered code frame; the wording and the channel are free).
    const thrown = await captureThrow(() => route.transform())
    expectDiagnostic([...thrown, ...(await route.diagnostics())], {
      severity: 'error',
      position: diagnosticPosition(code, code.lastIndexOf(';')),
    })
  },
)
