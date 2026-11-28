// Deterministic generator for the compiler performance workloads.
//
// Writes a large file-based app (React or Solid) into `apps/<variant>/`. The output only
// depends on the variant name and SEED, so baseline and candidate checkouts get
// byte-identical inputs. `workloadHash()` hashes the generated sources so the
// results can prove that.
//
// Variants:
// - react-start:  TanStack Start (Vite + Rsbuild configs) with ~340 routes,
//                 ~105 server functions, middleware, isomorphic/server-only/
//                 client-only fns, ClientOnly, <Hydrate> boundaries, server
//                 routes and `*.server.ts` modules.
// - react-router: the same route tree as a plain Router SPA with
//                 autoCodeSplitting, without any Start feature.
// - solid-start, solid-router: the same apps written for Solid (signals,
//                 <For>/<Show>, `class`, accessors for router hooks).
// - react-start-deps: react-start plus a large generated dependency graph in
//                 the app's node_modules (an icon barrel of 2,000 modules, a
//                 chain of 400 utility modules, a Start library that calls
//                 Start APIs and imports a 2 MB `?url` asset) that the routes
//                 import, and tanstack.com's `manualChunks` group of Start's
//                 runtime. Dependency-scope regressions of the compilers (what
//                 is compiled, read or parsed under node_modules) show here.

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const benchRoot = path.resolve(here, '..')
export const appsRoot = path.join(benchRoot, 'apps')

export const SEED = 20261024
// Default variants. `ALL_VARIANTS` adds the Solid ones (`--variants`).
export const VARIANTS = ['react-start', 'react-router']
export const ALL_VARIANTS = [
  ...VARIANTS,
  'solid-start',
  'solid-router',
  'react-start-deps',
]

export const isStart = (variant) => variant.includes('-start')
export const hasRsbuild = (variant) => variant === 'react-start'
/** Whether the app imports the generated dependency graph (`react-start-deps`). */
export const hasDeps = (variant) => variant.endsWith('-deps')
const DEP_ICONS = 2000
const DEP_UTILS = 400
export const frameworkOf = (variant) => variant.split('-')[0]

const SECTIONS = 10
const GROUPS = 3
const ITEMS = 6
const WIDGETS = 40
const SERVER_FN_FILES = 20

// Files that the HMR scenarios edit. Each one contains the literal token
// `<kind>-v0`, which the harness swaps for a fresh token on every iteration.
export const PROBES = {
  'react-start': {
    'route-component': {
      file: 'src/routes/s00/g0/i0.tsx',
      url: '/s00/g0/i0',
      token: 'probe-component-v0',
    },
    'route-loader': {
      file: 'src/routes/s00/g0/i1.tsx',
      url: '/s00/g0/i1',
      token: 'probe-loader-v0',
    },
    'shared-component': {
      file: 'src/components/ProbeWidget.tsx',
      url: '/s00/g0/i2',
      token: 'probe-widget-v0',
    },
    'server-fn': {
      file: 'src/server/probe.ts',
      url: '/s00/g0/i3',
      token: 'probe-serverfn-v0',
      poll: true,
    },
    hydrate: {
      file: 'src/routes/s00/g0/i4.tsx',
      url: '/s00/g0/i4',
      token: 'probe-hydrate-v0',
    },
  },
  'react-router': {
    'route-component': {
      file: 'src/routes/s00/g0/i0.tsx',
      url: '/s00/g0/i0',
      token: 'probe-component-v0',
    },
    'route-loader': {
      file: 'src/routes/s00/g0/i1.tsx',
      url: '/s00/g0/i1',
      token: 'probe-loader-v0',
    },
    'shared-component': {
      file: 'src/components/ProbeWidget.tsx',
      url: '/s00/g0/i2',
      token: 'probe-widget-v0',
    },
  },
}

PROBES['solid-start'] = PROBES['react-start']
PROBES['solid-router'] = PROBES['react-router']
PROBES['react-start-deps'] = PROBES['react-start']

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n) => String(n).padStart(2, '0')
const pad4 = (n) => String(n).padStart(4, '0')
const WORDS = [
  'alpha',
  'bravo',
  'canyon',
  'delta',
  'ember',
  'fjord',
  'granite',
  'harbor',
  'indigo',
  'juniper',
  'kestrel',
  'lumen',
  'meadow',
  'nectar',
  'onyx',
  'prairie',
  'quartz',
  'raven',
  'sierra',
  'tundra',
]

function createRng(seed) {
  const next = mulberry32(seed)
  return {
    chance: (p) => next() < p,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    word: () => WORDS[Math.floor(next() * WORDS.length)],
  }
}

function relImport(fromFile, toFile) {
  let rel = path.posix.relative(path.posix.dirname(fromFile), toFile)
  if (!rel.startsWith('.')) {
    rel = './' + rel
  }
  return rel.replace(/\.(tsx?|jsx?)$/, '')
}

function componentName(routePath) {
  if (routePath === '/') {
    return 'Home'
  }
  const segments = routePath
    .replace(/\/$/, '/index')
    .replace(/\/\$$/, '/splat')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
  return segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')
}

// ---------------------------------------------------------------------------
// Route tree description (shared by both variants)
// ---------------------------------------------------------------------------

