import type { ClientNavWorkload } from '#client-nav/benchmark'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'
import type { Framework, MountTestApp } from '#client-nav/lifecycle'
import {
  subscribersSelectorsNavigationActions,
  subscribersSelectorsScenarioSlug,
} from './shared.ts'
import type { SubscriberCounts, SubscribersSelectorsAction } from './shared.ts'

interface SubscribersSelectorsApp {
  mountTestApp: MountTestApp
  getSubscriberCounts: () => SubscriberCounts
  resetSubscriberCounts: () => void
  setSubscriberCountersEnabled: (enabled: boolean) => void
}

function assertCounterAdvanced(label: string, before: number, after: number) {
  if (after <= before) {
    throw new Error(
      `Expected ${label} counter to advance, before=${before}, after=${after}`,
    )
  }
}

function assertCounterStable(label: string, before: number, after: number) {
  if (after !== before) {
    throw new Error(
      `Expected ${label} counter to stay stable, before=${before}, after=${after}`,
    )
  }
}

function assertLocation(
  actualPathname: string,
  actualHash: string,
  action: SubscribersSelectorsAction,
) {
  const expectedPathname = `/state/${action.section}/${action.itemId}`

  if (actualPathname !== expectedPathname) {
    throw new Error(
      `Expected pathname ${expectedPathname}, received ${actualPathname}`,
    )
  }

  if (actualHash !== action.hash) {
    throw new Error(`Expected hash ${action.hash}, received ${actualHash}`)
  }
}

export function createSubscribersSelectorsWorkload(
  framework: Framework,
  app: SubscribersSelectorsApp,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp: app.mountTestApp })

  async function navigate(action: SubscribersSelectorsAction) {
    await lifecycle.navigate({
      to: '/state/$section/$itemId',
      params: {
        section: action.section,
        itemId: action.itemId,
      },
      search: action.search,
      hash: action.hash,
      replace: true,
      resetScroll: false,
      hashScrollIntoView: false,
    })
  }

  function assertScenarioMounted() {
    const marker = lifecycle
      .getContainer()
      .querySelector(
        `[data-client-nav-scenario="${subscribersSelectorsScenarioSlug}"]`,
      )

    if (!marker) {
      throw new Error('Subscribers selectors scenario marker was not rendered')
    }
  }

  function assertCurrentLocation(action: SubscribersSelectorsAction) {
    const { location } = lifecycle.getRouter().state
    assertLocation(location.pathname, location.hash, action)
  }

  async function before() {
    app.setSubscriberCountersEnabled(false)
    app.resetSubscriberCounts()
    await lifecycle.before()
  }

  async function run() {
    for (const action of subscribersSelectorsNavigationActions) {
      await navigate(action)
    }
  }

  async function sanity() {
    app.setSubscriberCountersEnabled(true)
    app.resetSubscriberCounts()
    await lifecycle.before()

    try {
      const [
        baseAction,
        selectedAction,
        unrelatedAction,
        itemAction,
        sectionAction,
        hashAction,
      ] = subscribersSelectorsNavigationActions

      await navigate(baseAction!)
      assertScenarioMounted()
      assertCurrentLocation(baseAction!)

      const baseCounts = app.getSubscriberCounts()

      await navigate(selectedAction!)
      assertCurrentLocation(selectedAction!)

      const selectedCounts = app.getSubscriberCounts()
      assertCounterAdvanced(
        'selected search',
        baseCounts.searchSelected,
        selectedCounts.searchSelected,
      )
      assertCounterStable(
        'stable search after selected-key navigation',
        baseCounts.searchStable,
        selectedCounts.searchStable,
      )

      await navigate(unrelatedAction!)
      assertCurrentLocation(unrelatedAction!)

      const unrelatedCounts = app.getSubscriberCounts()
      assertCounterStable(
        'selected search after unrelated-key navigation',
        selectedCounts.searchSelected,
        unrelatedCounts.searchSelected,
      )
      assertCounterStable(
        'stable search after unrelated-key navigation',
        selectedCounts.searchStable,
        unrelatedCounts.searchStable,
      )

      await navigate(itemAction!)
      assertCurrentLocation(itemAction!)

      const itemCounts = app.getSubscriberCounts()
      assertCounterAdvanced(
        'item param',
        unrelatedCounts.paramItem,
        itemCounts.paramItem,
      )

      await navigate(sectionAction!)
      assertCurrentLocation(sectionAction!)

      const sectionCounts = app.getSubscriberCounts()
      assertCounterAdvanced(
        'section param',
        itemCounts.paramSection,
        sectionCounts.paramSection,
      )

      await navigate(hashAction!)
      assertCurrentLocation(hashAction!)

      const hashCounts = app.getSubscriberCounts()
      assertCounterAdvanced(
        'router hash',
        sectionCounts.routerHash,
        hashCounts.routerHash,
      )
    } finally {
      await lifecycle.after()
      app.resetSubscriberCounts()
      app.setSubscriberCountersEnabled(false)
    }
  }

  return {
    name: `client subscribers selectors loop (${framework})`,
    before,
    run,
    sanity,
    after: lifecycle.after,
  }
}
