/**
 * Start's code in a route file under the route file's placement. A derived
 * output that would assign a binding it imports from another module of the
 * file (a `<Hydrate>` chunk) is not made; its code stays in place (the
 * boundary is reported, as for any module). A server function's lazy handler
 * module imports nothing of the route file (but a name a statement
 * declares): it copies what it reads, as
 * `main`'s provider copy does (R156). What only server code the client
 * erases reads leaves the client's route module.
 */
import { describe, expect, it } from 'vitest'
import { compileModule } from '@tanstack/router-utils/compiler'
import {
  ROUTER_PLANNER,
  routerPlanner,
  routerPlannerConfigFrom,
} from '@tanstack/router-plugin/planners'
import { startRecognizer } from '../../src/compiler/recognizer'
import { createHydratePlanner } from '../../src/planners/hydrate'
import { START_ENV, startPlanners } from '../../src/planners'
import { MemoryHost, clientEnv, ssrEnv } from './memory-host'
import type {
  CompileOutput,
  EnvInfo,
  HostServices,
} from '@tanstack/router-utils/compiler'

const ROOT = '/app'
const FILE = '/app/src/routes/index.tsx'
const HANDLER_ID = `${FILE}?tss-serverfn-handler`

function compile(
  code: string,
  env: EnvInfo,
  opts: { hydrate?: boolean; id?: string } = {},
): Promise<CompileOutput | null> {
  const memory = new MemoryHost(
    { [FILE]: code },
    { recognizer: startRecognizer() },
  )
  const host: HostServices = {
    resolve: (specifier, importer) => memory.resolve(specifier, importer),
    rawFacts: memory.rawFacts,
    routes: {
      lookup: (path) =>
        path === FILE
          ? { routeId: '/', kind: 'file', routerConstructor: true }
          : null,
      digestFor: (path) => (path === FILE ? 'route' : null),
    },
  }
  const client = env.type === 'client'
  return compileModule(
    {
      id: opts.id ?? FILE,
      code,
      env,
      planners: startPlanners({
        router: routerPlanner(),
        hydrate: opts.hydrate ? createHydratePlanner() : null,
      }),
      config: {
        configKey: `cfg-${env.name}`,
        perPlanner: {
          [START_ENV]: {
            framework: 'react',
            root: ROOT,
            providerSeparate: false,
            idMode: 'dev',
          },
          [ROUTER_PLANNER]: routerPlannerConfigFrom(undefined, {
            framework: 'react',
            envType: client ? 'client' : 'server',
            mode: 'build',
            hmrStyle: 'vite',
            start: true,
          }),
          hydrate: { root: ROOT },
        },
      },
      wantMap: false,
    },
    host,
    memory.caches,
  )
}

const FNS = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
`

describe('a server function handler in a route file (SSR)', () => {
  it('moves a handler that only reads module state to its handler module (control)', async () => {
    const out = await compile(
      `${FNS}let count = 0
export const read = createServerFn().handler(async () => count)
export const Route = createFileRoute('/')({
  loader: () => count,
  component: () => 'page',
})
`,
      ssrEnv,
    )
    expect(out!.code).toContain('?tss-serverfn-handler')
  })

  // (R156: the handler assigns its module's own `count`, as it assigns the
  // copy's in `main`'s provider; main's second instance)
  it('moves a handler that assigns a `let` the route file keeps, with its own copy of it', async () => {
    const code = `${FNS}let count = 0
export const bump = createServerFn().handler(async () => count++)
export const Route = createFileRoute('/')({
  loader: () => count,
  component: () => 'page',
})
`
    const out = await compile(code, ssrEnv)
    expect(out!.diagnostics.filter((d) => d.severity === 'error')).toEqual([])
    expect(out!.code).not.toContain('count++')
    expect(out!.code).toContain('?tss-serverfn-handler')
    const handler = await compile(code, ssrEnv, { id: HANDLER_ID })
    expect(handler!.code).toContain('let count = 0')
    expect(handler!.code).toContain('count++')
  })
})

describe('<Hydrate> children in a route file (client)', () => {
  it('reports children that assign a `let` the route file keeps, and makes no chunk', async () => {
    const code = `import { createFileRoute } from '@tanstack/react-router'
