import { useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Link,
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router'

const query = new URLSearchParams(location.search)
const workload = query.get('case') ?? 'active-options'
const diagnostic = query.get('diagnostic') === 'true'
const preload = query.get('preload') === 'intent' ? 'intent' : false
if (!['active-options', 'disabled-equivalent'].includes(workload)) {
  throw new Error(`Unknown presentation workload: ${workload}`)
}
const exactSearch = { exact: true, includeSearch: true }
const exactPath = { exact: true, includeSearch: false }
const params = [{ id: '0' }, { id: '1' }]
const emptySearch = {}
const rows = Array.from({ length: 1000 }, (_, index) => index)
const outputCounts: Record<string, number> = {}
let currentToggle = false
let sequence = 0
let committed: undefined | (() => void)

function Root() {
  const [toggle, setToggle] = useState(false)
  useLayoutEffect(() => {
    currentToggle = toggle
    committed?.()
  }, [toggle])
  return (
    <>
      <button id="next" onClick={() => setToggle((previous) => !previous)}>
        Toggle presentation
      </button>
      <div id="rows">
        {rows.map((index) => (
          <Link
            key={index}
            data-row={index}
            to="/items/$id"
            params={params[index % 2]}
            search={emptySearch}
            activeOptions={
              workload === 'active-options' && !toggle ? exactSearch : exactPath
            }
            {...(workload === 'disabled-equivalent' && !toggle
              ? { disabled: false }
              : {})}
            preload={preload}
          >
            Link {index}
          </Link>
        ))}
      </div>
      <Outlet />
    </>
  )
}
const rootRoute = createRootRoute({ component: Root })
const itemRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/items/$id',
  component: () => <div id="content">source</div>,
})
const router = createRouter({
  routeTree: rootRoute.addChildren([itemRoute]),
  history: createMemoryHistory({ initialEntries: ['/items/0?page=1'] }),
  defaultPreload: false,
  scrollRestoration: false,
  ...(diagnostic
    ? {
        rewrite: {
          output: ({ url }: { url: URL }) => {
            outputCounts[url.pathname] = (outputCounts[url.pathname] ?? 0) + 1
            return url
          },
        },
      }
    : {}),
})
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
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('[data-row]'),
  )
  return {
    toggle: currentToggle,
    location: router.state.location.href,
    rows: anchors.length,
    activeCount: anchors.filter((row) => row.dataset.status === 'active')
      .length,
    firstHref: anchors[0]?.getAttribute('href'),
  }
}
function assertDOM(anchors: Array<HTMLAnchorElement>) {
  const current = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('[data-row]'),
  )
  if (
    current.length !== 1000 ||
    router.state.location.href !== '/items/0?page=1'
  ) {
    throw new Error(`Invalid retained fixture: ${JSON.stringify(inspect())}`)
  }
  const expectActive = workload === 'disabled-equivalent' || currentToggle
  for (const [index, row] of current.entries()) {
    if (
      row !== anchors[index] ||
      row.dataset.row !== String(index) ||
      row.textContent !== `Link ${index}` ||
      row.getAttribute('href') !== `/items/${index % 2}` ||
      (row.dataset.status === 'active') !== (expectActive && index % 2 === 0) ||
      row.getAttribute('aria-disabled') !== null
    ) {
      throw new Error(`Incorrect presentation Link ${index}`)
    }
  }
}
async function sample() {
  await ready
  await task()
  if (diagnostic) {
    throw new Error('Diagnostic rewrite counters must not enter timed samples')
  }
  const sampleId = ++sequence
  const start = performance.now()
  performance.mark(`link-click-start-${sampleId}`)
  const timerOpportunity = new Promise<number>((resolve) => {
    setTimeout(() => resolve(performance.now() - start), 0)
  })
  const painted = nextPaint().then(() => performance.now() - start)
  const rendered = new Promise<number>((resolve) => {
    committed = () => resolve(performance.now() - start)
  })
  document
    .getElementById('next')!
    .dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
    )
  const dispatchMs = performance.now() - start
  const renderMs = await rendered
  committed = undefined
  const timerOpportunityMs = await timerOpportunity
  const frameOpportunityMs = await painted
  await task()
  await nextPaint()
  // All DOM diagnostic work is after the task boundary in this fixture.
  const settled = inspect()
  return {
    sampleId,
    dispatchMs,
    renderMs,
    timerOpportunityMs,
    frameOpportunityMs,
    settled,
  }
}
async function preflight() {
  await ready
  await task()
  await nextPaint()
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('[data-row]'),
  )
  assertDOM(anchors)
  const diagnostics = []
  for (let index = 0; index < 4; index++) {
    const before = { ...outputCounts }
    const rendered = new Promise<void>((resolve) => {
      committed = resolve
    })
    document
      .getElementById('next')!
      .dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      )
    await rendered
    committed = undefined
    assertDOM(anchors)
    await task()
    await nextPaint()
    assertDOM(anchors)
    diagnostics.push({
      toggle: currentToggle,
      outputCalls: Object.fromEntries(
        Object.entries(outputCounts).map(([path, count]) => [
          path,
          count - (before[path] ?? 0),
        ]),
      ),
    })
  }
  return { workload, preload, diagnostic, diagnostics, ...inspect() }
}
Object.assign(window, {
  linkPresentationProps: { ready, sample, preflight, inspect },
})
