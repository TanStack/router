import { memo } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useLocation,
} from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

type Workload =
  | 'departing'
  | 'retained-fixed'
  | 'retained-updaters'
  | 'fixed-path-updaters'
  | 'sparse-active-fixed'
type RetainedTopology =
  | 'nonroot-retained-fixed'
  | 'nonroot-retained-updaters'
  | 'deep-retained-fixed'
  | 'deep-retained-updaters'
const caseName = (new URLSearchParams(location.search).get('case') ??
  'departing') as Workload | RetainedTopology
type PreloadLayout = 'disabled' | 'intent' | 'mixed'
const preloadLayout = (new URLSearchParams(location.search).get('preload') ??
  'disabled') as PreloadLayout
if (!['disabled', 'intent', 'mixed'].includes(preloadLayout)) {
  throw new Error(`Unknown row preload layout: ${preloadLayout}`)
}
const queuedParam = new URLSearchParams(location.search).get('queuedIntents')
const queuedIntents = queuedParam === null ? null : Number(queuedParam)
const queuedDelay = Number(
  new URLSearchParams(location.search).get('preloadDelay') ?? 60000,
)
if (
  queuedIntents !== null &&
  (![0, 100, 1000].includes(queuedIntents) || workloadForQueue())
) {
  throw new Error(
    'Queued intent control requires departing intent rows and 0/100/1000 intents',
  )
}
function workloadForQueue() {
  return caseName !== 'departing' || preloadLayout !== 'intent'
}
let observedPreloads = 0
const queuedRowProps =
  queuedIntents === null ? undefined : { preloadDelay: queuedDelay }
const intentRowProps = { preload: 'intent' as const }
const disabledRowProps = { preload: false as const }
const retainedDepth = caseName.startsWith('deep-')
  ? 8
  : caseName.startsWith('nonroot-')
    ? 1
    : 0
const workload = caseName.replace(/^(nonroot|deep)-/, '') as Workload
let updaterCalls = 0
let countUpdaterCalls = true
let sequence = 0

const Rows = memo(function Rows({
  offset = 0,
  count = 1000,
}: {
  offset?: number
  count?: number
}) {
  return (
    <div id={offset === 0 ? 'rows' : undefined}>
      {Array.from({ length: count }, (_, row) => {
        const index = offset + row
        // The default keeps the original props; enabled layouts only add preload.
        const preloadProps =
          preloadLayout === 'disabled'
            ? undefined
            : preloadLayout === 'intent' || index % 2 === 0
              ? intentRowProps
              : disabledRowProps
        return workload === 'retained-updaters' ||
          workload === 'fixed-path-updaters' ? (
          <Link
            key={index}
            data-row={index}
            from="/items/$id"
            to={workload === 'retained-updaters' ? '.' : '/items/$id'}
            params={
              workload === 'retained-updaters'
                ? true
                : { id: String(index % 2) }
            }
            search={(previous) => ({ page: Number(previous.page ?? 0) + 1 })}
            hash={(previous) => `${previous}-link`}
            state={(previous) => {
              if (countUpdaterCalls) {
                updaterCalls++
              }
              return { ...previous, tick: Number(previous.tick ?? 0) + 1 }
            }}
            activeOptions={{ includeSearch: false }}
            {...preloadProps}
            {...queuedRowProps}
          >
            Link {index}
          </Link>
        ) : (
          <Link
            key={index}
            data-row={index}
            to="/items/$id"
            params={{
              id: String(
                workload === 'sparse-active-fixed' ? index : index % 2,
              ),
            }}
            activeOptions={{ includeSearch: false }}
            {...preloadProps}
            {...queuedRowProps}
          >
            Link {index}
          </Link>
        )
      })}
    </div>
  )
})

function Controls() {
  const current = useLocation()
  if (workload === 'departing') {
    return (
      <Link
        id="next"
        to={current.pathname === '/source' ? '/items/$id' : '/source'}
        params={{ id: '1' }}
      >
        Next
      </Link>
    )
  }
  const id = current.pathname.endsWith('/0') ? '1' : '0'
  return (
    <Link
      id="next"
      to="/items/$id"
      params={{ id }}
      search={{ page: Number(id) }}
      hash={`nav-${id}`}
      state={{ tick: Number(id) }}
    >
      Next
    </Link>
  )
}

