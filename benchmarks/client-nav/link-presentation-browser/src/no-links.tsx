import { createRoot } from 'react-dom/client'
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useParams,
  useRouteContext,
} from '@tanstack/react-router'
import type { AnyRoute } from '@tanstack/react-router'

type Context = { trail: Array<string> }
const workload =
  new URLSearchParams(location.search).get('case') === 'departing'
    ? 'departing'
    : 'retained'
const depth = 8
const nestedPath = (id: string) =>
  Array.from({ length: depth }, (_, index) => `/level${index + 1}/${id}`).join(
    '',
  )
let sequence = 0

function nextLocation() {
  const pathname = router.state.location.pathname
  if (workload === 'departing') {
    return pathname === '/outside' ? nestedPath('0') : '/outside'
  }
  return nestedPath(pathname.endsWith('/0') ? '1' : '0')
}

const rootRoute = createRootRouteWithContext<Context>()({
  component: () => (
    <>
      <button
        id="next"
        type="button"
        onClick={() => {
          void router.navigate({ to: nextLocation(), replace: true })
        }}
      >
        Next
      </button>
      <Outlet />
    </>
  ),
})

function createLevel(parent: AnyRoute, level: number): AnyRoute {
  const param = `p${level}`
  const route = createRoute({
    getParentRoute: () => parent,
    path: `level${level}/$${param}`,
    beforeLoad: ({ context, params }) => ({
      trail: [...(context as Context).trail, params[param]],
    }),
    component: function Level() {
      const params = useParams({ strict: false }) as Record<string, string>
      const context = useRouteContext({ strict: false }) as Context
      return (
        <section
          data-level={level}
          data-param={params[param]}
          data-trail={context.trail.join('>')}
        >
          {level === depth ? (
            <div id="content">{params[param]}</div>
          ) : (
            <Outlet />
          )}
        </section>
      )
    },
  })
  return level === depth
    ? route
    : route.addChildren([createLevel(route, level + 1)])
}

const outsideRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'outside',
  component: () => <div id="content">outside</div>,
})
const router = createRouter({
  routeTree: rootRoute.addChildren([createLevel(rootRoute, 1), outsideRoute]),
  context: { trail: [] },
  history: createMemoryHistory({ initialEntries: [nestedPath('0')] }),
  defaultPreload: false,
  scrollRestoration: false,
})

const task = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
function rendered() {
  return new Promise<void>((resolve) => {
    const stop = router.subscribe('onRendered', () => {
      stop()
      resolve()
    })
  })
}

// Check inserted subtrees too, so a transient anchor cannot escape the control.
let anchorInserted = false
const app = document.getElementById('app')!
new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (
        node instanceof Element &&
        (node.matches('a') || node.querySelector('a'))
      ) {
        anchorInserted = true
      }
    }
  }
}).observe(app, { childList: true, subtree: true })

const ready = rendered()
createRoot(app).render(<RouterProvider router={router} />)

function inspect() {
  const levels = Array.from(
    document.querySelectorAll<HTMLElement>('[data-level]'),
  )
  const anchors = document.querySelectorAll('a').length
  if (anchors || anchorInserted) {
    throw new Error('The zero-Link control mounted an anchor')
  }
  return {
    workload,
    location: router.state.location.href,
    content: document.getElementById('content')?.textContent ?? null,
    levels: levels.length,
    anchors,
    hookConsumers: levels.length * 2,
    params: levels.map((level) => level.dataset.param),
    trails: levels.map((level) => level.dataset.trail),
  }
}

function assertDOM(expectedLocation: string) {
  const state = inspect()
  const outside = expectedLocation === '/outside'
  const id = expectedLocation.endsWith('/0') ? '0' : '1'
  const expectedLevels = outside ? 0 : depth
  if (
    state.location !== expectedLocation ||
    state.content !== (outside ? 'outside' : id) ||
    state.levels !== expectedLevels ||
    state.params.some((value) => value !== id) ||
    state.trails.some(
      (value, index) =>
        value !== Array.from({ length: index + 1 }, () => id).join('>'),
    )
  ) {
    throw new Error(`Incorrect zero-Link route: ${JSON.stringify(state)}`)
  }
}

async function preflight() {
  await ready
  await task()
  await nextPaint()
  assertDOM(nestedPath('0'))
  let previous = Array.from(document.querySelectorAll('[data-level]'))
  for (let step = 0; step < 4; step++) {
    const expected = nextLocation()
    const completed = rendered()
    document
      .getElementById('next')!
      .dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      )
    await completed
    assertDOM(expected)
    await task()
    await nextPaint()
    assertDOM(expected)
    const current = Array.from(document.querySelectorAll('[data-level]'))
    if (workload === 'retained') {
      if (current.some((level, index) => level !== previous[index])) {
        throw new Error('Retained match levels were remounted')
      }
    } else if (previous.some((level) => level.isConnected)) {
      throw new Error('Departing match levels stayed mounted')
    }
    previous = current
  }
}

async function sample() {
  await ready
  await task()
  const expected = nextLocation()
  const sampleId = ++sequence
  const start = performance.now()
  performance.mark(`link-click-start-${sampleId}`)
  const timerOpportunity = new Promise<number>((resolve) => {
    setTimeout(() => resolve(performance.now() - start), 0)
  })
  const painted = nextPaint().then(() => performance.now() - start)
  const completed = new Promise<number>((resolve) => {
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
  const renderMs = await completed
  const atRender = inspect()
  const timerOpportunityMs = await timerOpportunity
  const frameOpportunityMs = await painted
  await task()
  await nextPaint()
  assertDOM(expected)
  return {
    sampleId,
    dispatchMs,
    timerOpportunityMs,
    frameOpportunityMs,
    renderMs,
    atRender,
    settled: inspect(),
  }
}

Object.assign(window, {
  linkPresentationNoLinks: { sample, inspect, ready, preflight },
})
