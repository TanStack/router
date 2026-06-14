import type { AnyRouter } from '@tanstack/router-core'
import type {
  DehydratedMatch,
  DehydratedRouter,
  TsrSsrGlobal,
} from '@tanstack/router-core/ssr/client'

declare global {
  interface Window {
    $_TSR?: TsrSsrGlobal
    $R?: Record<string, unknown>
  }
}

export type HydrationResumeFramework = 'react' | 'solid' | 'vue'

export type DashboardTab = 'summary' | 'metrics'

export interface DashboardSearch {
  tab: DashboardTab
  cursor: string
}

export type HydrationResumeFixture =
  | {
      kind: 'dashboard'
      fixtureId: string
      href: string
      teamId: string
      search: DashboardSearch
      updatedAt: number
      seed: number
    }
  | {
      kind: 'deferred'
      fixtureId: string
      href: string
      itemId: string
      updatedAt: number
      seed: number
    }

export interface HydrationResumeLoaderData {
  route: 'hydrate' | 'dashboard' | 'team' | 'live'
  source: 'ssr' | 'client'
  fixtureId: string
  sequence: number
  checksum: number
}

export interface HydrationResumeDeferredPayload {
  itemId: string
  value: string
  checksum: number
}

export interface HydrationResumeDeferredLoaderData {
  route: 'deferred'
  source: 'ssr' | 'client'
  fixtureId: string
  itemId: string
  sequence: number
  checksum: number
  deferred: Promise<HydrationResumeDeferredPayload>
}

export interface HydrationResumeRouteIds {
  hydrate: string
  dashboard: string
  team: string
  deferred: string
  live: string
}

export interface HydrationResumeCounters {
  hydrate: number
  dashboard: number
  team: number
  live: number
  deferred: number
  dashboardBeforeLoad: number
  teamBeforeLoad: number
  customHydrate: number
  hydrationComplete: number
  deferredResolved: number
  cleanup: number
}

export interface MountedHydrationResumeApp {
  router: AnyRouter
  cleanup: () => void
  unmount: () => void
}

export interface HydrationResumeAppModule {
  hydrationResumeRuntime: HydrationResumeRuntime
  mountHydratedTestApp: (
    container: Element,
    fixture: HydrationResumeFixture,
  ) => Promise<MountedHydrationResumeApp>
}

type ControlledDeferred = {
  resolve: (payload: HydrationResumeDeferredPayload) => void
  resolved: boolean
  promise: Promise<HydrationResumeDeferredPayload>
}

const FIXTURE_COUNT = 8
const FIXED_UPDATED_AT = 1_700_000_000_000

function createEmptyCounters(): HydrationResumeCounters {
  return {
    hydrate: 0,
    dashboard: 0,
    team: 0,
    live: 0,
    deferred: 0,
    dashboardBeforeLoad: 0,
    teamBeforeLoad: 0,
    customHydrate: 0,
    hydrationComplete: 0,
    deferredResolved: 0,
    cleanup: 0,
  }
}

function dehydrateMatchId(id: string) {
  return id.replaceAll('/', '\0')
}

function checksumText(value: string, seed: number) {
  let checksum = seed >>> 0

  for (let index = 0; index < value.length; index++) {
    checksum = (checksum * 33 + value.charCodeAt(index) + index) >>> 0
  }

  return checksum
}

function createDashboardHref(teamId: string, search: DashboardSearch) {
  return `/hydrate/dashboard/${teamId}?tab=${search.tab}&cursor=${search.cursor}`
}

function createDeferredHref(itemId: string) {
  return `/hydrate/deferred/${itemId}`
}

function getFixtureSlot(index: number) {
  return index % FIXTURE_COUNT
}