const rootRoute = createRootRoute({
  validateSearch: (search: Record<string, unknown>) => ({
    page: Number(search.page ?? 0),
  }),
  component: () => (
    <>
      <Controls />
      {workload !== 'departing' && retainedDepth === 0 && <Rows />}
      <Outlet />
    </>
  ),
})
const itemsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'items/$id',
  ...(queuedIntents === null
    ? {}
    : {
        beforeLoad: ({ preload }: { preload: boolean }) => {
          if (preload) {
            observedPreloads++
          }
        },
      }),
  component: () => {
    const { id } = itemsRoute.useParams()
    if (retainedDepth) {
      return (
        <section data-retained-level="0">
          <div id="content">{id}</div>
          <Rows count={1000 / retainedDepth} />
          {retainedDepth > 1 && <Outlet />}
        </section>
      )
    }
    return <div id="content">{id}</div>
  },
})
const sourceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'source',
  component: () => (
    <div id="content">
      source
      <Rows />
    </div>
  ),
})
function retainedChild(parent: AnyRoute, level: number): AnyRoute {
  const route = createRoute({
    getParentRoute: () => parent,
    ...(level === 7 ? { path: '/' } : { id: `retained-${level}` }),
    component: () => (
      <section data-retained-level={level}>
        <Rows offset={level * 125} count={125} />
        {level < 7 && <Outlet />}
      </section>
    ),
  })
  if (level < 7) {
    return route.addChildren([retainedChild(route, level + 1)])
  }
  return route
}
const router = createRouter({
  routeTree: rootRoute.addChildren([
    retainedDepth === 8
      ? itemsRoute.addChildren([retainedChild(itemsRoute, 1)])
      : itemsRoute,
    sourceRoute,
  ]),
  history: createMemoryHistory({
    initialEntries: [
      workload === 'departing' ? '/source' : '/items/0?page=0#nav-0',
    ],
  }),
  defaultPreload: false,
  scrollRestoration: false,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
declare module '@tanstack/history' {
  interface HistoryState {
    tick?: number
  }
}

const task = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const ready = new Promise<void>((resolve) => {
  const stop = router.subscribe('onRendered', () => {
    stop()
    resolve()
  })
})
createRoot(document.getElementById('app')!).render(
  <RouterProvider router={router} />,
)

function inspect() {
  const link = document.querySelector<HTMLAnchorElement>('[data-row="0"]')
  return {
    location: router.state.location.href,
    rowHref: link?.getAttribute('href') ?? null,
    rowActive: link?.getAttribute('data-status') ?? null,
    rows: document.querySelectorAll('[data-row]').length,
    updaterCalls,
  }
}

// Validate the complete workload outside the timed samples. Two round trips
// exercise both directions and require retained anchors to keep their identity.
async function preflight() {
  await ready
  await task()
  await nextPaint()
  let anchors = Array.from(document.querySelectorAll('[data-row]'))
  if (
    document.querySelectorAll('[data-retained-level]').length !== retainedDepth
  ) {
    throw new Error(`Expected ${retainedDepth} retained nonroot route levels`)
  }
  const hasUpdaters =
    workload === 'retained-updaters' || workload === 'fixed-path-updaters'
  const updaterCounts = []

  function assertDOM(pathname: string, id: string) {
    const rows = Array.from(
      document.querySelectorAll<HTMLAnchorElement>('[data-row]'),
    )
    const expectedCount =
      workload === 'departing' && pathname !== '/source' ? 0 : 1000
    if (rows.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} rows, received ${rows.length}`)
    }
    const content = document.getElementById('content')
    const expectedContent = pathname === '/source' ? 'source' : id
    if (content?.firstChild?.textContent !== expectedContent) {
      throw new Error(`Incorrect route content for ${pathname}`)
    }
    let activeCount = 0
    for (const [index, row] of rows.entries()) {
      const targetId =
        workload === 'retained-updaters'
          ? id
          : String(workload === 'sparse-active-fixed' ? index : index % 2)
      const expectedHref = hasUpdaters
        ? `/items/${targetId}?page=${Number(id) + 1}#nav-${id}-link`
        : `/items/${targetId}`
      const active = pathname !== '/source' && targetId === id
      if (
        row.dataset.row !== String(index) ||
        row.textContent !== `Link ${index}` ||
        row.getAttribute('href') !== expectedHref ||
        (row.getAttribute('data-status') === 'active') !== active
      ) {
        throw new Error(`Incorrect Link ${index} for ${pathname}`)
      }
      if (active) {
        activeCount++
      }
      if (workload !== 'departing' && row !== anchors[index]) {
        throw new Error(`Retained Link ${index} was remounted`)
      }
    }
    const expectedActive =
      expectedCount === 0 || pathname === '/source'
        ? 0
        : workload === 'retained-updaters'
          ? 1000
          : workload === 'sparse-active-fixed'
            ? 1
            : 500
    if (activeCount !== expectedActive) {
      throw new Error(
        `Expected ${expectedActive} active Links, received ${activeCount}`,
      )
    }
  }

  assertDOM(workload === 'departing' ? '/source' : '/items/0', '0')
  for (let step = 0; step < 4; step++) {
    const id = step % 2 === 0 ? '1' : '0'
    const pathname =
      workload === 'departing'
        ? step % 2 === 0
          ? '/items/1'
          : '/source'
        : `/items/${id}`
    const expectedLocation =
      workload === 'departing'
        ? `${pathname}?page=0`
        : `${pathname}?page=${id}#nav-${id}`
    const beforeCalls = updaterCalls
    const rendered = new Promise<void>((resolve) => {
      const stop = router.subscribe('onRendered', () => {
        stop()
        resolve()
      })
    })
    document
      .getElementById('next')!
      .dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      )
    await rendered
    if (router.state.location.href !== expectedLocation) {
      throw new Error(
        `Expected ${expectedLocation}, received ${router.state.location.href}`,
      )
    }
    assertDOM(pathname, id)
    const callsAtRender = updaterCalls
    await task()
    await nextPaint()
    assertDOM(pathname, id)
    updaterCounts.push({
      atRender: callsAtRender - beforeCalls,
      settled: updaterCalls - beforeCalls,
    })
    if (workload === 'departing') {
      if (anchors.some((anchor) => anchor.isConnected)) {
        throw new Error('Departing Links stayed mounted')
      }
      anchors = Array.from(document.querySelectorAll('[data-row]'))
    }
  }
  return { retainedDepth, updaterCounts }
}

