/**
 * What only split code needs and stays in the route module is reported at
 * its declaration, and only then (R101, SPEC J2.8). Learned from a real app
 * (webdevcody/tanstack-course-platform `learn/$slug/_layout.tsx`): an
 * exported `queryOptions(…)` the loader reads and the component reads with
 * `Route.useLoaderData()` stays in the route module because the route
 * module needs it, which is no news. One the split component alone reads
 * is reported, and so is a declared component writing a binding the
 * loader reads; its fix builds without the report and loads the code with
 * its chunk. A declaration reading state the module writes at load, after
 * its last write, loads with its chunk as written (design 2 step 3: it
 * stayed with the state the loader keeps, reported). Options of one split group writing one binding
 * are not reported: the binding goes to their chunk. Template-literal
 * initialisers (openstory) are reported and their fix, their own module,
 * works. An exported `new URL(text)` the split component alone reads is
 * reported too, and its annotated fix is not. Vite, Rspack, webpack and
 * Rsbuild client builds.
 */
import { describe, expect, test } from 'vitest'
import {
  diagnosticPosition,
  expectDiagnostic,
  findDiagnostics,
} from '@tanstack/compiler-test-utils/diagnostics'
import { build, buildWithRsbuild, head } from '../build-harness'
import type { BuildResult } from '@tanstack/compiler-test-utils/build-harness'

const timeout = 120_000

const query = `import { Marker } from './marker'
export function queryOptions<T>(options: T): T {
  new Marker('MARK_query_called')
  return options
}
`

const routes = {
  // the real app's shape: the route module needs the export (no report)
  'routes/course.tsx': `${head}import { queryOptions } from '../query'
async function fetchModules() { return ['MARK_course_modules'] }
export const modulesQueryOptions = queryOptions({
  queryKey: ['modules'],
  queryFn: () => fetchModules(),
})
export const Route = createFileRoute('/course')({
  loader: async () => {
    const modules = await modulesQueryOptions.queryFn()
    return { modules }
  },
  component: Layout,
})
function Layout() {
  const { modules } = Route.useLoaderData()
  return <p>{modulesQueryOptions.queryKey[0]}{modules[0]}</p>
}
`,
  // only the split component reads it: it stays eager, reported
  'routes/eager-export.tsx': `${head}import { queryOptions } from '../query'
export const postOptions = queryOptions({ queryKey: ['MARK_eager-export_END'] })
export const Route = createFileRoute('/eager-export')({
  loader: () => 'data',
  component: () => <p>{postOptions.queryKey[0]}{Route.useLoaderData()}</p>,
})
`,
  // its fix: the call marked pure
  'routes/eager-export-pure.tsx': `${head}import { queryOptions } from '../query'
export const postOptions = /* @__PURE__ */ queryOptions({ queryKey: ['MARK_eager-export-pure_END'] })
export const Route = createFileRoute('/eager-export-pure')({
  loader: () => 'data',
  component: () => <p>{postOptions.queryKey[0]}{Route.useLoaderData()}</p>,
})
`,
  // a standard global that may throw (`new URL(text)`): rule L only times
  // code, so it is no candidate for an extracted module a host may flag
  // side-effect free; it stays, reported (architect's ruling on the order
  // rule v2 review, finding 2)
  'routes/url-export.tsx': `${head}const text = 'https://x/?MARK_url-export_END'
export const url = new URL(text)
export const Route = createFileRoute('/url-export')({
  loader: () => 'data',
  component: () => <p>{String(url)}{Route.useLoaderData()}</p>,
})
`,
  // its fix: the `new` marked pure
  'routes/url-export-pure.tsx': `${head}const text = 'https://x/?MARK_url-export-pure_END'
export const url = /* @__PURE__ */ new URL(text)
export const Route = createFileRoute('/url-export-pure')({
  loader: () => 'data',
  component: () => <p>{String(url)}{Route.useLoaderData()}</p>,
})
`,
  // its other fix: its own module
  'routes/eager-export-module.tsx': `${head}import { postOptions } from '../post-options'
export const Route = createFileRoute('/eager-export-module')({
  loader: () => 'data',
  component: () => <p>{postOptions.queryKey[0]}{Route.useLoaderData()}</p>,
})
`,
  'post-options.ts': `import { queryOptions } from './query'
export const postOptions = queryOptions({ queryKey: ['MARK_eager-export-module_END'] })
`,
  // a declared component writing what the loader reads (shared-writer)
  'routes/writer.tsx': `${head}let count = 0
function Counter() { count++; return <p>MARK_writer_END{count}</p> }
export const Route = createFileRoute('/writer')({
  loader: () => count,
  component: Counter,
})
`,
  // its fix: the state in its own module
  'routes/writer-fixed.tsx': `${head}import { counter } from '../counter'
function Counter() { counter.n++; return <p>MARK_writer-fixed_END{counter.n}</p> }
export const Route = createFileRoute('/writer-fixed')({
  loader: () => counter.n,
  component: Counter,
})
`,
  'counter.ts': 'export const counter = { n: 0 }\n',
  // openstory's connect links: template-literal initialisers, which no
  // annotation frees (R101: only the move is offered; openstory reads
  // `CONFIG.url`, a member read, which rule L takes as no effect: a call
  // keeps the shape)
  'routes/template.tsx': `${head}import { CONFIG } from '../config'
const BASE = \`\${CONFIG.url()}/mcp\`
const LINK = \`https://y/?u=\${BASE}&MARK_template_END\`
export const Route = createFileRoute('/template')({
  loader: () => 'data',
  component: () => <a href={LINK}>{BASE}{Route.useLoaderData()}</a>,
  errorComponent: () => <p>{BASE}</p>,
})
`,
  // its fix: their own module
  'routes/template-module.tsx': `${head}import { BASE, LINK } from '../template-links'
export const Route = createFileRoute('/template-module')({
  loader: () => 'data',
  component: () => <a href={LINK}>{BASE}{Route.useLoaderData()}</a>,
  errorComponent: () => <p>{BASE}</p>,
})
`,
  'template-links.ts': `import { CONFIG } from './config'
export const BASE = \`\${CONFIG.url()}/mcp\`
export const LINK = \`https://y/?u=\${BASE}&MARK_template-module_END\`
`,
  'config.ts': "export const CONFIG = { url: () => 'https://x' }\n",
  // two options of one split group writing one binding: it goes with them
  'routes/group-writers.tsx': `${head}let renders = 0
export const Route = createFileRoute('/group-writers')({
  codeSplitGroupings: [['component', 'pendingComponent']],
  component: () => { renders++; return <p>MARK_group-writers_END{renders}</p> },
  pendingComponent: () => { renders++; return <p>MARK_group-writers-pending_END{renders}</p> },
})
`,
  // a reader of state the module writes at load, which the loader keeps,
  // after its last write: it moves with the component
  'routes/state.tsx': `${head}let n = 0
n++
const label = 'MARK_state_END' + n
function Page() { return <p>{label}</p> }
export const Route = createFileRoute('/state')({
  loader: () => n,
  component: Page,
})
`,
  // its fix: read the state inside the component
  'routes/state-fixed.tsx': `${head}let n = 0
n++
function Page() { return <p>{'MARK_state-fixed_END' + n}</p> }
export const Route = createFileRoute('/state-fixed')({
  loader: () => n,
  component: Page,
})
`,
}