export function createDashboardHydrationFixture(
  index: number,
): Extract<HydrationResumeFixture, { kind: 'dashboard' }> {
  const slot = getFixtureSlot(index)
  const tab: DashboardTab = slot % 2 === 0 ? 'summary' : 'metrics'
  const teamId = `team-${slot}`
  const search = {
    tab,
    cursor: `cursor-${slot}`,
  } satisfies DashboardSearch

  return {
    kind: 'dashboard',
    fixtureId: `dashboard-${slot}`,
    href: createDashboardHref(teamId, search),
    teamId,
    search,
    updatedAt: FIXED_UPDATED_AT + slot * 100,
    seed: 101 + slot * 17,
  }
}

export function createDeferredHydrationFixture(
  index: number,
): Extract<HydrationResumeFixture, { kind: 'deferred' }> {
  const slot = getFixtureSlot(index)
  const itemId = `deferred-${slot}`

  return {
    kind: 'deferred',
    fixtureId: `deferred-${slot}`,
    href: createDeferredHref(itemId),
    itemId,
    updatedAt: FIXED_UPDATED_AT + 1_000 + slot * 100,
    seed: 211 + slot * 19,
  }
}

export function createLiveNavigationTarget(index: number) {
  const slot = getFixtureSlot(index)

  return {
    itemId: `live-${slot}`,
  }
}

export function normalizeDashboardSearch(
  search: Record<string, unknown>,
): DashboardSearch {
  return {
    tab: search.tab === 'metrics' ? 'metrics' : 'summary',
    cursor:
      typeof search.cursor === 'string' && search.cursor.length > 0
        ? search.cursor
        : 'cursor-0',
  }
}

export function runHydrationResumeComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 48; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

export function buildHydrateLoaderData(
  fixture: HydrationResumeFixture,
  source: 'ssr' | 'client',
  sequence: number,
): HydrationResumeLoaderData {
  return {
    route: 'hydrate',
    source,
    fixtureId: fixture.fixtureId,
    sequence,
    checksum: checksumText(`${fixture.fixtureId}:hydrate`, fixture.seed),
  }
}

export function buildDashboardLoaderData(
  fixture: Extract<HydrationResumeFixture, { kind: 'dashboard' }>,
  source: 'ssr' | 'client',
  sequence: number,
): HydrationResumeLoaderData {
  return {
    route: 'dashboard',
    source,
    fixtureId: fixture.fixtureId,
    sequence,
    checksum: checksumText(`${fixture.teamId}:dashboard`, fixture.seed + 1),
  }
}

export function buildTeamLoaderData(
  fixture: Extract<HydrationResumeFixture, { kind: 'dashboard' }>,
  source: 'ssr' | 'client',
  sequence: number,
): HydrationResumeLoaderData {
  return {
    route: 'team',
    source,
    fixtureId: fixture.fixtureId,
    sequence,
    checksum: checksumText(
      `${fixture.teamId}:${fixture.search.tab}:${fixture.search.cursor}`,
      fixture.seed + 2,
    ),
  }
}

export function buildLiveLoaderData(
  fixture: HydrationResumeFixture,
  itemId: string,
  sequence: number,
): HydrationResumeLoaderData {
  return {
    route: 'live',
    source: 'client',
    fixtureId: fixture.fixtureId,
    sequence,
    checksum: checksumText(`${itemId}:live`, fixture.seed + 3),
  }
}

