/**
 * Export and declaration shapes of a route file next to a split component,
 * in a production client build (SPEC G1, J2.3, J2.4, J2.12): the build
 * succeeds, the route renders, other importers of the route file get its
 * exports, and top-level effects run once in source order.
 */
import { describe, expect, it } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, clientMountEntry, head, routeApp } from '../build-harness'
import type { Bundler } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 60_000

async function buildRoute(
  route: string,
  entry: string,
  options: { bundler?: Bundler; files?: Record<string, string> } = {},
) {
  return build({
    bundler: options.bundler ?? 'vite',
    env: 'client',
    files: {
      ...routeApp(route, { env: 'client', files: options.files }),
      'entry.ts': entry,
    },
  })
}

describe('an exported component the split component renders, exported under a string name', () => {
  // `export { Page as 'page-view' }` (ES2022 arbitrary module namespace
  // names): the route module re-exports it under the same name, quoted
  // (main failed: "Export 'Page' is not defined").
  it(
    'builds, renders, and gives importers the export',
    async () => {
      const app = await buildRoute(
        `${head}function Page() {
  return <p>MARK_PAGE</p>
}
export { Page as 'page-view' }
export const Route = createFileRoute('/')({ component: Page })
`,
        `${clientMountEntry}export { 'page-view' as PageView } from './routes/index'\n`,
      )
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
  it(
    'builds and renders both components',
    async () => {
      const app = await buildRoute(
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
  it(
    'builds and renders, also when the declaration is exported',
    async () => {
      const app = await buildRoute(
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
  it(
    'builds, renders, and gives importers the default export',
    async () => {
      const app = await buildRoute(
        `${head}export function Page() {
  return <p>MARK_PAGE</p>
}
export default () => <Page />
export const Route = createFileRoute('/')({ component: Page })
`,
        `${clientMountEntry}export { default as Wrapped } from './routes/index'\n`,
      )
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

describe('a default export of a component the split component renders (control)', () => {
  it(
    'builds, renders, and gives importers the default export',
    async () => {
      const app = await buildRoute(
        `${head}function Page() {
  return <p>MARK_PAGE</p>
}
export default Page
export const Route = createFileRoute('/')({ component: Page })
`,
        `${clientMountEntry}export { default as Page } from './routes/index'\n`,
      )
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

describe('an exported component the split component renders, with an effectful augmentation', () => {
  // `Page.x = track('page')` runs once, before the route module's later
  // top-level code, as in the source.
  it(
    'runs the augmentation once, in source order',
    async () => {
      const app = await buildRoute(
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

  it(
    'runs the augmentation once, in source order, when no other module imports the component',
    async () => {
      const app = await buildRoute(
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

  // The augmentation calls an imported function: its module is not the
  // route module's, so nothing else ties the declaration to the route
  // module's evaluation. The effect is observable on its own, so the
  // declaration never leaves for a side-effect-free module only the chunk
  // imports (where `track('page')` would run when the chunk loads).
  it.each(['vite', 'rspack', 'webpack'] as const)(
    'runs an augmentation calling an imported function once, in source order, when no other module imports the component (%s)',
    async (bundler) => {
      const app = await buildRoute(
        `${head}import { track } from '../tracker'
export function Page() {
  return <p>MARK_PAGE</p>
}
Page.x = track('page')
track('after')
export const Route = createFileRoute('/')({ component: Page })
`,
        clientMountEntry,
        {
          bundler,
          files: {
            'tracker.ts': `export function track(name: string) {
  ;((globalThis as any).log ??= []).push(name)
  return name
}
`,
          },
        },
      )
      const run = await app.run(`const before = [...(globalThis.log ?? [])]
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

describe('an unexported helper with an effectful augmentation that only an exported component renders', () => {
  // `Card.x = track('card')`: `Card` is only read by `Page`, an exported
  // component the split component is. Its effect is observable on its own,
  // so it runs once, as the route module loads and before its later
  // top-level code, whether or not another module imports `Page`.
  it.each(['vite', 'rspack', 'webpack'] as const)(
    'runs the augmentation once, in source order, when no other module imports the component (%s)',
    async (bundler) => {
      const app = await buildRoute(
        `${head}import { track } from '../tracker'
function Card() {
  return <p>MARK_CARD</p>
}
Card.x = track('card')
export function Page() {
  return <Card />
}
Page.displayName = 'Page'
track('after')
export const Route = createFileRoute('/')({ component: Page })
`,
        clientMountEntry,
        {
          bundler,
          files: {
            'tracker.ts': `export function track(name: string) {
  ;((globalThis as any).log ??= []).push(name)
  return name
}
`,
          },
        },
      )
      const run = await app.run(`const before = [...(globalThis.log ?? [])]
await entry.mount(entry.Route.options.component)
return { before, log: globalThis.log }`)
      expect({ html: run.html, ...(run.result as object) }).toEqual({
        html: '<div id="root"><p>MARK_CARD</p></div>',
        before: ['card', 'after'],
        log: ['card', 'after'],
      })
    },
    timeout,
  )
})

describe('exports of one declaration next to a split component, in an export list or by default', () => {
  // The route's chunk reads `Home`; the route module also exports the other
  // bindings of the same declaration. Every importer gets every export.
  it.each([
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
  ])(
    '$shape: builds, renders, and gives importers every export',
    async ({ declarations, imports }) => {
      const app = await buildRoute(
        `${head}const views = {
  Home: () => <p>MARK_HOME</p>,
  Other: () => <p>MARK_OTHER</p>,
}
${declarations}
export const Route = createFileRoute('/')({ component: () => <Home /> })
`,
        `${clientMountEntry}export ${imports} from './routes/index'\n`,
      )
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

  // A `let` the exported function writes: importers see its live value.
  it(
    'a `let` and the function writing it exported in a list: importers read the live binding',
    async () => {
      const app = await buildRoute(
        `${head}let count = 0
function bump() {
  count++
  return <p>MARK_COUNT</p>
}
export { count, bump }
export const Route = createFileRoute('/')({ component: () => bump() })
`,
        `${clientMountEntry}export { count, bump } from './routes/index'
import * as route from './routes/index'
export const read = () => route.count
`,
      )
      const run =
        await app.run(`await entry.mount(entry.Route.options.component)
const afterMount = entry.read()
entry.bump()
return [afterMount, entry.read()]`)
      expect({ html: run.html, counts: run.result }).toEqual({
        html: '<div id="root"><p>MARK_COUNT</p></div>',
        counts: [1, 2],
      })
    },
    timeout,
  )
})

describe('a route file re-exporting a module with `export *`, next to a split component', () => {
  // `config` of the route file is its own: the split component and the
  // loader read it. Importers of the route file get the re-exported
  // module's `config`, as without splitting.
  it.each(['vite', 'rspack', 'webpack'] as const)(
    'gives importers the re-exported binding, not the route module own binding of the same name (%s)',
    async (bundler) => {
      const app = await buildRoute(
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
      )
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

describe('an exported component the split component is, augmented with a member of a namespace import', () => {
  // `Page.icon = Icons.Home` reads the icons module's binding: no code runs,
  // so the component leaves the route module with its augmentation.
  it.each(['vite', 'rspack', 'webpack'] as const)(
    'splits the component with its augmentation, without a warning (%s)',
    async (bundler) => {
      const app = await buildRoute(
        `${head}import * as Icons from '../icons'
export function Page() {
  return <p>MARK_PAGE {Page.icon === Icons.Home ? 'icon' : 'none'}</p>
}
Page.icon = Icons.Home
export const Route = createFileRoute('/')({ component: Page })
`,
        clientMountEntry,
        {
          bundler,
          files: { 'icons.tsx': `export const Home = () => <i>icon</i>\n` },
        },
      )
      expect(app.where('MARK_PAGE')).toBe('lazy')
      expect(
        findDiagnostics([...app.warnings, ...app.consoleMessages], {
          file: 'routes/index.tsx',
          root: app.root,
        }),
      ).toEqual([])
      const run = await app.run(
        `await entry.mount(entry.Route.options.component)`,
      )
      expect(run.html).toBe('<div id="root"><p>MARK_PAGE icon</p></div>')
    },
    timeout,
  )
})