function queuePendingIntents() {
  if (queuedIntents === null || router.state.location.pathname !== '/source') {
    return 0
  }
  const rows = Array.from(document.querySelectorAll('[data-row]'))
  for (const row of rows.slice(0, queuedIntents)) {
    row.dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }),
    )
  }
  if (observedPreloads) {
    throw new Error('A queued preload fired before the timed departure')
  }
  return queuedIntents
}

async function queuedIntentGate() {
  if (queuedIntents === null || queuedDelay > 100) {
    throw new Error('Gate requires queued fixture with short delay')
  }
  await preflight()
  queuePendingIntents()
  await sample()
  await new Promise<void>((resolve) => setTimeout(resolve, queuedDelay + 30))
  if (observedPreloads) {
    throw new Error('A retired intent timer preloaded after departure')
  }
  await sample()
  document
    .querySelector('[data-row="0"]')!
    .dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true, relatedTarget: null }),
    )
  await new Promise<void>((resolve) => setTimeout(resolve, queuedDelay + 30))
  if (observedPreloads !== 1) {
    throw new Error('A fresh remounted Link did not preload once')
  }
  return {
    queuedIntents,
    observedPreloads,
    cancellation: 'pass',
    remountPreload: 'pass',
  }
}

async function sample() {
  await ready
  await task()
  countUpdaterCalls = false
  const start = performance.now()
  const sampleId = ++sequence
  performance.mark(`link-click-start-${sampleId}`)
  const timerOpportunity = new Promise<number>((resolve) => {
    setTimeout(() => resolve(performance.now() - start), 0)
  })
  const painted = nextPaint().then(() => performance.now() - start)
  const rendered = new Promise<number>((resolve) => {
    const stop = router.subscribe('onRendered', () => {
      stop()
      resolve(performance.now() - start)
    })
  })
  document
    .getElementById('next')!
    .dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    )
  const dispatchMs = performance.now() - start
  const renderMs = await rendered
  const atRender = inspect()
  const timerOpportunityMs = await timerOpportunity
  const frameOpportunityMs = await painted
  await task()
  await nextPaint()
  const settled = inspect()
  const id = router.state.location.pathname.endsWith('/0') ? '0' : '1'
  const expectedHref =
    workload === 'retained-updaters' || workload === 'fixed-path-updaters'
      ? `/items/${workload === 'retained-updaters' ? id : '0'}?page=${Number(id) + 1}#nav-${id}-link`
      : '/items/0'
  if (
    (workload !== 'departing' ||
      router.state.location.pathname === '/source') &&
    settled.rowHref !== expectedHref
  ) {
    throw new Error(
      `Stale Link href: ${JSON.stringify({ expectedHref, settled })}`,
    )
  }
  if (
    (workload === 'retained-fixed' || workload === 'sparse-active-fixed') &&
    settled.rowActive !== (id === '0' ? 'active' : null)
  ) {
    throw new Error(`Incorrect Link active state: ${JSON.stringify(settled)}`)
  }
  countUpdaterCalls = true
  return {
    sampleId,
    dispatchMs,
    timerOpportunityMs,
    frameOpportunityMs,
    renderMs,
    atRender,
    settled,
  }
}

Object.assign(window, {
  linkPresentationBenchmark: {
    sample,
    inspect,
    ready,
    preflight,
    queuePendingIntents,
    queuedIntentGate,
  },
})
