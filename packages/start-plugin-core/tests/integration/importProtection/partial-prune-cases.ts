/**
 * The app of the partial-prune tests (partial-prune-build.test.ts,
 * partial-prune-dev.test.ts): denied imports the client keeps only part of.
 * Each case imports two bindings of a denied module in one statement and
 * reads one only where the client erases it (a server fn handler, a route's
 * `server` option, a `<Hydrate>` boundary's children, which another output
 * holds); the client keeps the import with the other binding. That import
 * is a surviving edge (SPEC J6.4): judged and substituted like an import
 * the client keeps whole, whatever happened to its other specifiers.
 *
 * Denied: the real `@tanstack/react-start/server` (a default rule), the
 * package `server-sdk` (a configured specifier rule) and the file
 * `src/secret.server.ts` (the default file rule). A real denied module
 * records that it ran (`globalThis.realLoaded`); a mock runs none of it.
 */

/** Text of every real denied module (`server-sdk`, `src/secret.server.ts`). */
export const realMark = 'REAL_DENIED'

const denied = (name: string) => `;(globalThis as any).realLoaded = '${name}'
export const a = () => '${realMark} ${name} a'
export const b = () => '${realMark} ${name} b'
export default () => '${realMark} ${name} default'
`

const deniedFiles = {
  'node_modules/server-sdk/package.json': JSON.stringify({
    name: 'server-sdk',
    type: 'module',
    exports: './index.js',
  }),
  'node_modules/server-sdk/index.js': denied('server-sdk').replace(
    ' as any',
    '',
  ),
  'src/secret.server.ts': denied('secret.server'),
}

const serverFn = `import { createServerFn } from '@tanstack/react-start'\n`

/**
 * The cases the entry imports (`src/cases/<name>`): each exports `leak`,
 * which returns what the client kept of the import.
 */
export const moduleCases: Record<string, string> = {
  // the review's report (#8817): two server helpers of one import, one read
  // only in a handler
  'start-server.ts': `${serverFn}import { getCookie, setCookie } from '@tanstack/react-start/server'
export const fn = createServerFn().handler(() => getCookie('a'))
export const leak = () => setCookie
`,
  'named.ts': `${serverFn}import { a, b } from 'server-sdk'
export const fn = createServerFn().handler(() => a())
export const leak = () => b
`,
  'default-pruned.ts': `${serverFn}import a, { b } from 'server-sdk'
export const fn = createServerFn().handler(() => a())
export const leak = () => b
`,
  'default-kept.ts': `${serverFn}import b, { a } from 'server-sdk'
export const fn = createServerFn().handler(() => a())
export const leak = () => b
`,
  'namespace.ts': `${serverFn}import a, * as sdk from 'server-sdk'
export const fn = createServerFn().handler(() => a())
export const leak = () => sdk.b
`,
  // the import is pruned whole; the re-export of the same module stays
  'reexport.ts': `${serverFn}import { a } from 'server-sdk'
export const fn = createServerFn().handler(() => a())
export { b as leak } from 'server-sdk'
`,
  'server-file.ts': `${serverFn}import { a, b } from '../secret.server'
export const fn = createServerFn().handler(() => a())
export const leak = () => b
`,
  // the children move to the boundary's own output, the rest stays
  'hydrate.tsx': `import { Hydrate } from '@tanstack/react-start'
import { load } from '@tanstack/react-start/hydration'
import { a, b } from 'server-sdk'
export function Page() {
  return <Hydrate when={load()}><p>{String(a)}</p></Hydrate>
}
export const leak = () => b
`,
}

/** Route files: the route module keeps part of the import, or its split chunk does. */
export const routeCases: Record<string, string> = {
  'route-module.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { a, b } from 'server-sdk'
export const Route = createFileRoute('/route-module')({
  server: { handlers: { GET: () => new Response(a()) } },
  head: () => ({ meta: [{ title: String(b) }] }),
  component: () => <p>route module</p>,
})
`,
  'split-chunk.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { a, b } from 'server-sdk'
export const Route = createFileRoute('/split-chunk')({
  server: { handlers: { GET: () => new Response(a()) } },
  component: () => <p>{String(b)}</p>,
})
`,
}

/** Every importer the client build must report, sorted. */
export const expectedImporters = [
  ...Object.keys(moduleCases).map((file) => `src/cases/${file}`),
  ...Object.keys(routeCases).map((file) => `src/routes/${file}`),
].sort()

/**
 * `src/entry.ts`: every module case and their `leak`s
 * (`globalThis.partialLeaks`), the route tree (the route files,
 * `globalThis.partialRouteTree`) and the router entry.
 */
const entry = `${Object.keys(moduleCases)
  .map(
    (file, index) =>
      `import { leak as c${index} } from './cases/${file.replace(/\.tsx?$/, '')}'`,
  )
  .join('\n')}
import { routeTree } from './routeTree.gen'
export const leaks = { ${Object.keys(moduleCases)
  .map((file, index) => `${JSON.stringify(file)}: c${index}`)
  .join(', ')} }
;(globalThis as any).partialLeaks = leaks
;(globalThis as any).partialRouteTree = routeTree
export { getRouter } from './router'
`

/** The app: the cases, the entry, and the router over the generated route tree. */
export const partialPruneApp: Record<string, string> = {
  ...deniedFiles,
  ...Object.fromEntries(
    Object.entries(moduleCases).map(([file, code]) => [
      `src/cases/${file}`,
      code,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(routeCases).map(([file, code]) => [
      `src/routes/${file}`,
      code,
    ]),
  ),
  'src/entry.ts': entry,
  'src/router.ts': `import { routeTree } from './routeTree.gen'
export const getRouter = () => ({ routeTree })
`,
}

/** The configured rule of `server-sdk`; reports silent at run time. */
export const partialPruneProtection = {
  client: { specifiers: ['server-sdk'] },
  mockAccess: 'off' as const,
}

/**
 * A script for a client run (after `describeValuePrelude`): what each
 * case's `leak()` returns (`a safe mock` when mocked), and which real
 * denied module ran, if any.
 */
export const readLeaks = `const leaks = globalThis.partialLeaks
return {
  leaks: Object.fromEntries(Object.entries(leaks).map(([name, leak]) => [name, describeValue(leak(), '${realMark}')])),
  realLoaded: globalThis.realLoaded ?? null,
}`

/**
 * A script for a dev server's client run, before `readLeaks`: loads the
 * split chunk of `src/routes/split-chunk.tsx` (a dev server compiles it when
 * the page requests it).
 */
export const loadSplitChunk = `const splitRoute = Object.values(globalThis.partialRouteTree.children).find((route) => route.options.path === '/split-chunk')
await splitRoute.options.component.preload()
`

/** What a client run reads when every case is mocked. */
export const mockedLeaks = {
  leaks: Object.fromEntries(
    Object.keys(moduleCases).map((file) => [file, 'a safe mock']),
  ),
  realLoaded: null,
}