function routeList(variant) {
  const routes = []
  const add = (file, routePath, kind, extra = {}) =>
    routes.push({ file: `src/routes/${file}`, routePath, kind, ...extra })

  add('index.tsx', '/', 'home')
  add('about.tsx', '/about', 'leaf')
  add('_auth.tsx', '/_auth', 'pathless')
  for (const name of ['settings', 'profile', 'billing', 'team']) {
    add(`_auth/${name}.tsx`, `/_auth/${name}`, 'leaf')
  }
  for (const name of ['pricing', 'features', 'contact']) {
    add(`(marketing)/${name}.tsx`, `/(marketing)/${name}`, 'leaf')
  }
  add('docs/index.tsx', '/docs/', 'leaf')
  add('docs/$.tsx', '/docs/$', 'splat')

  for (let s = 0; s < SECTIONS; s++) {
    const sec = `s${pad(s)}`
    add(`${sec}/route.tsx`, `/${sec}`, 'layout', { depth: 1 })
    add(`${sec}/index.tsx`, `/${sec}/`, 'leaf')
    for (let g = 0; g < GROUPS; g++) {
      const grp = `${sec}/g${g}`
      add(`${grp}/route.tsx`, `/${grp}`, 'layout', { depth: 2 })
      add(`${grp}/index.tsx`, `/${grp}/`, 'leaf')
      for (let i = 0; i < ITEMS; i++) {
        add(`${grp}/i${i}.tsx`, `/${grp}/i${i}`, 'leaf', {
          probe: s === 0 && g === 0 ? i : undefined,
        })
      }
      add(`${grp}/$itemId.tsx`, `/${grp}/$itemId`, 'param')
      add(`${grp}/$itemId.edit.tsx`, `/${grp}/$itemId/edit`, 'param')
    }
  }

  if (isStart(variant)) {
    for (const name of ['health', 'items', 'search', 'session', 'webhook']) {
      add(`api/${name}.ts`, `/api/${name}`, 'api')
    }
  }
  return routes
}

// ---------------------------------------------------------------------------
// Shared modules
// ---------------------------------------------------------------------------

function widgetSource(n, rng, fw) {
  const rows = rng.int(3, 7)
  const tone = rng.pick(['info', 'warn', 'ok', 'muted'])
  if (fw === 'solid') {
    return `import { For, Show, createMemo, createSignal } from 'solid-js'
import { formatLabel, sumBy } from '../lib/format'

export interface Widget${pad(n)}Props {
  label: string
  items?: Array<{ id: string; value: number }>
  compact?: boolean
}

const TONE = '${tone}'

export function Widget${pad(n)}(props: Widget${pad(n)}Props) {
  const [open, setOpen] = createSignal(${rng.chance(0.5)})
  const items = () => props.items ?? []
  const total = createMemo(() => sumBy(items(), (item) => item.value))
  const visible = () => (props.compact ? items().slice(0, ${rows}) : items())

  return (
    <section class={\`widget widget-\${TONE}\`} data-widget="${pad(n)}">
      <header>
        <h3>{formatLabel(props.label)}</h3>
        <button type="button" onClick={() => setOpen((value) => !value)}>
          {open() ? 'Hide' : 'Show'} ({total()})
        </button>
      </header>
      <Show when={open()}>
        <ul>
          <For each={visible()}>
            {(item) => (
              <li>
                <span>{item.id}</span>
                <strong>{item.value.toFixed(${rng.int(0, 2)})}</strong>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </section>
  )
}
`
  }
  return `import { useMemo, useState } from 'react'
import { formatLabel, sumBy } from '../lib/format'

export interface Widget${pad(n)}Props {
  label: string
  items?: Array<{ id: string; value: number }>
  compact?: boolean
}

const TONE = '${tone}'

export function Widget${pad(n)}({ label, items = [], compact }: Widget${pad(n)}Props) {
  const [open, setOpen] = useState(${rng.chance(0.5)})
  const total = useMemo(() => sumBy(items, (item) => item.value), [items])
  const visible = compact ? items.slice(0, ${rows}) : items

  return (
    <section className={\`widget widget-\${TONE}\`} data-widget="${pad(n)}">
      <header>
        <h3>{formatLabel(label)}</h3>
        <button type="button" onClick={() => setOpen((value) => !value)}>
          {open ? 'Hide' : 'Show'} ({total})
        </button>
      </header>
      {open ? (
        <ul>
          {visible.map((item) => (
            <li key={item.id}>
              <span>{item.id}</span>
              <strong>{item.value.toFixed(${rng.int(0, 2)})}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
`
}

const formatSource = `export function formatLabel(label: string) {
  return label
    .split(/[-_\\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function sumBy<T>(items: Array<T>, pick: (item: T) => number) {
  let total = 0
  for (const item of items) {
    total += pick(item)
  }
  return total
}

export function formatPrice(cents: number) {
  return '$' + (cents / 100).toFixed(2)
}

export function makeItems(prefix: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: prefix + '-' + index,
    value: (index * 37) % 101,
  }))
}
`

const probeWidgetSource = (fw) => `export function ProbeWidget() {
  return (
    <aside ${fw === 'solid' ? 'class' : 'className'}="probe-widget">
      <span data-probe="shared-component">probe-widget-v0</span>
    </aside>
  )
}
`

const dataApiSource = `import { makeItems } from '../lib/format'

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function fetchSection(section: string) {
  await wait(0)
  return { section, items: makeItems(section, 8) }
}

export async function fetchItem(id: string, page = 1) {
  await wait(0)
  return { id, page, title: 'Item ' + id, items: makeItems(id, 5) }
}

export async function fetchList(prefix: string) {
  await wait(0)
  return makeItems(prefix, 12)
}
`