export function createHydrationResumeRuntime() {
  let counters = createEmptyCounters()
  let activeFixture: HydrationResumeFixture | undefined = undefined
  let lastHydratedData: unknown = undefined
  const deferredRecords = new Map<string, ControlledDeferred>()

  function getActiveFixture() {
    if (!activeFixture) {
      throw new Error('Hydration resume fixture is not active')
    }

    return activeFixture
  }

  function createDeferredPayload(itemId: string, seed: number) {
    return {
      itemId,
      value: `resolved-${itemId}`,
      checksum: checksumText(`${itemId}:resolved`, seed + 4),
    } satisfies HydrationResumeDeferredPayload
  }

  function createDeferredLoaderData(
    fixture: HydrationResumeFixture,
    itemId: string,
    source: 'ssr' | 'client',
    sequence: number,
  ): HydrationResumeDeferredLoaderData {
    if (deferredRecords.has(itemId)) {
      throw new Error(`Deferred hydration record already exists for ${itemId}`)
    }

    let resolveDeferred: ControlledDeferred['resolve'] | undefined = undefined
    const promise = new Promise<HydrationResumeDeferredPayload>((resolve) => {
      resolveDeferred = resolve
    })

    if (!resolveDeferred) {
      throw new Error(
        `Failed to create deferred hydration record for ${itemId}`,
      )
    }

    deferredRecords.set(itemId, {
      promise,
      resolve: resolveDeferred,
      resolved: false,
    })

    return {
      route: 'deferred',
      source,
      fixtureId: fixture.fixtureId,
      itemId,
      sequence,
      checksum: checksumText(`${itemId}:deferred`, fixture.seed + 5),
      deferred: promise,
    }
  }

  return {
    startCycle(fixture: HydrationResumeFixture) {
      counters = createEmptyCounters()
      activeFixture = fixture
      lastHydratedData = undefined
      deferredRecords.clear()
    },
    clearCycle() {
      activeFixture = undefined
      deferredRecords.clear()
    },
    recordLoader(name: 'hydrate' | 'dashboard' | 'team' | 'live' | 'deferred') {
      counters[name] += 1
      return counters[name]
    },
    recordBeforeLoad(name: 'dashboardBeforeLoad' | 'teamBeforeLoad') {
      counters[name] += 1
      return counters[name]
    },
    recordCustomHydrate(dehydratedData: unknown) {
      counters.customHydrate += 1
      lastHydratedData = dehydratedData
    },
    recordHydrationComplete() {
      counters.hydrationComplete += 1
    },
    recordCleanup() {
      counters.cleanup += 1
    },
    getActiveFixture,
    getCounters() {
      return { ...counters }
    },
    getLastHydratedData() {
      return lastHydratedData
    },
    createDeferredLoaderData,
    createHydratedDeferredLoaderData(
      fixture: Extract<HydrationResumeFixture, { kind: 'deferred' }>,
    ) {
      return createDeferredLoaderData(fixture, fixture.itemId, 'ssr', 0)
    },
    createClientDeferredLoaderData(itemId: string, sequence: number) {
      return createDeferredLoaderData(
        getActiveFixture(),
        itemId,
        'client',
        sequence,
      )
    },
    resolveDeferred(itemId: string) {
      const record = deferredRecords.get(itemId)

      if (!record) {
        throw new Error(`Missing deferred hydration record for ${itemId}`)
      }

      if (record.resolved) {
        return
      }

      record.resolved = true
      counters.deferredResolved += 1
      record.resolve(createDeferredPayload(itemId, getActiveFixture().seed))
    },
  }
}

export type HydrationResumeRuntime = ReturnType<
  typeof createHydrationResumeRuntime
>

function buildDashboardBeforeLoadContext(
  fixture: Extract<HydrationResumeFixture, { kind: 'dashboard' }>,
) {
  return {
    dashboardBeforeSeed: fixture.seed + 7,
  }
}

function buildTeamBeforeLoadContext(
  fixture: Extract<HydrationResumeFixture, { kind: 'dashboard' }>,
) {
  return {
    teamBeforeSeed: fixture.seed + 11,
  }
}

function buildDehydratedData(fixture: HydrationResumeFixture) {
  return {
    fixtureId: fixture.fixtureId,
    kind: fixture.kind,
    checksum: checksumText(
      `${fixture.fixtureId}:hydrate-data`,
      fixture.seed + 13,
    ),
  }
}

function buildLoaderDataForRoute(
  routeId: string,
  routeIds: HydrationResumeRouteIds,
  runtime: HydrationResumeRuntime,
  fixture: HydrationResumeFixture,
) {
  if (routeId === routeIds.hydrate) {
    return buildHydrateLoaderData(fixture, 'ssr', 0)
  }

  if (fixture.kind === 'dashboard') {
    if (routeId === routeIds.dashboard) {
      return buildDashboardLoaderData(fixture, 'ssr', 0)
    }

    if (routeId === routeIds.team) {
      return buildTeamLoaderData(fixture, 'ssr', 0)
    }
  }

  if (fixture.kind === 'deferred' && routeId === routeIds.deferred) {
    return runtime.createHydratedDeferredLoaderData(fixture)
  }

  return undefined
}

