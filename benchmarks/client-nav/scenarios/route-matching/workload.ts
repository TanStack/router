import type { ClientNavWorkload } from '#client-nav/benchmark'
import type { Framework, MountTestApp } from '#client-nav/lifecycle'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'
import {
  INITIAL_ROUTE_MARKER,
  createRouteMatchingLocations,
  type RouteMarker,
  type RouteMatchingLocation,
} from './shared'

function readRouteMarker(container: ParentNode) {
  const element = container.querySelector<HTMLElement>('[data-bench-route]')

  if (!element) {
    return undefined
  }

  return {
    kind: element.dataset.benchRoute,
    value: element.dataset.benchMarker,
  }
}

function formatRouteMarker(marker: RouteMarker) {
  return `${marker.kind}/${marker.value}`
}

export function createRouteMatchingWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp })
  const locations = createRouteMatchingLocations()
  let previousMarker: RouteMarker | undefined = undefined

  function assertRouteMarker(expected: RouteMarker) {
    const actual = readRouteMarker(lifecycle.getContainer())

    if (actual?.kind !== expected.kind || actual.value !== expected.value) {
      throw new Error(
        `Expected route marker ${formatRouteMarker(expected)}, got ${actual?.kind ?? 'missing'}/${actual?.value ?? 'missing'}`,
      )
    }
  }

  async function waitForRouteMarker(expected: RouteMarker) {
    await lifecycle.waitForCounter(
      () => {
        const actual = readRouteMarker(lifecycle.getContainer())
        return actual?.kind === expected.kind && actual.value === expected.value
          ? 1
          : 0
      },
      1,
      {
        label: `route marker ${formatRouteMarker(expected)}`,
      },
    )

    assertRouteMarker(expected)
  }

  async function navigateTo(location: RouteMatchingLocation) {
    await lifecycle.navigate(
      {
        to: location.to,
        params: location.params,
        replace: true,
      },
      {
        label: `navigate ${formatRouteMarker(location.expected)}`,
        wait: location.wait ?? 'rendered',
      },
    )

    await waitForRouteMarker(location.expected)

    if (
      previousMarker &&
      previousMarker.kind === location.expected.kind &&
      previousMarker.value === location.expected.value
    ) {
      throw new Error(
        `Route marker did not change from ${formatRouteMarker(location.expected)}`,
      )
    }

    if (
      location.hrefIncludes &&
      !lifecycle.getRouter().state.location.href.includes(location.hrefIncludes)
    ) {
      throw new Error(
        `Expected href to include ${location.hrefIncludes}, got ${lifecycle.getRouter().state.location.href}`,
      )
    }

    previousMarker = location.expected
  }

  async function before() {
    previousMarker = undefined
    await lifecycle.before()
    await waitForRouteMarker(INITIAL_ROUTE_MARKER)
    previousMarker = INITIAL_ROUTE_MARKER
  }

  async function run() {
    for (const location of locations) {
      await navigateTo(location)
    }
  }

  async function sanity() {
    await before()

    try {
      await run()
    } finally {
      await lifecycle.after()
    }
  }

  return {
    name: `client route matching loop (${framework})`,
    before,
    run,
    sanity,
    after: lifecycle.after,
  }
}