function dbServerSource() {
  return `// Server-only data access. Only server function handlers import this module.
import { makeItems } from '../lib/format'

const tables = new Map<string, Array<{ id: string; value: number }>>()

function table(name: string) {
  let rows = tables.get(name)
  if (!rows) {
    rows = makeItems(name, 20)
    tables.set(name, rows)
  }
  return rows
}

export const db = {
  async find(name: string, id: string) {
    return table(name).find((row) => row.id === id) ?? { id, value: 0 }
  },
  async list(name: string, page = 1) {
    return table(name).slice((page - 1) * 5, page * 5)
  },
  async update(name: string, id: string, value: number) {
    const rows = table(name)
    const row = rows.find((entry) => entry.id === id)
    if (row) {
      row.value = value
    }
    return row ?? null
  },
  secret: process.env.DATABASE_URL ?? 'memory://local',
}
`
}

const secretsServerSource = `export function readSecret(name: string) {
  return process.env[name] ?? 'dev-' + name.toLowerCase()
}
`

const middlewareSource = (
  fw,
) => `import { createMiddleware } from '@tanstack/${fw}-start'
import { readSecret } from './secrets.server'

export const loggingMiddleware = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    const result = await next()
    return result
  },
)

export const authMiddleware = createMiddleware({ type: 'function' })
  .client(async ({ next }) => {
    return next({ sendContext: { clientTime: Date.now() } })
  })
  .server(async ({ next }) => {
    return next({ context: { user: { id: 'u1', token: readSecret('AUTH_TOKEN') } } })
  })

export const timingMiddleware = createMiddleware({ type: 'function' })
  .middleware([loggingMiddleware])
  .server(async ({ next }) => {
    const start = Date.now()
    const result = await next()
    void (Date.now() - start)
    return result
  })
`

function serverFnFileSource(n, rng, fw) {
  const id = pad(n)
  const mw = () =>
    rng.pick([
      '[loggingMiddleware]',
      '[authMiddleware]',
      '[timingMiddleware]',
      '[authMiddleware, loggingMiddleware]',
    ])
  return `import { createServerFn } from '@tanstack/${fw}-start'
import { db } from './db.server'
import { authMiddleware, loggingMiddleware, timingMiddleware } from './middleware'

export const getItem${id} = createServerFn({ method: 'GET' })
  .middleware(${mw()})
  .validator((input: { id: string; page?: number }) => input)
  .handler(async ({ data }) => {
    const row = await db.find('t${id}', data.id)
    return { id: data.id, page: data.page ?? 1, value: row.value, title: 'Item ' + data.id }
  })

export const listItems${id} = createServerFn({ method: 'GET' })
  .validator((input: { page: number }) => {
    if (input.page < 1) {
      throw new Error('page must be positive')
    }
    return input
  })
  .handler(async ({ data }) => {
    return db.list('t${id}', data.page)
  })

export const updateItem${id} = createServerFn({ method: 'POST' })
  .middleware(${mw()})
  .validator((input: { id: string; value: number }) => input)
  .handler(async ({ data, context }) => {
    void context
    return db.update('t${id}', data.id, data.value)
  })

export const stats${id} = createServerFn().handler(async () => {
  const rows = await db.list('t${id}')
  return { count: rows.length, connection: db.secret.length > 0 ? 'ok' : 'none' }
})
`
}

const probeServerFnSource = (
  fw,
) => `import { createServerFn } from '@tanstack/${fw}-start'
import { db } from './db.server'

export const getProbe = createServerFn({ method: 'GET' }).handler(async () => {
  void db
  return 'probe-serverfn-v0'
})
`

function isoSource(n, fw) {
  return `import {
  createClientOnlyFn,
  createIsomorphicFn,
  createServerOnlyFn,
} from '@tanstack/${fw}-start'

export const runtimeLabel${n} = createIsomorphicFn()
  .server(() => 'server-${n}')
  .client(() => 'client-${n}')

export const readServerConfig${n} = createServerOnlyFn(() => ({
  region: process.env.REGION ?? 'local',
  slot: ${n},
}))

export const readViewport${n} = createClientOnlyFn(() => window.innerWidth + ${n})
`
}

// ---------------------------------------------------------------------------
// Route sources
// ---------------------------------------------------------------------------

