/**
 * Export and declaration shapes of a route file next to a split component,
 * in a production client build (SPEC G1, J2.3, J2.4, J2.12): the build
 * succeeds, the route renders, other importers of the route file get its
 * exports, and top-level effects run once in source order.
 */
import { describe, expect, it } from 'vitest'
import { batchCases } from '../batch-build'
import { clientMountEntry, head } from '../build-harness'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 60_000

/** One production client build per bundler of every route of this file (`batchCases`). */
const groups = {
  vite: batchCases({ bundler: 'vite', env: 'client' }),
  rspack: batchCases({ bundler: 'rspack', env: 'client' }),
  webpack: batchCases({ bundler: 'webpack', env: 'client' }),
} satisfies Partial<Record<Bundler, unknown>>

/** A one-route app (`route`, `entry`) of the group of its bundler (default Vite); the row's getter. */
function routeCase(
  name: string,
  route: string,
  entry: string,
  options: {
    bundler?: keyof typeof groups
    files?: Record<string, string>
  } = {},
) {
  return groups[options.bundler ?? 'vite']({
    name,
    route,
    entry,
    files: options.files,
  })
}

describe('an exported component the split component renders, exported under a string name', () => {
  // `export { Page as 'page-view' }` (ES2022 arbitrary module namespace
  // names): the route module re-exports it under the same name, quoted
  // (main failed: "Export 'Page' is not defined").
  const case1 = routeCase(
    'builds, renders, and gives importers the export',
    `${head}function Page() {
  return <p>MARK_PAGE</p>
}
export { Page as 'page-view' }
export const Route = createFileRoute('/')({ component: Page })
`,
    `${clientMountEntry}export { 'page-view' as PageView } from './routes/index'\n`,
  )
  it(
    'builds, renders, and gives importers the export',
    async () => {
      const app = await case1()
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
return typeof entry.PageView`)
      expect({ html: run.html, imported: run.result }).toEqual({
        html: '<div id="root"><p>MARK_PAGE</p></div>',
        imported: 'function',
      })
    },
    timeout,
  )
})

describe('a destructuring declaration of components from a pure object', () => {
  // `const { Home, HomeSkeleton } = views`: the split component renders
  // `Home`, the unsplit pending component `HomeSkeleton`. The route module
  // keeps `Home` in the pattern: the chunk imports it from there.
  const case2 = routeCase(
    'builds and renders both components',
    `${head}const views = {
  Home: () => <p>MARK_HOME</p>,
  HomeSkeleton: () => <p>MARK_SKELETON</p>,
}
const { Home, HomeSkeleton } = views
export const Route = createFileRoute('/')({
  component: Home,
  pendingComponent: HomeSkeleton,
})
`,
    clientMountEntry,
  )
  it(
    'builds and renders both components',
    async () => {
      const app = await case2()
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
return entry.Route.options.pendingComponent().props.children`)
      expect({ html: run.html, pending: run.result }).toEqual({
        html: '<div id="root"><p>MARK_HOME</p></div>',
        pending: 'MARK_SKELETON',
      })
    },
    timeout,
  )

  // The route module keeps exporting `Home`: the chunk and importers read it.
  const case3 = routeCase(
    'builds and renders, also when the declaration is exported',
    `${head}const views = {
  Home: () => <p>MARK_HOME</p>,
  HomeSkeleton: () => <p>MARK_SKELETON</p>,
}
export const { Home, HomeSkeleton } = views
export const Route = createFileRoute('/')({
  component: Home,
  pendingComponent: HomeSkeleton,
})
`,
    `${clientMountEntry}export { Home, HomeSkeleton } from './routes/index'\n`,
  )
  it(
    'builds and renders, also when the declaration is exported',
    async () => {
      const app = await case3()
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
return [typeof entry.Home, typeof entry.HomeSkeleton]`)
      expect({ html: run.html, imported: run.result }).toEqual({
        html: '<div id="root"><p>MARK_HOME</p></div>',
        imported: ['function', 'function'],
      })
    },
    timeout,
  )
})

describe('a default export that wraps an exported component the split component renders', () => {
  // `export default () => <Page />` next to `export function Page`: the
  // route module keeps its default export (it is no re-export of `Page`).
  const case4 = routeCase(
    'builds, renders, and gives importers the default export',
    `${head}export function Page() {
  return <p>MARK_PAGE</p>
}
export default () => <Page />
export const Route = createFileRoute('/')({ component: Page })
`,
    `${clientMountEntry}export { default as Wrapped } from './routes/index'\n`,
  )
  it(
    'builds, renders, and gives importers the default export',
    async () => {
      const app = await case4()
      const run = await app.run(`await entry.mount(entry.Wrapped)
return typeof entry.Route.options.component`)
      expect({ html: run.html, component: run.result }).toEqual({
        html: '<div id="root"><p>MARK_PAGE</p></div>',
        component: 'function',
      })
    },
    timeout,
  )
})

describe('a default export of a component the split component renders', () => {
  const case5 = routeCase(
    'builds, renders, and gives importers the default export',
    `${head}function Page() {
  return <p>MARK_PAGE</p>
}
export default Page
export const Route = createFileRoute('/')({ component: Page })
`,
    `${clientMountEntry}export { default as Page } from './routes/index'\n`,
  )
  it(
    'builds, renders, and gives importers the default export',
    async () => {
      const app = await case5()
      const run = await app.run(`await entry.mount(entry.Page)
return typeof entry.Route.options.component`)
      expect({ html: run.html, component: run.result }).toEqual({
        html: '<div id="root"><p>MARK_PAGE</p></div>',
        component: 'function',
      })
    },
    timeout,
  )
})

describe('a binding exported by name and by default, read by the split component and an option that stays', () => {
  // The binding is shared by the route module and the chunk; the route
  // module keeps both exports, one default export (Rolldown refused a
  // second one). Source: Astra review 3 (core B1).
  it.each(
    [
      {
        shape: 'a const, `export default value`',
        declaration: `export const value = { v: 'MARK_VALUE' }
export default value`,
        read: 'value.v',
        name: 'value',
      },
      {
        shape: 'a function, `export default get`',
        declaration: `export function get() {
  return 'MARK_VALUE'
}
export default get`,
        read: 'get()',
        name: 'get',
      },
      {
        shape: 'a class, `export default Data`',
        declaration: `export class Data {
  static v = 'MARK_VALUE'
}
export default Data`,
        read: 'Data.v',
        name: 'Data',
      },
      {
        shape: 'a const, in an export list as `default`',
        declaration: `export const value = { v: 'MARK_VALUE' }
export { value as default }`,
        read: 'value.v',
        name: 'value',
      },
    ]
      .flatMap((row) =>
        (['vite', 'rspack'] as const).map((bundler) => ({ ...row, bundler })),
      )
      .map((row) => {
        const { declaration, read, name, bundler } = row
        return {
          ...row,
          app: routeCase(
            `${row.shape} (${bundler})`,
            `${head}${declaration}
export const Route = createFileRoute('/')({
  beforeLoad: () => ${read},
  component: () => <p>{${read}}</p>,
})
`,
            `${clientMountEntry}export { default as Default, ${name} as Named } from './routes/index'
`,
            { bundler },
          ),
        }
      }),
  )(
    '$shape ($bundler): builds, renders, and gives importers both exports',
    async ({ app: appOf }) => {
      const app = await appOf()
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
return [entry.Route.options.beforeLoad(), entry.Default === entry.Named]`)
      expect({ html: run.html, result: run.result }).toEqual({
        html: '<div id="root"><p>MARK_VALUE</p></div>',
        result: ['MARK_VALUE', true],
      })
    },
    timeout,
  )
})

