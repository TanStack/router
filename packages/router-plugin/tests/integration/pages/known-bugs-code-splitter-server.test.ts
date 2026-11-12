/**
 * Known code-splitter bugs (part 4 of known-bugs-code-splitter.test.ts): code
 * that reads a split binding, class components, side-effect imports,
 * server-only route options on the client and look-alike route factories.
 * Each test asserts the correct behaviour for a shape a code-splitter bug broke (a regression test).
 *
 * Every route is loaded through the public router plugin in a real Vite dev
 * server and run in a real browser page (`./route-app`); what the user is
 * told is read from the dev server's merged diagnostic channel.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import {
  expectValidModules,
  head,
  holdsMarker,
  loadRoute,
} from '../../route-app'
import type { RouteApp, RouteAppOptions } from '../../route-app'

/**
 * Whether the dev server reported (a warning on any channel: the route
 * loaded, so nothing was refused) something about the route file, naming
 * it (J2.8: an option left unsplit is reported; the wording is free). Read
 * once the page loaded the route.
 */
async function reportsNotSplit(route: RouteApp) {
  return (
    findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: route.url.slice(1),
      root: route.host.root,
    }).length > 0
  )
}

describe('code that reads a split binding', () => {
  /**
   * Loads a route whose component is `Page`, declared next to `exports`,
   * and returns what the route renders, what the component `read` (an
   * expression of the imported `value`) gets from the route module's export
   * `name` (as another module of the app imports it) renders, and whether
   * `Page` is split or the user is told it is not (a warning naming the
   * route file and `component`).
   */
  async function renderPage(exports: string, name: string, read = 'value') {
    const route = await loadRoute(
      `${head}import { wrap } from './wrap'
function Page() {
  return <p>page</p>
}
${exports}
export const Route = createFileRoute('/')({ component: Page })
`,
      {
        files: {
          'wrap.ts': `export const wrap = <T,>(component: T) => component\n`,
          'importer.ts': `export { ${name} as value } from './route'\n`,
        },
      },
    )
    const rendered = await route.run(`const rendered = await render('component')
const { value } = await app('importer.ts')
return [rendered, await renderComponent(${read})]`)
    return {
      rendered,
      splitOrReported:
        (await route.isLazy('component')) || (await reportsNotSplit(route)),
    }
  }

  // Control for the pin below (same harness, an export that does not read
  // `Page`).
  test('a split component renders next to another export', async () => {
    expect(
      await renderPage(`export const Label = wrap(() => 'label')`, 'Label'),
    ).toEqual({ rendered: ['<p>page</p>', 'label'], splitOrReported: true })
  })

  // Control for the imported-component pins below (same harness): the split
  // component is declared in the route file.
  test('a split component declared in the route file renders, and head() reads it', async () => {
    const route = await loadRoute(
      `${head}function PostsPage() {
  return <p>posts</p>
}
PostsPage.title = 'Posts'
export const Route = createFileRoute('/posts')({
  component: PostsPage,
  head: () => ({ meta: [{ title: PostsPage.title }] }),
})
`,
      { routeId: '/posts' },
    )
    expect(
      await route.run(`return [options.head(), await render('component')]`),
    ).toEqual([{ meta: [{ title: 'Posts' }] }, '<p>posts</p>'])
  })
})