function routeSource(route, variant, rng, ctx) {
  const start = isStart(variant)
  const fw = frameworkOf(variant)
  const solid = fw === 'solid'
  // Solid: router hooks return accessors, JSX uses `class`.
  const call = solid ? '()' : ''
  const cls = solid ? 'class' : 'className'
  if (route.kind === 'api') {
    return apiRouteSource(route, fw)
  }
  const file = route.file
  const imp = (to) => relImport(file, to)
  const name = componentName(route.routePath)
  const lines = []
  const reactImports = new Set([solid ? 'createSignal' : 'useState'])
  const routerImports = new Set(['createFileRoute', 'Link'])
  const startImports = new Set()
  const extraImports = []
  const options = []
  const body = []
  const helpers = []

  const probeKind = Object.keys(PROBES[variant]).find(
    (kind) => PROBES[variant][kind].url === route.routePath,
  )

  const widgets = Array.from({ length: rng.int(1, 3) }, () =>
    rng.int(0, WIDGETS - 1),
  )
  for (const w of new Set(widgets)) {
    extraImports.push(
      `import { Widget${pad(w)} } from '${imp(`src/components/Widget${pad(w)}.tsx`)}'`,
    )
  }
  extraImports.push(
    `import { formatLabel, makeItems } from '${imp('src/lib/format.ts')}'`,
  )
  // the dependency graph: two icons through the barrel, the Start library
  const deps = hasDeps(variant)
  const icons = deps
    ? [...new Set([rng.int(0, DEP_ICONS - 1), rng.int(0, DEP_ICONS - 1)])]
    : []
  if (deps) {
    extraImports.push(
      `import { ${icons.map((n) => `Icon${pad4(n)}`).join(', ')} } from '@bench/icons'`,
    )
    extraImports.push(`import { LibBadge } from '@bench/start-lib'`)
  }

  // --- loader -------------------------------------------------------------
  const hasSearch = route.kind === 'leaf' && rng.chance(0.2)
  const hasLoader =
    probeKind === 'route-loader' ||
    (probeKind === undefined && route.kind !== 'pathless' && rng.chance(0.7))
  const fnFile = rng.int(0, SERVER_FN_FILES - 1)

  if (hasSearch) {
    options.push(`  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 1),
    sort: search.sort === 'desc' ? ('desc' as const) : ('asc' as const),
  }),`)
  }
  if (route.kind === 'pathless' || rng.chance(0.15)) {
    options.push(`  beforeLoad: ({ location }) => {
    return { visitedAt: location.pathname.length }
  },`)
  }
  if (hasLoader) {
    if (hasSearch) {
      options.push(`  loaderDeps: ({ search }) => ({ page: search.page }),`)
    }
    const pageExpr = hasSearch ? 'deps.page' : '1'
    const loaderArgs = hasSearch ? '{ deps, params }' : '{ params }'
    const idExpr =
      route.kind === 'param' ? 'params.itemId' : `'${route.routePath}'`
    if (probeKind === 'route-loader') {
      options.push(`  loader: async () => {
    return { probe: 'probe-loader-v0', items: makeItems('probe', 3) }
  },`)
    } else if (start) {
      extraImports.push(
        `import { getItem${pad(fnFile)}, stats${pad(fnFile)} } from '${imp(`src/server/fns-${pad(fnFile)}.ts`)}'`,
      )
      options.push(`  loader: async (${loaderArgs}) => {
    void params
    const [item, stats] = await Promise.all([
      getItem${pad(fnFile)}({ data: { id: String(${idExpr}), page: ${pageExpr} } }),
      stats${pad(fnFile)}(),
    ])
    return { item, stats, items: makeItems(item.id, 4) }
  },`)
    } else {
      extraImports.push(`import { fetchItem } from '${imp('src/data/api.ts')}'`)
      options.push(`  loader: async (${loaderArgs}) => {
    void params
    const item = await fetchItem(String(${idExpr}), ${pageExpr})
    return { item, items: item.items }
  },`)
    }
  }
  if (rng.chance(0.4)) {
    options.push(`  head: () => ({
    meta: [{ title: '${name} | Perf App' }, { name: 'description', content: '${rng.word()} ${rng.word()}' }],
  }),`)
  }
  const hasPending = rng.chance(0.3)
  const hasError = rng.chance(0.3)
  const hasNotFound = rng.chance(0.1)
  if (hasPending) {
    options.push(`  pendingComponent: PendingView,`)
    helpers.push(`function PendingView() {
  return <div ${cls}="pending">Loading ${name}…</div>
}`)
  }
  if (hasError) {
    routerImports.add('ErrorComponentProps')
    options.push(`  errorComponent: ErrorView,`)
    helpers.push(`function ErrorView({ error, reset }: ErrorComponentProps) {
  return (
    <div role="alert">
      <p>${name} failed: {error.message}</p>
      <button type="button" onClick={reset}>
        Retry
      </button>
    </div>
  )
}`)
  }
  if (hasNotFound) {
    options.push(`  notFoundComponent: () => <p>Nothing in ${name}</p>,`)
  }
  options.push(`  component: ${name}Component,`)

  // --- start-only features --------------------------------------------------
  const inlineServerFn =
    start && probeKind === undefined && ctx.inlineFns < 25 && rng.chance(0.09)
  if (inlineServerFn) {
    ctx.inlineFns++
    startImports.add('createServerFn')
    startImports.add('useServerFn')
    helpers.unshift(`const bump${name} = createServerFn({ method: 'POST' })
  .validator((input: { amount: number }) => {
    if (!Number.isFinite(input.amount)) {
      throw new Error('amount must be finite')
    }
    return input
  })
  .handler(async ({ data }) => {
    return { amount: data.amount * 2, at: Date.now() }
  })`)
  }
  const usesIso = start && rng.chance(0.15)
  const isoN = rng.int(0, 4)
  if (usesIso) {
    extraImports.push(
      `import { runtimeLabel${isoN}, readViewport${isoN} } from '${imp(`src/lib/iso-${isoN}.ts`)}'`,
    )
  }
  const usesClientOnly = rng.chance(0.1)
  if (usesClientOnly) {
    routerImports.add('ClientOnly')
  }
  const usesHydrate =
    start &&
    (probeKind === 'hydrate' ||
      (probeKind === undefined && route.kind === 'leaf' && rng.chance(0.05)))
  if (usesHydrate) {
    startImports.add('Hydrate')
    extraImports.push(
      `import { visible } from '@tanstack/${fw}-start/hydration'`,
    )
  }
  if (probeKind === 'shared-component') {
    extraImports.push(
      `import { ProbeWidget } from '${imp('src/components/ProbeWidget.tsx')}'`,
    )
  }
  if (probeKind === 'server-fn') {
    reactImports.add(solid ? 'onMount' : 'useEffect')
    extraImports.push(
      `import { getProbe } from '${imp('src/server/probe.ts')}'`,
    )
  }
  if (route.kind === 'layout' || route.kind === 'pathless') {
    routerImports.add('Outlet')
  }

  // --- component -----------------------------------------------------------
  body.push(`function ${name}Component() {`)
  if (hasLoader) {
    body.push(`  const data = Route.useLoaderData()`)
  }
  if (hasSearch) {
    body.push(`  const search = Route.useSearch()`)
  }
  if (route.kind === 'param') {
    body.push(`  const params = Route.useParams()`)
  }
  body.push(
    solid
      ? `  const [count, setCount] = createSignal(0)`
      : `  const [count, setCount] = useState(0)`,
  )
  if (inlineServerFn) {
    body.push(`  const bump = useServerFn(bump${name})`)
  }
  if (probeKind === 'server-fn') {
    body.push(
      solid
        ? `  onMount(() => {
    ;(window as any).__perfProbeServerFn = () => getProbe()
  })`
        : `  useEffect(() => {
    ;(window as any).__perfProbeServerFn = () => getProbe()
  }, [])`,
    )
  }
  body.push(`  const rows = makeItems('${route.routePath}', ${rng.int(3, 9)})`)
  body.push(`  return (`)
  body.push(`    <div ${cls}="route" data-route="${route.routePath}">`)
  body.push(`      <h2>{formatLabel('${name}')}</h2>`)
  if (probeKind === 'route-component') {
    body.push(`      <p data-probe="route-component">probe-component-v0</p>`)
  }
  if (probeKind === 'route-loader') {
    body.push(`      <p data-probe="route-loader">{data${call}.probe}</p>`)
  }
  if (probeKind === 'shared-component') {
    body.push(`      <ProbeWidget />`)
  }
  if (probeKind === 'server-fn') {
    body.push(`      <p data-probe="server-fn-ready">ready</p>`)
  }
  if (hasLoader && probeKind !== 'route-loader') {
    body.push(`      <p>Loaded {data${call}.items.length} rows</p>`)
  }
  if (hasSearch) {
    body.push(`      <p>
        Page {search${call}.page} ({search${call}.sort})
      </p>`)
  }
  if (route.kind === 'param') {
    body.push(`      <p>Item {params${call}.itemId}</p>`)
  }
  body.push(`      <nav>
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
      </nav>`)
  if (solid) {
    reactImports.add('For')
    body.push(`      <table>
        <tbody>
          <For each={rows}>
            {(row) => (
              <tr>
                <td>{row.id}</td>
                <td>{row.value > 50 ? <em>{row.value}</em> : row.value}</td>
              </tr>
            )}
          </For>
        </tbody>
      </table>`)
  } else {
    body.push(`      <table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.value > 50 ? <em>{row.value}</em> : row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>`)
  }
  const widgetJsx = [...new Set(widgets)]
    .map(
      (w) =>
        `      <Widget${pad(w)} label="${rng.word()}-${w}" items={rows} compact={${rng.chance(0.5)}} />`,
    )
    .join('\n')
  if (usesHydrate) {
    body.push(`      <Hydrate when={visible()}>
        <div ${cls}="deferred">
${probeKind === 'hydrate' ? '          <p data-probe="hydrate">probe-hydrate-v0</p>\n' : ''}${widgetJsx.replace(/^ {6}/gm, '          ')}
        </div>
      </Hydrate>`)
  } else {
    body.push(widgetJsx)
  }
  if (usesClientOnly) {
    body.push(`      <ClientOnly fallback={<span>…</span>}>
        <span>{typeof window !== 'undefined' ? window.location.pathname : ''}</span>
      </ClientOnly>`)
  }
  if (deps) {
    body.push(
      `      <p>${icons.map((n) => `<Icon${pad4(n)} />`).join('')}<LibBadge label="${name}" /></p>`,
    )
  }
  if (usesIso) {
    body.push(`      <button type="button" onClick={() => setCount(readViewport${isoN}() + runtimeLabel${isoN}().length)}>
        Measure
      </button>`)
  }
  if (inlineServerFn) {
    body.push(`      <button type="button" onClick={async () => setCount((await bump({ data: { amount: count${call} + 1 } })).amount)}>
        Bump {count${call}}
      </button>`)
  } else {
    body.push(`      <button type="button" onClick={() => setCount((value) => value + 1)}>
        Clicked {count${call}}
      </button>`)
  }
  if (route.kind === 'layout' || route.kind === 'pathless') {
    body.push(`      <Outlet />`)
  }
  body.push(`    </div>`)
  body.push(`  )`)
  body.push(`}`)

  // --- assemble ------------------------------------------------------------
  lines.push(
    `import { ${[...reactImports].sort().join(', ')} } from '${solid ? 'solid-js' : 'react'}'`,
  )
  const typeOnly = [...routerImports].filter((n) => n === 'ErrorComponentProps')
  const valueRouter = [...routerImports]
    .filter((n) => n !== 'ErrorComponentProps')
    .sort()
  lines.push(
    `import { ${valueRouter.join(', ')} } from '@tanstack/${fw}-router'`,
  )
  if (typeOnly.length) {
    lines.push(
      `import type { ${typeOnly.join(', ')} } from '@tanstack/${fw}-router'`,
    )
  }
  if (startImports.size) {
    lines.push(
      `import { ${[...startImports].sort().join(', ')} } from '@tanstack/${fw}-start'`,
    )
  }
  lines.push(...extraImports)
  lines.push('')
  lines.push(`export const Route = createFileRoute('${route.routePath}')({`)
  lines.push(...options)
  lines.push(`})`)
  lines.push('')
  if (helpers.length) {
    lines.push(helpers.join('\n\n'))
    lines.push('')
  }
  lines.push(body.join('\n'))
  return lines.join('\n') + '\n'
}

