/**
 * Export and declaration shapes of a route file next to a split component,
 * in a production client build (SPEC G1, J2.3, J2.4, J2.12): the build
 * succeeds, the route renders, other importers of the route file get its
 * exports, and top-level effects run once in source order.
 */
import { describe, expect, it } from 'vitest'
import { build, clientMountEntry, head, routeApp } from '../build-harness'

const timeout = 60_000

async function buildRoute(route: string, entry: string) {
  return build({
    bundler: 'vite',
    env: 'client',
    files: { ...routeApp(route, { env: 'client' }), 'entry.ts': entry },
  })
}

describe('an exported component the split component renders, exported under a string name', () => {
  // `export { Page as 'page-view' }` (ES2022 arbitrary module namespace
  // names): the route module re-exports it under the same name.
  // Bug: the re-export of the extracted module prints the name unquoted
  // (`Page as page-view`), which does not parse; main failed too ("Export
  // 'Page' is not defined").
  it.fails(
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
  // `Home`, the unsplit pending component `HomeSkeleton`.
  // Bug (main built it): the route module drops `Home` from the pattern
  // while it still reads it, so the build fails (`Export 'Home' is not
  // defined`).
  it.fails(
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

  // Bug (main built it): same cause; the split chunk imports `Home` from the
  // route module, which no longer exports it (MISSING_EXPORT).
  it.fails(
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
  // route module keeps its default export.
  // Bug (main built it): the default export moves to Page's extracted
  // module and the route module's re-export lists only `Page`, so
  // `default` is gone (MISSING_EXPORT).
  it.fails(
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
})
