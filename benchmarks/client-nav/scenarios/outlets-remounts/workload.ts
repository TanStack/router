import type { ClientNavWorkload } from '#client-nav/benchmark'
import type { Framework, MountTestApp } from '#client-nav/lifecycle'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'
import {
  createOutletsRemountsLocations,
  outletsRemountsInitialLocation,
  type OutletsRemountsComponentCounters,
  type OutletsRemountsLifecycleCounters,
  type OutletsRemountsLocation,
} from './shared'

export interface OutletsRemountsAppControls {
  mountTestApp: MountTestApp
  resetOutletsRemountsCounters: () => void
  getOutletsRemountsComponentCounters: () => OutletsRemountsComponentCounters
  getOutletsRemountsLifecycleCounters: () => OutletsRemountsLifecycleCounters
}

function readActiveMarker(container: ParentNode) {
  const card = container.querySelector<HTMLElement>(
    '[data-outlets-card-marker]',
  )

  if (card) {
    return {
      kind: 'card',
      marker: card.dataset.outletsCardMarker,
    }
  }

  const org = container.querySelector<HTMLElement>('[data-outlets-org-marker]')

  if (org) {
    return {
      kind: 'org',
      marker: org.dataset.outletsOrgMarker,
    }
  }

  return undefined
}

function assertCountersEqual(
  routeId: string,
  hook: string,
  actual: number,
  expected: number,
) {
  if (actual !== expected) {
    throw new Error(
      `Expected ${routeId}.${hook} to equal ${expected}, got ${actual}`,
    )
  }
}

function assertLifecycleSanity(counters: OutletsRemountsLifecycleCounters) {
  for (const routeId of ['workspace', 'org'] as const) {
    assertCountersEqual(routeId, 'enter', counters[routeId].enter, 0)
    assertCountersEqual(routeId, 'stay', counters[routeId].stay, 6)
    assertCountersEqual(routeId, 'leave', counters[routeId].leave, 0)
  }

  for (const routeId of ['projects', 'project', 'board', 'card'] as const) {
    assertCountersEqual(routeId, 'enter', counters[routeId].enter, 1)
    assertCountersEqual(routeId, 'stay', counters[routeId].stay, 4)
    assertCountersEqual(routeId, 'leave', counters[routeId].leave, 1)
  }
}

function assertRemountSanity(counters: OutletsRemountsComponentCounters) {
  assertCountersEqual('project', 'mounts', counters.project.mounts, 3)
  assertCountersEqual('board', 'mounts', counters.board.mounts, 4)

  if (counters.project.renders < counters.project.mounts) {
    throw new Error(
      `Expected project renders to be at least project mounts, got ${counters.project.renders}/${counters.project.mounts}`,
    )
  }

  if (counters.board.renders < counters.board.mounts) {
    throw new Error(
      `Expected board renders to be at least board mounts, got ${counters.board.renders}/${counters.board.mounts}`,
    )
  }
}

export function createOutletsRemountsWorkload(
  framework: Framework,
  app: OutletsRemountsAppControls,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp: app.mountTestApp })
  const locations = createOutletsRemountsLocations()

  async function waitForMarker(location: OutletsRemountsLocation) {
    await lifecycle.waitForCounter(
      () => {
        const actual = readActiveMarker(lifecycle.getContainer())
        return actual?.kind === location.target.kind &&
          actual.marker === location.marker
          ? 1
          : 0
      },
      1,
      {
        label: `outlets marker ${location.marker}`,
      },
    )
  }

  async function navigateTo(location: OutletsRemountsLocation) {
    await lifecycle.navigate(
      {
        to: location.to,
        params: location.params,
        replace: true,
      },
      {
        label: `navigate ${location.marker}`,
        wait: 'rendered',
      },
    )

    await waitForMarker(location)
  }

  async function before() {
    await lifecycle.before()
    await waitForMarker(outletsRemountsInitialLocation)
    app.resetOutletsRemountsCounters()
  }

  async function run() {
    for (const location of locations) {
      await navigateTo(location)
    }
  }

  async function sanity() {
    await before()

    try {
      for (const location of locations.slice(0, 6)) {
        await navigateTo(location)
      }

      assertLifecycleSanity(app.getOutletsRemountsLifecycleCounters())
      assertRemountSanity(app.getOutletsRemountsComponentCounters())
    } finally {
      await lifecycle.after()
    }
  }

  return {
    name: `client outlets remounts loop (${framework})`,
    before,
    run,
    sanity,
    after: lifecycle.after,
  }
}