function apiRouteSource(route, fw) {
  const name = path.posix.basename(route.file, '.ts')
  return `import { createFileRoute } from '@tanstack/${fw}-router'
import { db } from '../../server/db.server'

export const Route = createFileRoute('${route.routePath}')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const rows = await db.list('${name}', Number(url.searchParams.get('page') ?? 1))
        return Response.json({ route: '${name}', rows })
      },
      POST: async ({ request }) => {
        const body = await request.json()
        return Response.json({ route: '${name}', received: body })
      },
    },
  },
})
`
}

function navSource(fw) {
  const links = []
  for (let s = 0; s < SECTIONS; s++) {
    links.push(`        <Link to="/s${pad(s)}">Section ${s}</Link>`)
  }
  return `import { Link } from '@tanstack/${fw}-router'

export function Nav() {
  return (
    <nav ${fw === 'solid' ? 'class' : 'className'}="top-nav">
      <Link to="/">Home</Link>
      <Link to="/docs">Docs</Link>
${links.join('\n')}
    </nav>
  )
}
`
}

const hydratedMarker = `  useEffect(() => {
    ;(window as any).__PERF_HYDRATED__ = performance.timeOrigin + performance.now()
  }, [])`

const startRootSource = `import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { Nav } from '../components/Nav'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { title: 'Compiler perf app' }],
  }),
  component: RootComponent,
  notFoundComponent: () => <p>Not found</p>,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
${hydratedMarker}
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Nav />
        {children}
        <Scripts />
      </body>
    </html>
  )
}
`

