/**
 * Production client bundles carry nothing of the dev server's additions
 * (route HMR, React Refresh support), per bundler and framework (SPEC G7):
 * the checks of integration/build-production*.test.ts (one file per bundler
 * group, to keep each file within its time budget).
 * The build decides production by its own signal (the bundler's production
 * mode), with `NODE_ENV` unset, and the plugin's default for `addHmr`.
 *
 * The decision is by purpose, through paired real builds: a build
 * with route HMR off (`addHmr: false`, `NODE_ENV=production` when the
 * plugin is created) is the control, which differs in the development
 * features only. The production bundle renders the route in a real browser
 * and is the control's output, chunk for chunk: whatever it ships beyond
 * the control serves development. Development code of the framework
 * packages themselves would be in the control too: the bundle carries none
 * of their dev runtime's markers (the lazy route component's hot slot
 * `__tsrHot`, the route HMR entry `__tsrRouteHmr`).
 */
import { expect } from 'vitest'
import {
  build,
  buildWithRsbuild,
  clientMountEntry,
  routeApp,
  routeHead,
} from './build-harness'
import type {
  BuildResult,
  Bundler,
} from '@tanstack/compiler-test-utils/build-harness'
import type { Framework } from './build-harness'

export const timeout = 120_000

const route = (
  framework: Framework,
) => `${routeHead(framework)}function Page() {
  return <p>MARK_PAGE</p>
}
function Failure() {
  return <p>MARK_FAILURE</p>
}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  errorComponent: Failure,
  component: Page,
})
`

/**
 * The app files of `routeFile` for the client: a file route as the index
 * route; a root route (`createRootRoute`, `createRootRouteWithContext`) as
 * the root, which the entry then re-exports.
 */
function appOf(routeFile: string, framework: Framework) {
  if (!/\bcreateRootRoute(?:WithContext)?\b/.test(routeFile)) {
    return routeApp(routeFile, { env: 'client', framework })
  }
  return routeApp(
    `${routeHead(framework)}export const Route = createFileRoute('/')({})\n`,
    {
      env: 'client',
      framework,
      files: {
        'routes/__root.tsx': routeFile,
        'entry.ts': clientMountEntry.replace(
          "'./routes/index'",
          "'./routes/__root'",
        ),
      },
    },
  )
}

/**
 * Builds the route for production: as an app builds it (`NODE_ENV` unset,
 * the plugin's default `addHmr`), or as the control with route HMR off.
 */
async function productionBuild(
  bundler: Bundler | 'rsbuild',
  framework: Framework,
  autoCodeSplitting: boolean,
  control: boolean,
  routeFile = route(framework),
) {
  const pluginOptions = {
    autoCodeSplitting,
    codeSplittingOptions: { addHmr: control ? false : undefined },
  }
  const nodeEnv = control ? 'production' : null
  const files = appOf(routeFile, framework)
  return bundler === 'rsbuild'
    ? buildWithRsbuild({ nodeEnv, pluginOptions, files })
    : build({
        bundler,
        framework,
        env: 'client',
        nodeEnv,
        pluginOptions,
        files,
      })
}

/** The emitted chunks, by file name. */
function output(result: BuildResult) {
  return Object.fromEntries(
    result.chunks.map((chunk) => [chunk.fileName, chunk.code]),
  )
}

/**
 * Builds the route (default: the module's own) for production and asserts
 * that the bundle renders the route's component (`MARK_PAGE` for the
 * module's own route) and equals the control's (see the module comment).
 */
export async function expectProductionClientBundle(
  bundler: Bundler | 'rsbuild',
  framework: Framework,
  autoCodeSplitting: boolean,
  routeFile?: string,
) {
  const app = await productionBuild(
    bundler,
    framework,
    autoCodeSplitting,
    false,
    routeFile,
  )
  const control = await productionBuild(
    bundler,
    framework,
    autoCodeSplitting,
    true,
    routeFile,
  )
  const run = await app.run(
    'const { component } = entry.Route.options\nif (component) await entry.mount(component)',
  )
  if (routeFile === undefined) {
    expect(run.html).toContain('MARK_PAGE')
  }
  expect(output(app)).toEqual(output(control))
  for (const [file, code] of Object.entries(output(app))) {
    expect(code, file).not.toMatch(/__tsrHot|__tsrRouteHmr/)
  }
}

/**
 * Routes whose route HMR compile differs (source: the add-hmr snapshot
 * fixtures): split options, lowercase component names, root routes (with
 * `shellComponent`, with context), an undefined component, a Solid route.
 * The dev rows of integration/route-hmr-dev-addhmr-off.test.ts run every
 * one; production builds run the React ones the plain route above does not
 * stand for.
 */
const fileRoute = (
  options: string,
  declarations = '',
  framework: Framework = 'react',
) => `import { createFileRoute } from '@tanstack/${framework}-router'
${declarations}
export const Route = createFileRoute('/')({
  loader: () => 'data',
  ${options}
})`

const posts = `function PostsComponent() {
  return <div>posts</div>
}
function PostsErrorComponent() {
  return <div>Error loading posts</div>
}`

export const routeShapes: Array<{
  name: string
  route: string
  targetFramework?: Framework
}> = [
  {
    name: 'a split route',
    route: fileRoute('component: PostsComponent,', posts),
  },
  {
    name: 'a route with two split components',
    route: fileRoute(
      'component: PostsComponent,\n  errorComponent: PostsErrorComponent,',
      posts,
    ),
  },
  {
    name: 'a route with lowercase components',
    route: `${routeHead()}export const Route = createFileRoute('/')({
  pendingComponent: pendingComponent,
  errorComponent: errorComponent,
  component: component,
})
function pendingComponent() {
  return <div>Pending</div>
}
function errorComponent() {
  return <div>Error</div>
}
function component() {
  return <div>Hello</div>
}`,
  },
  {
    name: 'a root route',
    route: `import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  shellComponent: ({ children }) => <html>{children}</html>,
  component: () => <div>root</div>,
})`,
  },
  {
    name: 'a root route with context',
    route: `import { createRootRouteWithContext } from '@tanstack/react-router'
interface MyRouterContext {
  auth: boolean
}
export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: RootComponent,
})
function RootComponent() {
  return <div>Hello</div>
}`,
  },
  {
    name: 'an explicitly undefined component',
    route: `${routeHead()}export const Route = createFileRoute('/')({ component: undefined })`,
  },
  {
    name: 'a Solid route',
    route: fileRoute('component: PostsComponent,', posts, 'solid'),
    targetFramework: 'solid',
  },
]
