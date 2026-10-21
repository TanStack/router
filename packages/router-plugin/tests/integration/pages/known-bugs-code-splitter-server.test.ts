/**
 * Known code-splitter bugs (part 4 of known-bugs-code-splitter.test.ts):
 * code that reads a split binding, class components, side-effect imports,
 * server-only route options on the client and look-alike route factories.
 * Each test asserts correct behaviour for a bug on main and is marked
 * .fails; remove .fails when the bug is fixed.
 *
 * Every route is loaded through the public router plugin in a real Vite dev
 * server and run in a real browser page (`./route-app`); what the user is
 * told is read from the dev server's merged diagnostic channel.
 */
import { describe, expect, test } from 'vitest'
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import {
  diagnosticsOf,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import {
  expectValidModules,
  head,
  holdsMarker,
  loadRoute,
} from '../../route-app'
import type { RouteApp, RouteAppOptions } from '../../route-app'

/**
 * Whether the dev server reported (a warning on any channel: the route
 * loaded, so nothing was refused) that the option `option` (default
 * `component`) of the route file is left unsplit, naming the file and the
 * option (J2.8; naming the binding too is fine, the wording is free). Read
 * once the page loaded the route.
 */
async function reportsNotSplit(route: RouteApp, option = 'component') {
  return (
    findDiagnostics(await route.diagnostics(), {
      severity: 'warning',
      file: route.url.slice(1),
      root: route.host.root,
      names: [option],
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

  // Bug: when a route option names a binding that the code splitter moves
  // into a chunk, the splitter deletes the binding's declaration from the
  // route module (`removeIdentifierLiteral`), even when other code there
  // still reads it. Only `export function`/`export const` declarations are
  // checked, so export lists, aliases and exports that use the binding lose
  // it. Source: #8505 (`export { component as View }`), gap O7.
  // A fix may also leave `Page` unsplit, but must then tell the user, in
  // production builds too (decision D11): unsplit and silent is still this
  // bug.
  // Impact: the route module throws when it loads ("Page is not defined",
  // "Export 'Page' is not defined"), so the route never renders.
  test.fails.each([
    {
      name: 'an exported object',
      exports: 'export const meta = { fn: Page }',
      imported: 'meta',
      read: 'value.fn',
    },
    {
      name: 'an exported function',
      exports: 'export function Preview() { return <Page /> }',
      imported: 'Preview',
    },
    {
      name: 'a default export',
      exports: 'export default wrap(Page)',
      imported: 'default',
    },
    {
      name: 'an export list',
      exports: 'export { Page }',
      imported: 'Page',
    },
    {
      name: 'an export alias',
      exports: 'export { Page as View }',
      imported: 'View',
    },
    {
      // Source: #8504 (lost case L4).
      name: 'a default export by specifier',
      exports: 'export { Page as default }',
      imported: 'default',
    },
  ])(
    'a split component that $name reads renders from both',
    async ({ exports, imported, read }) => {
      expect(await renderPage(exports, imported, read)).toEqual({
        rendered: ['<p>page</p>', '<p>page</p>'],
        splitOrReported: true,
      })
    },
  )

  // Bug: same root cause as above, for a function that module-level code
  // keeps reachable: it renders the split component, whose declaration the
  // route module lost. The registry is created, filled and subscribed to
  // once, also after the chunk loads (a chunk that runs that code again
  // makes a second registry). Source: #8504 (code-splitter-dead-code.test.ts).
  // Impact: the route module throws when it loads ("Page is not defined").
  test.fails.each([
    {
      name: 'module-level code registers',
      setup: `registry.set('preview', Preview)`,
      subscribes: 0,
    },
    {
      name: 'an unused subscription calls back',
      setup: `const unsubscribe = subscribe((name) => registry.set(name, Preview))`,
      subscribes: 1,
    },
  ])(
    'a split component renders through a function $name',
    async ({ setup, subscribes }) => {
      const route = await loadRoute(
        `${head}import { createRegistry, subscribe } from './subscribe'
const registry = createRegistry()
function Page() {
  return <p>page</p>
}
function Preview() {
  return <Page />
}
${setup}
export const Route = createFileRoute('/')({
  component: Page,
  loader: () => registry.get('preview')(),
})
`,
        {
          files: {
            'subscribe.ts': `export const runs = { registries: 0, sets: 0, subscribes: 0 }
export const createRegistry = () => {
  runs.registries++
  const map = new Map<string, any>()
  return {
    get: (name: string) => map.get(name),
    set: (name: string, value: unknown) => {
      runs.sets++
      map.set(name, value)
    },
  }
}
export const subscribe = (callback: (name: string) => void) => {
  runs.subscribes++
  callback('preview')
}
`,
          },
        },
      )
      expect(
        await route.run(`// The loader returns the element \`Preview\` renders
const element = options.loader()
const loaded = await renderComponent(() => element)
const rendered = await render('component')
return [loaded, rendered, { ...(await app('subscribe.ts')).runs }]`),
      ).toEqual([
        '<p>page</p>',
        '<p>page</p>',
        { registries: 1, sets: 1, subscribes },
      ])
    },
  )

  // Bug: same root cause as above, for an unsplit option that names the
  // split component. Source: corpus-diff, bex-co/bex
  // src/routes/databases.$databaseId.tsx (`component: Page,
  // pendingComponent: Page`); #8504 (code-splitter-route-options.test.ts),
  // where it passes.
  // Impact: the route module throws when it loads ("Page is not defined").
  test.fails(
    'a component read by a split and an unsplit option renders from both',
    async () => {
      const route =
        await loadRoute(`${head}export const Route = createFileRoute('/')({
  component: Page,
  pendingComponent: Page,
})
function Page() {
  return <p>{typeof Route}</p>
}
`)
      expect(
        await route.run(
          `return [await render('pendingComponent'), await render('component')]`,
        ),
      ).toEqual(['<p>object</p>', '<p>object</p>'])
    },
  )

  // Bug: same root cause as above, for an unsplit option that reads the
  // split component (which reads `Route`, so it moves to its chunk) with
  // `typeof`. Reading an undeclared name with `typeof` does not throw, so
  // the route module loads and the option silently sees `'undefined'`.
  // Source: fuzzing (oracle mode, round 2: `beforeLoad` and `loaderDeps`
  // readers of components of the repository's e2e routes).
  // Impact: code that checks the component (`typeof Page === 'function'`)
  // takes the wrong branch on every navigation, with no error.
  test.fails(
    'an unsplit option that reads the split component with typeof sees a function',
    async () => {
      const route =
        await loadRoute(`${head}export const Route = createFileRoute('/')({
  component: Page,
  beforeLoad: () => typeof Page,
})
function Page() {
  return <p>{typeof Route}</p>
}
`)
      expect(
        await route.run(
          `return [options.beforeLoad(), await render('component')]`,
        ),
      ).toEqual(['function', '<p>object</p>'])
    },
  )

  // Bug: same root cause as above, for a top-level call that reads the split
  // component. The call runs once, also after the chunk loads (a chunk that
  // calls `register` again registers a second component). Source: #8504
  // (differential fuzzing).
  // Impact: the route module throws when it loads ("Page is not defined").
  test.fails(
    'a split component that a top-level call reads renders from both',
    async () => {
      const route = await loadRoute(
        `${head}import { register } from './registry'
function Page() {
  return <div>page</div>
}
export const Route = createFileRoute('/')({ component: Page })
register(Page)
`,
        {
          files: {
            'registry.ts': `export const registered: Array<unknown> = []
export const register = (component: unknown) => {
  registered.push(component)
}
`,
          },
        },
      )
      expect(
        await route.run(`const rendered = await render('component')
const { registered } = await app('registry.ts')
const fromRegistry = []
for (const component of registered) fromRegistry.push(await renderComponent(component))
return [fromRegistry, rendered]`),
      ).toEqual([['<div>page</div>'], '<div>page</div>'])
    },
  )

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

  // Bug: when a split option names an imported binding, the code splitter
  // deletes its import specifier from the route module
  // (`removeIdentifierLiteral` removes the binding without checking for other
  // reads), then the emptied import, even when other code there still reads
  // it: an unsplit option, an exported function or anything else. Sibling of
  // the pins above, which cover bindings declared in the route file.
  // Source: compilers.ts:571-593 (`removeIdentifierLiteral`), :1555-1593
  // (the binding is removed), :768-777 (the emptied import is dropped);
  // fuzzing (oracle mode, N1).
  // Impact: the route throws "PostsPage is not defined" where the other code
  // runs (head() on every navigation, an importer's render).
  test.fails(
    'an imported split component that head() reads renders, and head() reads it',
    async () => {
      const route = await loadRoute(
        `${head}import { PostsPage } from './posts-page'
export const Route = createFileRoute('/posts')({
  component: PostsPage,
  head: () => ({ meta: [{ title: PostsPage.title }] }),
})
`,
        {
          routeId: '/posts',
          files: {
            'posts-page.ts': `export const PostsPage = Object.assign(() => 'posts', {
  title: 'Posts',
})
`,
          },
        },
      )
      expect(
        await route.run(`return [options.head(), await render('component')]`),
      ).toEqual([{ meta: [{ title: 'Posts' }] }, 'posts'])
    },
  )

  // Bug: same root cause as above, for an exported component that renders
  // the imported split one, used by another module of the app (ruling P1:
  // through a real importer, not the export list). Adapted from the
  // repository's
  // examples/solid/start-supabase-basic/src/routes/_authed/posts.$postId.tsx
  // (written for React here; the code splitter handles the import the same
  // way for every framework).
  // Impact: rendering `PostErrorComponent` throws "ErrorComponent is not
  // defined".
  test.fails(
    'an imported split errorComponent that an exported component renders works for an importer',
    async () => {
      const route = await loadRoute(
        `import { ErrorComponent, createFileRoute } from '@tanstack/react-router'
import type { ErrorComponentProps } from '@tanstack/react-router'
export const Route = createFileRoute('/posts/$postId')({
  loader: ({ params: { postId } }) => postId,
  errorComponent: ErrorComponent,
  component: PostComponent,
})
export function PostErrorComponent({ error }: ErrorComponentProps) {
  return <ErrorComponent error={error} />
}
function PostComponent() {
  return <h4>post</h4>
}
`,
        {
          routeId: '/posts/$postId',
          files: {
            'importer.ts': `export { PostErrorComponent } from './route'\n`,
          },
        },
      )
      const [routeError, imported, component] = await route.run<
        Array<string>
      >(`const error = new Error('boom')
const routeError = await render('errorComponent', { error })
const { PostErrorComponent } = await app('importer.ts')
return [
  routeError,
  await renderComponent(PostErrorComponent, { error }),
  await render('component'),
]`)
      expect(routeError).toContain('boom')
      expect([imported, component]).toEqual([routeError, '<h4>post</h4>'])
    },
  )

  // Bug: same root cause as above, for a pendingComponent that custom
  // groupings split and an unsplit errorComponent renders.
  // Impact: rendering the errorComponent throws "Spinner is not defined".
  test.fails(
    'an imported pendingComponent split by custom groupings renders, and an unsplit option renders it',
    async () => {
      const route = await loadRoute(
        `${head}import { Spinner } from './spinner'
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['component'], ['pendingComponent']],
  pendingComponent: Spinner,
  errorComponent: () => <div><Spinner /></div>,
  component: () => <p>page</p>,
})
`,
        { files: { 'spinner.ts': `export const Spinner = () => 'spin'\n` } },
      )
      expect(
        await route.run(
          `return [await render('errorComponent'), await render('pendingComponent')]`,
        ),
      ).toEqual(['<div>spin</div>', 'spin'])
    },
  )
})

describe('class components', () => {
  const classPage = `class Page extends Component {
  render() {
    return <p>page</p>
  }
}`

  // Control for the class pin below (same harness, a function component).
  test('a function component declared in the route file renders', async () => {
    const route = await loadRoute(`${head}function Page() {
  return 'page'
}
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(await route.run(`return render('component')`)).toBe('page')
  })

  // Bug: a route option that names a class cannot be split: the virtual
  // compiler throws "Unexpected splitNode type ☝️: ClassDeclaration".
  // A class only the route option reads must be split like a function
  // component (our limitation otherwise, decision D11). A fix may leave an
  // exported class unsplit, but must then tell the user, in production
  // builds too.
  // JavaScript route files: the route types of React accept function
  // components only (TS2322 for a class).
  // Source: #8505 (`export class component {}`).
  // Impact: a route whose component is a class component cannot be built
  // once code splitting is on.
  test.fails.each([
    { declaration: classPage, exported: false },
    { declaration: `export ${classPage}`, exported: true },
  ])(
    'a class component declared in the route file renders (exported: $exported)',
    async ({ declaration, exported }) => {
      const route = await loadRoute(
        `${head}import { Component } from 'react'
${declaration}
export const Route = createFileRoute('/')({ component: Page })
`,
        { filename: 'route.jsx' },
      )
      const rendered = await route.run(`return render('component')`)
      const lazy = await route.isLazy('component')
      expect({
        rendered,
        split: exported ? lazy || (await reportsNotSplit(route)) : lazy,
      }).toEqual({ rendered: '<p>page</p>', split: true })
    },
  )

  // Bug: same root cause as above. Once split, the class's static fields
  // and what they import belong to its chunk.
  // Source: Next.js ssg/getStaticProps/should-support-class-exports; #8504
  // (code-splitter-dead-code.test.ts), where it passes.
  test.fails(
    'a class component and the imports of its static fields leave the route module',
    async () => {
      const route = await loadRoute(
        `${head}import { Component } from 'react'
import { format } from './format'
class Page extends Component {
  static title = format('home')
  render() {
    return <p>{Page.title}</p>
  }
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  component: Page,
})
`,
        {
          filename: 'route.jsx',
          files: {
            'format.js': 'export const format = (value) => `[${value}]`\n',
          },
        },
      )
      expect([
        // Nothing the route module loads requests what only the class reads
        (await route.requested()).includes('/format.js'),
        await route.run(`return render('component')`),
      ]).toEqual([false, '<p>[home]</p>'])
    },
  )
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

  // Bug: when the split component is imported (`import { Page } from
  // './Page'`), the code splitter also removes every bare import of that path
  // from the route module (`removableImportPaths`), including the user's own
  // `import './Page'`. Source: gap O2.
  // Impact: what that module does when it loads (registrations, styles,
  // polyfills) is deferred until the component chunk loads.
  test.fails(
    "a side-effect import of the split component's module runs when the route module loads",
    async () => {
      const route = await loadRoute(
        `${head}import './Page'
import { Page } from './Page'
export const Route = createFileRoute('/')({ component: Page })
`,
        { files: recordingModules },
      )
      expect(await route.run(loadThenRender)).toEqual([['./Page'], 'page'])
    },
  )
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

  // Bug: `deleteNodes` only removes route options written as `key: value`
  // (`ObjectProperty`); a method (`ssr() {}`, `async ssr() {}`,
  // `headers() {}`) is kept, with the imports it uses. Source: gap D11/S26
  // (docs `selective-ssr.md` promise `ssr` is stripped).
  // Impact: Start's client bundle ships the route's `ssr`/`headers` code and
  // its server-only imports.
  test.fails.each([
    'ssr() { return db.flag() }',
    'async ssr() { return db.flag() }',
    'headers() { return db.headers() }',
  ])(
    'a server-only option written as a method is removed with its imports (%s)',
    async (option) => {
      const route = await loadForClient(`${head}import { db } from './secret-db'
export const Route = createFileRoute('/')({
  ${option},
  component: () => <p>x</p>,
})`)
      expect(await clientRoute(route)).toEqual(stripped)
    },
  )

  // Bug: server-only options whose key is not written literally in the
  // route options (a spread, a computed key, options built by a call) are
  // kept, with their imports, and nothing reports it. Removing them is best
  // effort; refusing the route with an error naming the route file and the
  // option is a valid fix too. Source: gap D11.
  // Impact: Start's client bundle silently ships server handlers and their
  // server-only imports.
  test.fails.each([
    {
      name: 'a spread',
      code: `const serverOptions = { server: { handlers: { GET: () => db.all() } } }
export const Route = createFileRoute('/')({
  ...serverOptions,
  component: () => <p>x</p>,
})`,
    },
    {
      name: 'a computed key',
      code: `export const Route = createFileRoute('/')({
  ['server']: { handlers: { GET: () => db.all() } },
  component: () => <p>x</p>,
})`,
    },
    {
      name: 'a call',
      code: `import { makeOpts } from './opts'
export const Route = createFileRoute('/')(
  makeOpts({
    server: { handlers: { GET: () => db.all() } },
    component: () => <p>x</p>,
  }),
)`,
    },
  ])(
    'a server-only option given through $name is removed, or the route is refused',
    async ({ code }) => {
      const route = await loadForClient(
        `${head}import { db } from './secret-db'\n${code}`,
      )
      let result
      try {
        result = await clientRoute(route)
      } catch (error) {
        // A refusal names the route file and the server-only option, on any
        // channel (the compile error the dev server serves, what it logged)
        const compiled = await route.transform().then(
          () => [],
          (compileError: unknown) => diagnosticsOf(compileError),
        )
        expectDiagnostic(
          [
            ...diagnosticsOf(error),
            ...compiled,
            ...problems(await route.diagnostics()),
          ],
          {
            severity: 'error',
            file: 'route.tsx',
            root: route.host.root,
            names: ['server'],
          },
        )
        return
      }
      expect(result).toEqual(stripped)
    },
  )

  // Bug: a route whose options object is wrapped in a TypeScript cast or a
  // `satisfies` (statically visible options, valid TypeScript) keeps its
  // server-only options and their imports on the client. Unlike opaque
  // options above, these must be removed: the options are written in the
  // file, so refusing the route is not an option.
  // Source: the #8504 confidence campaign (suspects SU-4/8; 4 corpus files
  // in 3 repositories cast their options, `as never` or `as any`, when the
  // handlers' types do not fit); V1 split F35.
  // Impact: Start's client bundle ships server handlers and their
  // server-only imports (build-level canary in
  // integration/known-bugs-code-splitter-client-output.test.ts).
  test.fails.each(['as never', 'as any', 'satisfies object'])(
    'a server-only option of options wrapped in `%s` is removed with its imports',
    async (cast) => {
      const route = await loadForClient(`${head}import { db } from './secret-db'
export const Route = createFileRoute('/')({
  server: { handlers: { GET: () => db.all() } },
  component: () => <p>x</p>,
} ${cast})`)
      expect(await clientRoute(route)).toEqual(stripped)
    },
  )
})

describe('look-alike route factories', () => {
  // Bug: in a registered route file, the code splitter treats every call of
  // a function named `createFileRoute` as the route's factory, including a
  // local function shadowing the router's: it splits the options of that
  // call too, so the local factory gets a lazy route component instead of
  // the function it was given (and in a dev server, where route HMR is on,
  // the route module loses that function's declaration and throws
  // "LocalWidget is not defined" when it loads). Only the call
  // bound to `Route` is the route's (SPEC J2.1, G15). A look-alike from
  // another package (a namespace member call) is left alone
  // (code-splitter-plugin-pipeline.test.ts).
  // Source: found while replacing the spelling-only look-alike controls of
  // code-splitter-plugin-pipeline.test.ts (V1R split S13, W4-split).
  // Impact: a route file whose own code uses a helper named
  // `createFileRoute` (a widget registry, a test fixture builder) fails to
  // load once code splitting is on.
  test.fails(
    'a local factory shadowing createFileRoute in a route file keeps its own semantics',
    async () => {
      const route = await loadRoute(`${head}function LocalWidget() {
  return <p>local widget</p>
}
function localWidget() {
  const createFileRoute =
    (path: string) =>
    (options: { loader: () => string; component: () => unknown }) => ({
      path,
      options,
    })
  return createFileRoute('/local-widget')({
    loader: () => 'local data',
    component: LocalWidget,
  })
}
export const widget = localWidget()
export const Route = createFileRoute('/')({
  component: () => <p>page</p>,
})
`)
      const [path, loaded, preload, ...rendered] = await route.run<
        Array<unknown>
      >(`const { widget } = exports
return [
  widget.path,
  widget.options.loader(),
  'preload' in widget.options.component,
  await renderComponent(widget.options.component),
  await render('component'),
]`)
      expect([path, loaded, preload]).toEqual([
        '/local-widget',
        'local data',
        false,
      ])
      expect(rendered).toEqual(['<p>local widget</p>', '<p>page</p>'])
    },
  )
})