const routerRootSource = `import { useEffect } from 'react'
import { Outlet, createRootRoute } from '@tanstack/react-router'
import { Nav } from '../components/Nav'

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => <p>Not found</p>,
})

function RootComponent() {
${hydratedMarker}
  return (
    <>
      <Nav />
      <Outlet />
    </>
  )
}
`

const startRouterSource = `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: false,
  })
}
`

const routerMainSource = `import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree, defaultPreload: false })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('app')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
`

const routerIndexHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Compiler perf router app</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`

// The configs import the harness plugin through a relative path so the app
// stays free of extra dependencies. The plugin is inert unless the harness
// sets COMPILER_PERF_HOOKS_OUT.
const startViteConfig = `import path from 'node:path'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { hookTimingPlugin } from '../../scripts/hook-timing.mjs'

export default defineConfig({
  cacheDir: path.resolve(import.meta.dirname, '.vite-cache'),
  logLevel: 'warn',
  clearScreen: false,
  build: { outDir: process.env.COMPILER_PERF_OUT_DIR ?? 'dist' },
  plugins: [tanstackStart(), viteReact(), hookTimingPlugin()],
})
`

// tanstack.com's vite.config: a Rollup-style `manualChunks` function grouping
// Start's client runtime, which Rolldown merges into the entry
const startDepsViteConfig = startViteConfig.replace(
  "  build: { outDir: process.env.COMPILER_PERF_OUT_DIR ?? 'dist' },",
  `  build: {
    outDir: process.env.COMPILER_PERF_OUT_DIR ?? 'dist',
    rollupOptions: {
      output: {
        manualChunks: (id: string) =>
          id.includes('/node_modules/@tanstack/react-start') ||
          id.includes('/node_modules/@tanstack/start-')
            ? 'tanstack-start'
            : undefined,
      },
    },
  },`,
)

/**
 * The generated dependency graph of `react-start-deps`, written under the
 * app's own node_modules: `@bench/icons` (a barrel of DEP_ICONS components,
 * side-effect free, like an icon package), `@bench/utils` (a chain of
 * DEP_UTILS modules each importing the next two) and `@bench/start-lib` (a
 * Start library: a server function, a `<ClientOnly>` wrapper, a 2 MB `?url`
 * asset, the utils chain).
 */
function dependencyFiles(rng) {
  const files = new Map()
  const pkg = (name, extra = {}) =>
    JSON.stringify(
      {
        name,
        version: '1.0.0',
        type: 'module',
        exports: { '.': './index.js' },
        ...extra,
      },
      null,
      2,
    ) + '\n'
  files.set(
    'node_modules/@bench/icons/package.json',
    pkg('@bench/icons', { sideEffects: false }),
  )
  const barrel = []
  for (let n = 0; n < DEP_ICONS; n++) {
    const id = pad4(n)
    barrel.push(`export { Icon${id} } from './icons/Icon${id}.js'`)
    files.set(
      `node_modules/@bench/icons/icons/Icon${id}.js`,
      `import { jsx } from 'react/jsx-runtime'
export function Icon${id}(props) {
  return jsx('svg', { 'data-icon': '${id}', viewBox: '0 0 ${rng.int(8, 64)} 16', ...props })
}
`,
    )
  }
  files.set('node_modules/@bench/icons/index.js', barrel.join('\n') + '\n')
  files.set('node_modules/@bench/utils/package.json', pkg('@bench/utils'))
  files.set(
    'node_modules/@bench/utils/index.js',
    `export { u0000 as util } from './u0000.js'\n`,
  )
  for (let n = 0; n < DEP_UTILS; n++) {
    const id = pad4(n)
    const next = [(n + 1) % DEP_UTILS, (n + 2) % DEP_UTILS].map(pad4)
    files.set(
      `node_modules/@bench/utils/u${id}.js`,
      `import { u${next[0]} } from './u${next[0]}.js'