import { Hydrate } from '@tanstack/react-start'
let clicks = 0
function Page() {
  return <Hydrate><p onClick={() => clicks++}>{clicks}</p></Hydrate>
}
export const Route = createFileRoute('/')({
  loader: () => clicks,
  component: Page,
})
`
    const out = await compile(code, clientEnv, { hydrate: true })
    expect(
      out!.diagnostics
        .filter((d) => d.severity === 'error')
        .map((d) => ({ code: d.code, start: d.range?.start })),
    ).toEqual([
      { code: 'hydrate-module-write', start: code.indexOf('<Hydrate') },
    ])
    expect(out!.code).not.toContain('?tss-hydrate=')
  })
})

describe('module state only server code reads (client)', () => {
  it('leaves the route module with what reads it', async () => {
    const out = await compile(
      `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, createServerOnlyFn } from '@tanstack/react-start'
import { connect } from '../server/db'
const conn = connect(process.env.DB_URL)
const query = createServerOnlyFn(() => conn.q())
const fetchIt = createServerFn().handler(() => conn.q())
export const Route = createFileRoute('/')({ component: () => 'page' })
`,
      clientEnv,
    )
    expect(out!.code).not.toContain('connect')
    expect(out!.code).not.toContain('../server/db')
  })
})

describe('server functions next to a split component (client and server)', () => {
  const START = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'
`

  // state two server functions use, one assigning it: server-only on the
  // client, in the handler module on the server
  const twoFns = (
    exported: boolean,
  ) => `${START}import { connect } from '../server/db'
let conn = connect()
const getRows = createServerFn().handler(async () => conn.rows)
${exported ? 'export ' : ''}const reset = createServerFn({ method: 'POST' }).handler(async () => {
  conn = connect()
  return 1
})
function Page() {
  const r = useServerFn(reset)
  return <p>{typeof getRows}{typeof r}</p>
}
export const Route = createFileRoute('/')({ loader: async () => getRows(), component: Page })
`

  it.each([true, false])(
    'leaves state only server functions use out of the client route module (exported: %s)',
    async (exported) => {
      const out = await compile(twoFns(exported), clientEnv)
      expect(out!.code).not.toContain('connect')
      expect(out!.code).not.toContain('../server/db')
      expect(out!.code).toContain('lazyRouteComponent')
    },
  )

  it('splits the component and keeps the handlers lazy on the server', async () => {
    const out = await compile(twoFns(false), ssrEnv)
    expect(out!.code).toContain('lazyRouteComponent')
    expect(out!.code).toContain('?tss-serverfn-handler')
    expect(out!.code).not.toContain('connect')
  })

  it('keeps a handler filling a module cache lazy on the server', async () => {
    const out = await compile(
      `${START}import { heavy } from '../server/heavy'
let cached: any
const getData = createServerFn().handler(async () => {
  cached ??= heavy()
  return cached
})
function Page() {
  return <p>{typeof getData}</p>
}
export const Route = createFileRoute('/')({ loader: async () => getData(), component: Page })
`,
      ssrEnv,
    )
    expect(out!.code).toContain('?tss-serverfn-handler')
    expect(out!.code).not.toContain('heavy')
    expect(out!.code).toContain('lazyRouteComponent')
  })

  // a helper the loader, the component and a handler use: `main`'s shared
  // module on both sides; the handler where Start puts it
  it.each([
    ['client', clientEnv],
    ['ssr', ssrEnv],
  ] as const)(
    'gives a helper the loader, the split component and a handler use one module (%s)',
    async (_name, env) => {
      const out = await compile(
        `${START}import { format } from '../format'
function label(x: string) {
  return format(x)
}
const getRows = createServerFn().handler(async () => label('rows'))
export const Route = createFileRoute('/')({
  loader: async () => [await getRows(), label('loader')],
  component: () => <p>{label('component')}</p>,
})
`,
        env,
      )
      expect(out!.code).toMatch(
        /import \{[^}]*\blabel\b[^}]*\} from '[^']*tsr-split=shared/,
      )
      expect(out!.code).not.toMatch(/function label/)
      expect(out!.code).toContain('lazyRouteComponent')
    },
  )
})