const files = {
  'routes/__root.tsx': `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`,
  'marker.ts': `export class Marker {
  constructor(public name: string) {
    ;((globalThis as any).marks ??= []).push(name)
  }
}
`,
  'query.ts': query,
  ...routes,
  'entry.ts': `import { routeTree } from './routeTree.gen'
export { routeTree }
`,
}

const reported: Array<[file: string, needle: string]> = [
  ['routes/eager-export.tsx', 'postOptions = queryOptions'],
  ['routes/url-export.tsx', 'url = new URL'],
  ['routes/writer.tsx', 'Counter,'],
  ['routes/template.tsx', 'BASE = '],
]
const silent = [
  'routes/course.tsx',
  'routes/eager-export-pure.tsx',
  'routes/url-export-pure.tsx',
  'routes/eager-export-module.tsx',
  'routes/writer-fixed.tsx',
  'routes/state.tsx',
  'routes/state-fixed.tsx',
  'routes/group-writers.tsx',
  'routes/template-module.tsx',
]

const builds: Array<[string, () => Promise<BuildResult>]> = [
  ['vite', () => build({ bundler: 'vite', env: 'client', files })],
  ['rspack', () => build({ bundler: 'rspack', env: 'client', files })],
  ['webpack', () => build({ bundler: 'webpack', env: 'client', files })],
  ['rsbuild', () => buildWithRsbuild({ files, registerCleanup: () => {} })],
]

describe.each(builds)('a %s client build', (_name, create) => {
  test(
    'reports what only split code needs and the route module keeps, at its declaration; not what the route module needs, nor the fixes',
    async () => {
      const app = await create()
      const diagnostics = [...app.warnings, ...app.consoleMessages]
      for (const [file, needle] of reported) {
        expectDiagnostic(diagnostics, {
          severity: 'warning',
          file,
          root: app.root,
          position: diagnosticPosition(
            routes[file as keyof typeof routes],
            needle,
          ),
          times: 1,
        })
      }
      for (const file of silent) {
        expect(
          findDiagnostics(diagnostics, { file, root: app.root }),
          file,
        ).toEqual([])
      }
      // the fixes load the code with the route's chunk
      for (const lazy of [
        'eager-export-pure',
        'eager-export-module',
        'writer-fixed',
        'state',
        'state-fixed',
        'group-writers',
        'group-writers-pending',
        'template-module',
      ]) {
        expect(app.where(`MARK_${lazy}_END`), lazy).toBe('lazy')
      }
      expect(app.where('MARK_eager-export_END')).toBe('eager')
    },
    timeout,
  )
})