import { u${next[1]} } from './u${next[1]}.js'
export function u${id}(depth) {
  return depth <= 0 ? ${rng.int(1, 999)} : u${next[0]}(depth - 1) + u${next[1]}(depth - 2)
}
`,
    )
  }
  files.set(
    'node_modules/@bench/start-lib/package.json',
    pkg('@bench/start-lib'),
  )
  // a binary asset a bundler serves by URL: never code, never read as text
  let blob = ''
  for (let i = 0; i < 2 * 1024 * 1024; i++) {
    blob += String.fromCharCode(rng.int(1, 255))
  }
  files.set('node_modules/@bench/start-lib/engine.wasm', blob)
  files.set(
    'node_modules/@bench/start-lib/index.js',
    `import { jsx } from 'react/jsx-runtime'
import { createServerFn } from '@tanstack/react-start'
import { ClientOnly } from '@tanstack/react-router'
import { util } from '@bench/utils'
import engineUrl from './engine.wasm?url'

export const libStats = createServerFn({ method: 'GET' }).handler(async () => {
  return { engine: engineUrl.length, depth: util(6) }
})

export function LibBadge({ label }) {
  return jsx(ClientOnly, {
    fallback: null,
    children: jsx('span', { 'data-lib': engineUrl, children: label + util(3) }),
  })
}
`,
  )
  return files
}

const routerViteConfig = `import path from 'node:path'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { hookTimingPlugin } from '../../scripts/hook-timing.mjs'

export default defineConfig({
  cacheDir: path.resolve(import.meta.dirname, '.vite-cache'),
  logLevel: 'warn',
  clearScreen: false,
  build: { outDir: process.env.COMPILER_PERF_OUT_DIR ?? 'dist' },
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    viteReact(),
    hookTimingPlugin(),
  ],
})
`

const startRsbuildConfig = `import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  logLevel: 'warn',
  plugins: [pluginReact(), tanstackStart()],
  output: {
    distPath: { root: process.env.COMPILER_PERF_OUT_DIR ?? 'dist-rsbuild' },
    cleanDistPath: true,
  },
  performance: { printFileSize: false },
})
`

const solidHydratedMarker = `  onMount(() => {
    ;(window as any).__PERF_HYDRATED__ = performance.timeOrigin + performance.now()
  })`

const solidStartRootSource = `import { onMount } from 'solid-js'
import type { JSX } from 'solid-js'
import { HydrationScript } from 'solid-js/web'
import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/solid-router'
import { Nav } from '../components/Nav'

export const Route = createRootRoute({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { title: 'Compiler perf app' }],
  }),
  component: RootComponent,
  notFoundComponent: () => <p>Not found</p>,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument(props: { children: JSX.Element }) {
${solidHydratedMarker}
  return (
    <html>
      <head>
        <HydrationScript />
        <HeadContent />
      </head>
      <body>
        <Nav />
        {props.children}
        <Scripts />
      </body>
    </html>
  )
}
`

const solidRouterRootSource = `import { onMount } from 'solid-js'
import { Outlet, createRootRoute } from '@tanstack/solid-router'
import { Nav } from '../components/Nav'

export const Route = createRootRoute({
  component: RootComponent,
  notFoundComponent: () => <p>Not found</p>,
})

function RootComponent() {
${solidHydratedMarker}
  return (
    <>
      <Nav />
      <Outlet />
    </>
  )
}
`

const solidRouterMainSource = `import { render } from 'solid-js/web'
import { RouterProvider, createRouter } from '@tanstack/solid-router'
import { routeTree } from './routeTree.gen'

const router = createRouter({ routeTree, defaultPreload: false })

declare module '@tanstack/solid-router' {
  interface Register {
    router: typeof router
  }
}

render(() => <RouterProvider router={router} />, document.getElementById('app')!)
`

const solidStartViteConfig = `import path from 'node:path'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { tanstackStart } from '@tanstack/solid-start/plugin/vite'
import { hookTimingPlugin } from '../../scripts/hook-timing.mjs'

export default defineConfig({
  cacheDir: path.resolve(import.meta.dirname, '.vite-cache'),
  logLevel: 'warn',
  clearScreen: false,
  build: { outDir: process.env.COMPILER_PERF_OUT_DIR ?? 'dist' },
  plugins: [tanstackStart(), solid({ ssr: true }), hookTimingPlugin()],
})
`

const solidRouterViteConfig = `import path from 'node:path'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { hookTimingPlugin } from '../../scripts/hook-timing.mjs'