// A use in a type is a use: an import or declaration only removed code
// reads in a type leaves the module (TypeScript keeps an import of a class
// or of what `typeof` reads under `verbatimModuleSyntax`)
describe('what only an erased handler reads in a type (client)', () => {
  const START = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
`

  it('leaves an import a handler reads in a cast out of the client route module', async () => {
    const out = await compile(
      `${START}import { Db } from './db.server'
const getRows = createServerFn().handler(async () => {
  const d = null as Db | null
  return String(d)
})
function Page() {
  return <p>{typeof getRows}</p>
}
export const Route = createFileRoute('/')({ loader: async () => getRows(), component: Page })
`,
      clientEnv,
    )
    expect(out!.code).not.toContain('db.server')
    expect(out!.code).toContain('lazyRouteComponent')
  })

  it('leaves a declaration a handler reads through `typeof` out of the client route module', async () => {
    const out = await compile(
      `${START}import { connect } from './db.server'
const db = connect()
const getRows = createServerFn().handler(async () => {
  const r = null as typeof db | null
  return String(r)
})
function Page() {
  return <p>{typeof getRows}</p>
}
export const Route = createFileRoute('/')({ loader: async () => getRows(), component: Page })
`,
      clientEnv,
    )
    expect(out!.code).not.toContain('connect')
    expect(out!.code).not.toContain('db.server')
  })
})

// A `let` two split options read and a server function's handler assigns:
// on the client the handler is erased and writes nothing, so the `let` is
// `main`'s shared name, one instance both chunks import
describe('a `let` two split options read and a handler assigns', () => {
  const code = `import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
let filters: { q: string } = { q: '' }
export const resetFilters = createServerFn({ method: 'POST' }).handler(async () => {
  filters = { q: '' }
  return 1
})
function Page() {
  filters.q = 'x'
  return <p>{filters.q}</p>
}
function Err() {
  return <b>{filters.q}</b>
}
export const Route = createFileRoute('/')({ component: Page, errorComponent: Err })
`
  const chunkIds = (route: string) =>
    [...route.matchAll(/import\('([^']*tsr-split=[^']*)'\)/g)].map((m) => m[1]!)

  it('gives both chunks one instance, from the shared module, on the client', async () => {
    const out = await compile(code, clientEnv)
    const ids = chunkIds(out!.code)
    expect(ids).toHaveLength(2)
    for (const id of ids) {
      const chunk = await compile(code, clientEnv, { id })
      expect(chunk!.code).toMatch(
        /import \{[^}]*\bfilters\b[^}]*\} from '[^']*tsr-split=shared/,
      )
      expect(chunk!.code).not.toMatch(/let filters/)
    }
  })

  it('splits both options and keeps the handler lazy on the server', async () => {
    const out = await compile(code, ssrEnv)
    expect(chunkIds(out!.code)).toHaveLength(2)
    expect(out!.code).toContain('?tss-serverfn-handler')
  })
})

// (the handler module of the control, requested by id, is valid on its own)
it('serves the handler module of a handler that only reads module state', async () => {
  const code = `${FNS}let count = 0
export const read = createServerFn().handler(async () => count)
export const Route = createFileRoute('/')({
  loader: () => count,
  component: () => 'page',
})
`
  const out = await compile(code, ssrEnv, { id: HANDLER_ID })
  // (its own copy of `count`, as `main`'s provider copy: R156)
  expect(out!.code).toContain('let count = 0')
  expect(out!.code).not.toMatch(/import \{[^}]*\bcount\b[^}]*\} from/)
})
