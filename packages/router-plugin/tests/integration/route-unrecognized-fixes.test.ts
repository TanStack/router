/**
 * A listed route file whose `Route` the code splitter does not read
 * (J2.10, design 5): it is reported naming the file when the router's own
 * route constructor is misused, and the fix the report offers makes it a
 * route the splitter reads (R101: each offered fix applied here). A route
 * made by the app's own helper is reported nothing (R130), whatever else
 * the file imports from the router package. Source: REVIEW-design5-final
 * findings 3 and 4 (the report named a false cause, offered fixes that drop
 * a root's context or name the wrong constructor in a lazy file, and
 * warned about app helpers).
 */
import { describe, it } from 'vitest'
import { expectNoProblems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { build } from '../build-harness'

const RP = '@tanstack/react-router'
const timeout = 60_000

const rootFile = `import { Outlet, createRootRoute } from '${RP}'
export const Route = createRootRoute({ component: () => <Outlet /> })
`
const page = `{ component: () => <p>MARK_PAGE</p> }`

/** A client build of an app of file routes (`routes/`) whose entry is its route tree. */
async function buildApp(files: Record<string, string>) {
  const app = await build({
    bundler: 'vite',
    env: 'client',
    minify: false,
    files: {
      'routes/__root.tsx': rootFile,
      'entry.ts': `export { routeTree } from './routeTree.gen'\n`,
      ...files,
    },
  })
  return { app, diagnostics: [...app.warnings, ...app.consoleMessages] }
}

const helper = {
  'lib/app-route.ts': `import { createFileRoute } from '${RP}'
export const createAppRoute = (id: any) => (options: any) => createFileRoute(id)(options)
`,
}

describe("a route made by the app's own helper (R130)", () => {
  it.for([
    {
      name: 'in a file using the router package through a namespace import',
      route: `import * as R from '${RP}'
import { createAppRoute } from '../lib/app-route'
export const Route = createAppRoute('/')({
  component: () => <R.Link to="/">MARK_PAGE</R.Link>,
})
`,
    },
    {
      name: 'in a file importing a route constructor for something else',
      route: `import { createFileRoute } from '${RP}'
import { createAppRoute } from '../lib/app-route'
export const makeRoute = createFileRoute
export const Route = createAppRoute('/')(${page})
`,
    },
  ])('$name is reported nothing', { timeout }, async ({ route }) => {
    const { diagnostics } = await buildApp({
      ...helper,
      'routes/index.tsx': route,
    })
    expectNoProblems(diagnostics)
  })
})