export default defineConfig({
  cacheDir: path.resolve(import.meta.dirname, '.vite-cache'),
  logLevel: 'warn',
  clearScreen: false,
  build: { outDir: process.env.COMPILER_PERF_OUT_DIR ?? 'dist' },
  plugins: [
    tanstackRouter({ target: 'solid', autoCodeSplitting: true }),
    solid(),
    hookTimingPlugin(),
  ],
})
`

const solidTsconfig = `{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
`

const tsconfig = `{
  "compilerOptions": {
    "strict": true,
    "esModuleInterop": true,
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
`

// ---------------------------------------------------------------------------

export function generateFiles(variant) {
  if (!ALL_VARIANTS.includes(variant)) {
    throw new Error(`Unknown variant ${variant}`)
  }
  const start = isStart(variant)
  const fw = frameworkOf(variant)
  const solid = fw === 'solid'
  const rng = createRng(SEED)
  const files = new Map()
  const ctx = { inlineFns: 0 }

  files.set('tsconfig.json', solid ? solidTsconfig : tsconfig)
  if (hasDeps(variant)) {
    for (const [rel, content] of dependencyFiles(createRng(SEED + 1))) {
      files.set(rel, content)
    }
  }
  if (start) {
    files.set(
      'vite.config.ts',
      solid
        ? solidStartViteConfig
        : hasDeps(variant)
          ? startDepsViteConfig
          : startViteConfig,
    )
    // Rsbuild needs @rsbuild/plugin-babel + plugin-solid for Solid; not set up.
    if (!solid) {
      files.set('rsbuild.config.ts', startRsbuildConfig)
    }
    files.set(
      'src/router.tsx',
      startRouterSource.replace(
        '@tanstack/react-router',
        `@tanstack/${fw}-router`,
      ),
    )
    files.set(
      'src/routes/__root.tsx',
      solid ? solidStartRootSource : startRootSource,
    )
    files.set('src/server/db.server.ts', dbServerSource())
    files.set('src/server/secrets.server.ts', secretsServerSource)
    files.set('src/server/middleware.ts', middlewareSource(fw))
    files.set('src/server/probe.ts', probeServerFnSource(fw))
    for (let n = 0; n < SERVER_FN_FILES; n++) {
      files.set(`src/server/fns-${pad(n)}.ts`, serverFnFileSource(n, rng, fw))
    }
    for (let n = 0; n < 5; n++) {
      files.set(`src/lib/iso-${n}.ts`, isoSource(n, fw))
    }
  } else {
    files.set(
      'vite.config.ts',
      solid ? solidRouterViteConfig : routerViteConfig,
    )
    files.set('index.html', routerIndexHtml)
    files.set('src/main.tsx', solid ? solidRouterMainSource : routerMainSource)
    files.set(
      'src/routes/__root.tsx',
      solid ? solidRouterRootSource : routerRootSource,
    )
    files.set('src/data/api.ts', dataApiSource)
  }
  files.set('src/lib/format.ts', formatSource)
  files.set('src/components/Nav.tsx', navSource(fw))
  files.set('src/components/ProbeWidget.tsx', probeWidgetSource(fw))
  for (let n = 0; n < WIDGETS; n++) {
    files.set(`src/components/Widget${pad(n)}.tsx`, widgetSource(n, rng, fw))
  }
  for (const route of routeList(variant)) {
    files.set(route.file, routeSource(route, variant, rng, ctx))
  }
  return files
}

export function workloadHash(files) {
  const hash = crypto.createHash('sha256')
  for (const key of [...files.keys()].sort()) {
    hash.update(key + '\0' + files.get(key) + '\0')
  }
  return hash.digest('hex').slice(0, 16)
}

function findPackageDir(name, fromDir) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name, 'package.json')
    if (fs.existsSync(candidate)) {
      return fs.realpathSync(path.dirname(candidate))
    }
    if (path.dirname(dir) === dir) {
      return undefined
    }
  }
}

/**
 * Bundler packages the apps must share with the TanStack plugins. A workspace
 * can hold several peer-dependency variants of the same version (e.g. vite
 * built against different sass versions); a second instance breaks
 * `instanceof` checks such as Start's RunnableDevEnvironment detection, so the
 * apps use the instance the plugin package resolves, as a single npm install
 * would.
 */
export function resolveSharedPackages(variant) {
  const pluginPath = isStart(variant)
    ? [`@tanstack/${frameworkOf(variant)}-start`, '@tanstack/start-plugin-core']
    : ['@tanstack/router-plugin']
  let from = benchRoot
  for (const name of pluginPath) {
    from = findPackageDir(name, from) ?? from
  }
  const shared = {}
  for (const name of ['vite', '@rsbuild/core']) {
    shared[name] = findPackageDir(name, from) ?? findPackageDir(name, benchRoot)
  }
  return shared
}

export function appDir(variant) {
  return path.join(appsRoot, variant)
}

/**
 * (Re)writes the app sources. Removes stale generated sources, build output and
 * caches so every run starts from the same inputs; keeps `routeTree.gen.ts`
 * only if `keepRouteTree` is set.
 */
export function writeApp(variant, { keepRouteTree = false } = {}) {
  const files = generateFiles(variant)
  const dir = appDir(variant)
  const routeTreePath = path.join(dir, 'src/routeTree.gen.ts')
  const routeTree =
    keepRouteTree && fs.existsSync(routeTreePath)
      ? fs.readFileSync(routeTreePath, 'utf8')
      : undefined
  fs.rmSync(dir, { recursive: true, force: true })
  for (const [rel, content] of files) {
    const target = path.join(dir, rel)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, content)
  }
  if (routeTree !== undefined) {
    fs.writeFileSync(routeTreePath, routeTree)
  }
  const shared = resolveSharedPackages(variant)
  for (const [name, target] of Object.entries(shared)) {
    if (target) {
      const link = path.join(dir, 'node_modules', name)
      fs.mkdirSync(path.dirname(link), { recursive: true })
      fs.symlinkSync(target, link, 'dir')
    }
  }
  const routeCount = [...files.keys()].filter((f) =>
    f.startsWith('src/routes/'),
  ).length
  const serverFnCount = [...files.values()].reduce(
    (sum, src) => sum + (src.match(/createServerFn\(/g)?.length ?? 0),
    0,
  )
  return {
    dir,
    shared,
    hash: workloadHash(files),
    fileCount: files.size,
    routeCount,
    serverFnCount,
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const variants = process.argv.slice(2).length
    ? process.argv.slice(2)
    : VARIANTS
  for (const variant of variants) {
    const info = writeApp(variant)
    console.log(
      `${variant}: ${info.fileCount} files, ${info.routeCount} route files, ${info.serverFnCount} server fns, hash ${info.hash} -> ${path.relative(process.cwd(), info.dir)}`,
    )
  }
}