function buildBeforeLoadContextForRoute(
  routeId: string,
  routeIds: HydrationResumeRouteIds,
  fixture: HydrationResumeFixture,
) {
  if (fixture.kind !== 'dashboard') {
    return undefined
  }

  if (routeId === routeIds.dashboard) {
    return buildDashboardBeforeLoadContext(fixture)
  }

  if (routeId === routeIds.team) {
    return buildTeamBeforeLoadContext(fixture)
  }

  return undefined
}

export function buildHydrationResumeDehydratedRouter(
  router: AnyRouter,
  routeIds: HydrationResumeRouteIds,
  runtime: HydrationResumeRuntime,
  fixture: HydrationResumeFixture,
): DehydratedRouter {
  const matches = router.matchRoutes(router.stores.location.get())
  const lastMatch = matches[matches.length - 1]

  if (!lastMatch) {
    throw new Error(`No hydration resume matches for ${fixture.href}`)
  }

  return {
    manifest: undefined,
    dehydratedData: buildDehydratedData(fixture),
    lastMatchId: dehydrateMatchId(lastMatch.id),
    matches: matches.map((match) => {
      const dehydratedMatch: DehydratedMatch = {
        i: dehydrateMatchId(match.id),
        s: 'success',
        ssr: true,
        u: fixture.updatedAt + match.index,
      }
      const loaderData = buildLoaderDataForRoute(
        match.routeId,
        routeIds,
        runtime,
        fixture,
      )
      const beforeLoadContext = buildBeforeLoadContextForRoute(
        match.routeId,
        routeIds,
        fixture,
      )

      if (loaderData !== undefined) {
        dehydratedMatch.l = loaderData
      }

      if (beforeLoadContext !== undefined) {
        dehydratedMatch.b = beforeLoadContext
      }

      return dehydratedMatch
    }),
  }
}

export function seedHydrationResumeSsrGlobal(
  router: AnyRouter,
  routeIds: HydrationResumeRouteIds,
  runtime: HydrationResumeRuntime,
  fixture: HydrationResumeFixture,
) {
  if (typeof window === 'undefined') {
    throw new Error('Hydration resume benchmark requires a window global')
  }

  const hadTsr = Object.prototype.hasOwnProperty.call(window, '$_TSR')
  const previousTsr = window.$_TSR
  const hadR = Object.prototype.hasOwnProperty.call(window, '$R')
  const previousR = window.$R
  const hadRTsr = previousR
    ? Object.prototype.hasOwnProperty.call(previousR, 'tsr')
    : false
  const previousRTsr = previousR?.tsr
  let cleaned = false
  let tsr: TsrSsrGlobal

  function cleanup() {
    if (cleaned) {
      return
    }

    cleaned = true
    runtime.recordCleanup()

    if (window.$_TSR === tsr) {
      if (hadTsr) {
        window.$_TSR = previousTsr
      } else {
        Reflect.deleteProperty(window, '$_TSR')
      }
    }

    if (window.$R) {
      if (hadRTsr) {
        window.$R.tsr = previousRTsr
      } else {
        Reflect.deleteProperty(window.$R, 'tsr')
      }
    }

    if (!hadR && window.$R && Object.keys(window.$R).length === 0) {
      Reflect.deleteProperty(window, '$R')
    }
  }

  tsr = {
    router: buildHydrationResumeDehydratedRouter(
      router,
      routeIds,
      runtime,
      fixture,
    ),
    h: () => runtime.recordHydrationComplete(),
    e: () => {},
    c: cleanup,
    p: (script) => {
      if (tsr.initialized) {
        script()
        return
      }

      tsr.buffer.push(script)
    },
    buffer: [],
    initialized: false,
  }

  window.$_TSR = tsr

  return cleanup
}