describe('class components', () => {
  // Control for the class pin below (same harness, a function component).
  test('a function component declared in the route file renders', async () => {
    const route = await loadRoute(`${head}function Page() {
  return 'page'
}
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(await route.run(`return render('component')`)).toBe('page')
  })
})

describe('side-effect imports', () => {
  /**
   * `./setup` and `./Page`, which record when each module runs (in
   * `./log`).
   */
  const recordingModules = {
    'log.ts': `export const log: Array<string> = []\n`,
    'setup.ts': `import { log } from './log'
log.push('./setup')
export const ready = true
`,
    'Page.ts': `import { log } from './log'
log.push('./Page')
export const Page = () => 'page'
`,
  }

  /** What ran when the route module loaded, then what the component renders. */
  const loadThenRender = `const ran = [...(await app('log.ts')).log]
return [ran, await render('component')]`

  // Control for the pin below: a side-effect import of another module runs
  // when the route module loads.
  test('a side-effect import runs when the route module loads', async () => {
    const route = await loadRoute(
      `${head}import './setup'
import { Page } from './Page'
export const Route = createFileRoute('/')({ component: Page })
`,
      { files: recordingModules },
    )
    expect(await route.run(loadThenRender)).toEqual([['./setup'], 'page'])
  })
})

describe('server-only route options on the client', () => {
  /** Start's client configuration of the code splitter. */
  const deleteNodes: NonNullable<RouteAppOptions['deleteNodes']> = [
    'ssr',
    'server',
    'headers',
  ]
  const clientFiles = {
    'secret-db.ts': `export const db = {
  flag: () => true,
  all: () => [],
  headers: () => ({}),
}
`,
    'opts.ts': `export const makeOpts = <T,>(options: T) => options\n`,
  }

  /**
   * What the page loads for the route compiled for the client as Start
   * compiles it: whether loading the route module and every option it has
   * requests `./secret-db` (the server-only module), which server-only
   * options the route still has, and what it renders.
   */
  async function clientRoute(route: RouteApp) {
    return route.run(`for (const option of Object.keys(options)) await trigger(option)
return {
  serverRequested: (await requested()).includes('/secret-db.ts'),
  serverOptions: ${JSON.stringify(deleteNodes)}.filter((key) => key in options),
  rendered: await render('component'),
}`)
  }

  const loadForClient = (code: string, options: RouteAppOptions = {}) =>
    loadRoute(code, { deleteNodes, files: clientFiles, ...options })

  const stripped = {
    serverRequested: false,
    serverOptions: [],
    rendered: '<p>x</p>',
  }

  const serverOptions = `  ssr: () => db.flag(),
  server: { handlers: { GET: () => db.all() } },
  headers: () => db.headers(),
  component: () => <p>x</p>,`

  // Control for the pins below: options written as `key: value` are removed
  // with their imports, on file routes and root routes, for every framework.
  test.each([
    {
      name: 'a file route',
      code: `${head}import { db } from './secret-db'
export const Route = createFileRoute('/')({
${serverOptions}
})`,
    },
    {
      name: 'a root route',
      code: `import { createRootRoute } from '@tanstack/react-router'
import { db } from './secret-db'
export const Route = createRootRoute({
${serverOptions}
})`,
    },
    {
      name: 'a root route with context',
      code: `import { createRootRouteWithContext } from '@tanstack/react-router'
import { db } from './secret-db'
export const Route = createRootRouteWithContext<{ user: string }>()({
${serverOptions}
})`,
    },
  ])(
    'server-only options of $name written as properties are removed with their imports',
    async ({ code }) => {
      expect(await clientRoute(await loadForClient(code))).toEqual(stripped)
    },
  )

  // The same for a Solid route, run with the real Solid router in the
  // page: every module the page loads is valid (no name the route file
  // binds, such as `db`, is left without its binding), `./secret-db` is
  // never requested, the route has none of the options, and no module the
  // page loads for the route holds the server-only code (its marker).
  test('server-only options of a Solid file route written as properties are removed with their imports', async () => {
    const route = await loadForClient(
      `import { createFileRoute } from '@tanstack/solid-router'
import { db } from './secret-db'
export const Route = createFileRoute('/')({
  ssr: () => db.flag('MARK_SSR_CODE'),
  server: { handlers: { GET: () => db.all('MARK_SERVER_CODE') } },
  headers: () => db.headers('MARK_HEADERS_CODE'),
  component: () => <p data-mark="MARK_COMPONENT_CODE">x</p>,
})`,
      {
        targetFramework: 'solid',
        files: {
          ...clientFiles,
          'secret-db.ts': `export const db = {
  flag: (_marker: string) => true,
  all: (_marker: string) => [],
  headers: (_marker: string) => ({}),
}
`,
        },
      },
    )
    await expectValidModules(route)
    expect(await clientRoute(route)).toEqual({
      ...stripped,
      rendered: '<p data-mark="MARK_COMPONENT_CODE">x</p>',
    })
    const { modules } = await route.modules()
    expect(
      Object.entries(modules).flatMap(([label, code]) =>
        ['MARK_SSR_CODE', 'MARK_SERVER_CODE', 'MARK_HEADERS_CODE']
          .filter((marker) => holdsMarker(code, marker))
          .map((marker) => `${label}: ${marker}`),
      ),
    ).toEqual([])
    // ... while what the component loads holds the component's code
    expect(
      (await route.loadedBy('component')).some((code) =>
        holdsMarker(code, 'MARK_COMPONENT_CODE'),
      ),
    ).toBe(true)
  })

  // Without `deleteNodes` (a Router app without Start), the options are the
  // route's own and stay.
  test('server-only options stay without deleteNodes', async () => {
    const route = await loadRoute(
      `${head}import { db } from './secret-db'
export const Route = createFileRoute('/')({
${serverOptions}
})`,
      { files: clientFiles },
    )
    expect(
      await route.run(
        `return [${JSON.stringify(deleteNodes)}.filter((key) => key in options), options.ssr()]`,
      ),
    ).toEqual([deleteNodes, true])
  })
})
