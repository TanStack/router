import type { AnyRouter, NavigateOptions } from '@tanstack/router-core'
import type { ClientNavWorkload } from '#client-nav/benchmark'
import {
  createBenchContainer,
  waitForCounter,
  waitWithTimeout,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'
import {
  createDashboardHydrationFixture,
  createDeferredHydrationFixture,
  createLiveNavigationTarget,
  type DashboardSearch,
  type HydrationResumeAppModule,
  type HydrationResumeCounters,
  type HydrationResumeFixture,
  type HydrationResumeFramework,
  type MountedHydrationResumeApp,
} from './shared'

type ActiveHydrationMount = MountedHydrationResumeApp & {
  container: Element
}

const CYCLES_PER_RUN = 2
const WAIT_TIMEOUT_MS = 2_000

function getHydrationResumeMarker(
  container: ParentNode,
  marker: string,
): HTMLElement | undefined {
  return (
    container.querySelector<HTMLElement>(
      `[data-hydration-resume-marker="${marker}"]`,
    ) ?? undefined
  )
}

function hasHydrationResumeMarker(
  container: ParentNode,
  marker: string,
  expectedDataset: Record<string, string>,
) {
  const element = getHydrationResumeMarker(container, marker)

  if (!element) {
    return false
  }

  for (const [key, value] of Object.entries(expectedDataset)) {
    if (element.dataset[key] !== value) {
      return false
    }
  }

  return true
}

async function waitForHydrationResumeMarker(
  container: ParentNode,
  marker: string,
  expectedDataset: Record<string, string>,
) {
  await waitForCounter(
    () =>
      hasHydrationResumeMarker(container, marker, expectedDataset) ? 1 : 0,
    1,
    {
      label: `hydration-resume marker ${marker}`,
      timeoutMs: WAIT_TIMEOUT_MS,
    },
  )
}

function assertCounter(
  counters: HydrationResumeCounters,
  name: keyof HydrationResumeCounters,
  expected: number,
) {
  if (counters[name] !== expected) {
    throw new Error(
      `Expected hydration-resume counter ${name} to be ${expected}, got ${counters[name]}`,
    )
  }
}

function assertDashboardHydrationCounters(counters: HydrationResumeCounters) {
  assertCounter(counters, 'hydrate', 0)
  assertCounter(counters, 'dashboard', 0)
  assertCounter(counters, 'team', 0)
  assertCounter(counters, 'customHydrate', 1)
  assertCounter(counters, 'hydrationComplete', 1)
}

function waitForRendered(
  router: AnyRouter,
  action: () => Promise<unknown> | unknown,
  label: string,
) {
  let unsubscribe: (() => void) | undefined = undefined
  const rendered = new Promise<void>((resolve) => {
    unsubscribe = router.subscribe('onRendered', () => {
      unsubscribe?.()
      unsubscribe = undefined
      resolve()
    })
  })

  return waitWithTimeout(Promise.all([Promise.resolve(action()), rendered]), {
    label,
    timeoutMs: WAIT_TIMEOUT_MS,
  }).finally(() => {
    unsubscribe?.()
  })
}

async function navigate(
  router: AnyRouter,
  options: NavigateOptions,
  label: string,
) {
  await waitWithTimeout(router.navigate(options), {
    label,
    timeoutMs: WAIT_TIMEOUT_MS,
  })
}

async function cleanupActiveMount(
  activeMount: ActiveHydrationMount | undefined,
  clearRuntime: () => void,
) {
  if (!activeMount) {
    return
  }

  const errors: Array<unknown> = []

  try {
    activeMount.cleanup()
  } catch (error) {
    errors.push(error)
  }

  try {
    activeMount.unmount()
  } catch (error) {
    errors.push(error)
  }

  try {
    if (
      typeof self !== 'undefined' &&
      self.__TSR_ROUTER__ === activeMount.router
    ) {
      self.__TSR_ROUTER__ = undefined
    }
  } catch (error) {
    errors.push(error)
  }

  try {
    activeMount.router.history.destroy()
  } catch (error) {
    errors.push(error)
  }

  try {
    activeMount.container.remove()
  } catch (error) {
    errors.push(error)
  }

  try {
    clearRuntime()
  } catch (error) {
    errors.push(error)
  }

  if (errors.length === 1) {
    throw errors[0]
  }

  if (errors.length > 1) {
    throw new AggregateError(errors, 'Hydration resume teardown failed')
  }
}

export function createHydrationResumeWorkload(
  framework: HydrationResumeFramework,
  appModule: HydrationResumeAppModule,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  let runIndex = 0
  let activeMount: ActiveHydrationMount | undefined = undefined

  async function mountFixture(fixture: HydrationResumeFixture) {
    await cleanupActiveMount(
      activeMount,
      appModule.hydrationResumeRuntime.clearCycle,
    )
    activeMount = undefined

    const container = createBenchContainer()

    try {
      const mounted = await appModule.mountHydratedTestApp(container, fixture)
      activeMount = {
        ...mounted,
        container,
      }
      return activeMount
    } catch (error) {
      container.remove()
      appModule.hydrationResumeRuntime.clearCycle()
      throw error
    }
  }

  async function runDashboardHydration(cycleIndex: number) {
    const fixture = createDashboardHydrationFixture(cycleIndex)
    const liveTarget = createLiveNavigationTarget(cycleIndex)
    const mounted = await mountFixture(fixture)

    await waitForHydrationResumeMarker(mounted.container, 'dashboard', {
      teamId: fixture.teamId,
      tab: fixture.search.tab,
      source: 'ssr',
      contextSeed: String(fixture.seed + 11),
    })

    assertDashboardHydrationCounters(
      appModule.hydrationResumeRuntime.getCounters(),
    )

    await navigate(
      mounted.router,
      {
        to: '/hydrate/dashboard/$teamId',
        params: { teamId: fixture.teamId },
        search: fixture.search satisfies DashboardSearch,
        replace: true,
      },
      'same hydrated dashboard navigation',
    )
    await waitForHydrationResumeMarker(mounted.container, 'dashboard', {
      teamId: fixture.teamId,
      tab: fixture.search.tab,
      source: 'ssr',
      contextSeed: String(fixture.seed + 11),
    })
    assertDashboardHydrationCounters(
      appModule.hydrationResumeRuntime.getCounters(),
    )

    await waitForRendered(
      mounted.router,
      () =>
        mounted.router.navigate({
          to: '/hydrate/live/$itemId',
          params: liveTarget,
          replace: true,
        }),
      'first live navigation render',
    )
    await waitForHydrationResumeMarker(mounted.container, 'live', {
      itemId: liveTarget.itemId,
      source: 'client',
    })
    assertCounter(appModule.hydrationResumeRuntime.getCounters(), 'live', 1)
  }

  async function runDeferredHydration(cycleIndex: number) {
    const fixture = createDeferredHydrationFixture(cycleIndex)
    const mounted = await mountFixture(fixture)

    await waitForHydrationResumeMarker(mounted.container, 'deferred-fallback', {
      itemId: fixture.itemId,
      source: 'ssr',
    })

    const countersAfterHydration =
      appModule.hydrationResumeRuntime.getCounters()
    assertCounter(countersAfterHydration, 'deferred', 0)
    assertCounter(countersAfterHydration, 'customHydrate', 1)
    assertCounter(countersAfterHydration, 'hydrationComplete', 1)

    appModule.hydrationResumeRuntime.resolveDeferred(fixture.itemId)
    await waitForHydrationResumeMarker(mounted.container, 'deferred-resolved', {
      itemId: fixture.itemId,
      source: 'ssr',
    })
    assertCounter(
      appModule.hydrationResumeRuntime.getCounters(),
      'deferredResolved',
      1,
    )
  }

  async function before() {
    runIndex = 0
    await cleanupActiveMount(
      activeMount,
      appModule.hydrationResumeRuntime.clearCycle,
    )
    activeMount = undefined
  }

  async function run() {
    const startIndex = runIndex
    runIndex += CYCLES_PER_RUN

    try {
      for (let index = 0; index < CYCLES_PER_RUN; index++) {
        const cycleIndex = startIndex + index
        await runDashboardHydration(cycleIndex)
        await runDeferredHydration(cycleIndex)
      }
    } finally {
      await cleanupActiveMount(
        activeMount,
        appModule.hydrationResumeRuntime.clearCycle,
      )
      activeMount = undefined
    }
  }

  async function sanity() {
    await before()
    await run()

    if (typeof window !== 'undefined' && window.$_TSR) {
      throw new Error('Hydration resume sanity leaked window.$_TSR')
    }
  }

  async function after() {
    await cleanupActiveMount(
      activeMount,
      appModule.hydrationResumeRuntime.clearCycle,
    )
    activeMount = undefined
  }

  return {
    name: `client hydration resume loop (${framework})`,
    before,
    run,
    sanity,
    after,
  }
}