describe('an exported component the split component renders, with an effectful augmentation', () => {
  // `Page.x = track('page')` runs once, before the route module's later
  // top-level code, as in the source.
  const case6 = routeCase(
    'runs the augmentation once, in source order',
    `${head}const log = ((globalThis as any).log ??= [])
function track(name: string) {
  log.push(name)
  return name
}
export function Page() {
  return <p>MARK_PAGE</p>
}
Page.x = track('page')
log.push('after')
export const Route = createFileRoute('/')({ component: Page })
`,
    `${clientMountEntry}export { Page } from './routes/index'\n`,
  )
  it(
    'runs the augmentation once, in source order',
    async () => {
      const app = await case6()
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
return { log: globalThis.log, x: entry.Page.x }`)
      expect({ html: run.html, ...(run.result as object) }).toEqual({
        html: '<div id="root"><p>MARK_PAGE</p></div>',
        log: ['page', 'after'],
        x: 'page',
      })
    },
    timeout,
  )

  const case7 = routeCase(
    'runs the augmentation once, in source order, when no other module imports the component',
    `${head}const log = ((globalThis as any).log ??= [])
function track(name: string) {
  log.push(name)
  return name
}
export function Page() {
  return <p>MARK_PAGE</p>
}
Page.x = track('page')
log.push('after')
export const Route = createFileRoute('/')({ component: Page })
`,
    clientMountEntry,
  )
  it(
    'runs the augmentation once, in source order, when no other module imports the component',
    async () => {
      const app = await case7()
      const run = await app.run(`const before = [...globalThis.log]
await entry.mount(entry.Route.options.component)
return { before, log: globalThis.log }`)
      expect({ html: run.html, ...(run.result as object) }).toEqual({
        html: '<div id="root"><p>MARK_PAGE</p></div>',
        before: ['page', 'after'],
        log: ['page', 'after'],
      })
    },
    timeout,
  )
})

describe('exports of one declaration next to a split component, in an export list or by default', () => {
  // The route's chunk reads `Home`; the route module also exports the other
  // bindings of the same declaration. Every importer gets every export.
  it.each(
    [
      {
        shape: 'a destructuring exported in a list',
        declarations: `const { Home, Other } = views
export { Home, Other }`,
        imports: '{ Home, Other }',
      },
      {
        shape: 'a destructuring exported in a list and by default',
        declarations: `const { Home, Other } = views
export { Other }
export default Home`,
        imports: '{ default as Home, Other }',
      },
    ].map((row) => {
      const { declarations, imports } = row
      return {
        ...row,
        app: routeCase(
          row.shape,
          `${head}const views = {
  Home: () => <p>MARK_HOME</p>,
  Other: () => <p>MARK_OTHER</p>,
}
${declarations}
export const Route = createFileRoute('/')({ component: () => <Home /> })
`,
          `${clientMountEntry}export ${imports} from './routes/index'\n`,
        ),
      }
    }),
  )(
    '$shape: builds, renders, and gives importers every export',
    async ({ app: appOf }) => {
      const app = await appOf()
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
return [typeof entry.Home, entry.Other().props.children]`)
      expect({ html: run.html, imported: run.result }).toEqual({
        html: '<div id="root"><p>MARK_HOME</p></div>',
        imported: ['function', 'MARK_OTHER'],
      })
    },
    timeout,
  )
})

describe('a route file re-exporting a module with `export *`, next to a split component', () => {
  // `config` of the route file is its own: the split component and the
  // loader read it. Importers of the route file get the re-exported
  // module's `config`, as without splitting.
  it.each(
    (['vite', 'rspack', 'webpack'] as const).map((bundler) => ({
      bundler,
      app: routeCase(
        `export * (${bundler})`,
        `${head}export * from '../shared'
const config = { title: 'MARK_LOCAL' }
export const Route = createFileRoute('/')({
  loader: () => config.title,
  component: () => <p>{config.title}</p>,
})
`,
        `${clientMountEntry}export { config } from './routes/index'\n`,
        {
          bundler,
          files: {
            'shared.ts': `export const config = { title: 'MARK_SHARED' }\n`,
          },
        },
      ),
    })),
  )(
    'gives importers the re-exported binding, not the route module own binding of the same name ($bundler)',
    async ({ app: appOf }) => {
      const app = await appOf()
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
return entry.config.title`)
      expect({ html: run.html, imported: run.result }).toEqual({
        html: '<div id="root"><p>MARK_LOCAL</p></div>',
        imported: 'MARK_SHARED',
      })
    },
    timeout,
  )
})
