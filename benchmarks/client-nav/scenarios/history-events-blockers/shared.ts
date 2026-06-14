import type { RouterEvents } from '@tanstack/router-core'
import type { ClientNavWorkload } from '#client-nav/benchmark'
import type { Framework, MountTestApp } from '#client-nav/lifecycle'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'
import {
  createDeterministicRandom,
  randomSegment,
} from '#client-nav/bench-utils'

export type HistoryEventType =
  | 'onBeforeNavigate'
  | 'onBeforeLoad'
  | 'onLoad'
  | 'onBeforeRouteMount'
  | 'onResolved'
  | 'onRendered'

export interface HistoryBlockerLocation {
  pathname: string
  routeId: string
}

export interface HistoryBlockerArgs {
  current: HistoryBlockerLocation
  next: HistoryBlockerLocation
  action: string
}

export type HistoryBlockerResolver =
  | {
      status: 'blocked'
      current: HistoryBlockerLocation
      next: HistoryBlockerLocation
      action: string
      proceed: () => void
      reset: () => void
    }
  | {
      status: 'idle'
      current: undefined
      next: undefined
      action: undefined
      proceed: undefined
      reset: undefined
    }

export interface HistoryEventsBlockersRuntime {
  allowActiveBlocker: () => void
  observeResolver: (resolver: HistoryBlockerResolver | undefined) => void
  recordCanGoBack: (canGoBack: boolean) => void
  recordEvent: <TEventType extends HistoryEventType>(
    eventType: TEventType,
    slot: number,
    event: RouterEvents[TEventType],
  ) => void
  recordIgnoredNavigation: () => void
  rejectActiveBlocker: () => void
  reset: () => void
  resetEventCounters: () => void
  setBlockerMode: (mode: HistoryBlockerMode) => void
  shouldBlock: (args: HistoryBlockerArgs) => boolean
  snapshot: () => HistoryEventsBlockersSnapshot
}

export type HistoryBlockerMode = 'disabled' | 'reject' | 'allow'

export interface HistoryEventsBlockersSnapshot {
  blockers: HistoryBlockerCounters
  canGoBackReads: number
  canGoBackTrueReads: number
  eventChecksum: number
  eventOrder: Array<HistoryEventType>
  events: Record<HistoryEventType, number>
  activeBlocker: ActiveHistoryBlockerSnapshot | undefined
}

interface HistoryBlockerCounters {
  attempts: number
  ignored: number
  rejected: number
  allowed: number
  resolverBlocked: number
}

interface ActiveHistoryBlockerSnapshot {
  action: string
  currentPathname: string
  nextPathname: string
}

interface ActiveHistoryBlocker extends ActiveHistoryBlockerSnapshot {
  proceed: () => void
  reset: () => void
}

interface HistoryEventsBlockersInput {
  rejectedFormId: string
  rejectedReviewId: string
  allowedFormId: string
  allowedReviewId: string
}

type NavigationSettlement =
  | {
      status: 'fulfilled'
      value: void
    }
  | {
      status: 'rejected'
      reason: unknown
    }

export const historyEventsBlockersScenarioSlug = 'history-events-blockers'
export const historyEventsBlockersHomePath = '/history'
export const historyEventsBlockersDonePath = '/history/done'

const eventTypes = [
  'onBeforeNavigate',
  'onBeforeLoad',
  'onLoad',
  'onBeforeRouteMount',
  'onResolved',
  'onRendered',
] as const satisfies ReadonlyArray<HistoryEventType>

const eventSubscriberSlots = [0, 1] as const
const random = createDeterministicRandom(16_016)

const historyEventsBlockersInputs = Array.from({ length: 2 }, (_, index) =>
  createHistoryEventsBlockersInput(index),
)

const historyEventsBlockersSanityInput =
  createHistoryEventsBlockersInput(10_001)

export function createHistoryEventsBlockersRuntime(): HistoryEventsBlockersRuntime {
  let blockerMode: HistoryBlockerMode = 'disabled'
  let activeBlocker: ActiveHistoryBlocker | undefined = undefined
  let blockers = createBlockerCounters()
  let canGoBackReads = 0
  let canGoBackTrueReads = 0
  let eventChecksum = 0
  let eventOrder: Array<HistoryEventType> = []
  let events = createEventCounters()

  function resetActiveBlocker() {
    const blocker = activeBlocker
    activeBlocker = undefined
    blocker?.reset()
  }

  return {
    allowActiveBlocker() {
      const blocker = activeBlocker

      if (!blocker) {
        throw new Error('No active history blocker to proceed')
      }

      activeBlocker = undefined
      blockers.allowed += 1
      blocker.proceed()
    },
    observeResolver(resolver) {
      if (!resolver || resolver.status === 'idle') {
        return
      }

      if (
        activeBlocker?.proceed === resolver.proceed &&
        activeBlocker.reset === resolver.reset
      ) {
        return
      }

      activeBlocker = {
        action: resolver.action,
        currentPathname: resolver.current.pathname,
        nextPathname: resolver.next.pathname,
        proceed: resolver.proceed,
        reset: resolver.reset,
      }
      blockers.resolverBlocked += 1
    },
    recordCanGoBack(canGoBack) {
      canGoBackReads += 1

      if (canGoBack) {
        canGoBackTrueReads += 1
      }

      eventChecksum = runHistoryEventsBlockersComputation(
        eventChecksum + (canGoBack ? 17 : 3),
      )
    },
    recordEvent(eventType, slot, event) {
      events[eventType] += 1
      eventOrder.push(eventType)

      if (eventOrder.length > 96) {
        eventOrder = eventOrder.slice(-48)
      }

      eventChecksum = runHistoryEventsBlockersComputation(
        eventChecksum +
          pathSeed(event.toLocation.pathname) +
          eventTypes.indexOf(eventType) * 97 +
          slot * 13 +
          (event.pathChanged ? 5 : 0) +
          (event.hrefChanged ? 7 : 0),
      )
    },
    recordIgnoredNavigation() {
      blockers.ignored += 1
    },
    rejectActiveBlocker() {
      const blocker = activeBlocker

      if (!blocker) {
        throw new Error('No active history blocker to reset')
      }

      activeBlocker = undefined
      blockers.rejected += 1
      blocker.reset()
    },
    reset() {
      resetActiveBlocker()
      blockerMode = 'disabled'
      blockers = createBlockerCounters()
      canGoBackReads = 0
      canGoBackTrueReads = 0
      eventChecksum = 0
      eventOrder = []
      events = createEventCounters()
    },
    resetEventCounters() {
      eventChecksum = 0
      eventOrder = []
      events = createEventCounters()
    },
    setBlockerMode(mode) {
      blockerMode = mode
    },
    shouldBlock(args) {
      if (blockerMode === 'disabled') {
        return false
      }

      if (!isFormPath(args.current.pathname)) {
        return false
      }

      if (!isReviewPath(args.next.pathname)) {
        return false
      }

      blockers.attempts += 1
      return true
    },
    snapshot() {
      return {
        blockers: { ...blockers },
        canGoBackReads,
        canGoBackTrueReads,
        eventChecksum,
        eventOrder: [...eventOrder],
        events: { ...events },
        activeBlocker: activeBlocker
          ? {
              action: activeBlocker.action,
              currentPathname: activeBlocker.currentPathname,
              nextPathname: activeBlocker.nextPathname,
            }
          : undefined,
      }
    },
  }
}

export function runHistoryEventsBlockersComputation(seed: number) {
  let value = Math.trunc(seed) | 0

  for (let index = 0; index < 34; index++) {
    value = (value * 1664525 + 1013904223 + index) >>> 0
  }

  return value
}

export function createHistoryEventsBlockersWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
  runtime: HistoryEventsBlockersRuntime,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp })
  const detachedNavigations: Array<Promise<NavigationSettlement>> = []
  let eventUnsubscribers: Array<() => void> = []

  function getPageMarker() {
    return lifecycle
      .getContainer()
      .querySelector<HTMLElement>('[data-history-events-page]')
  }

  function getCurrentPathname() {
    return lifecycle.getRouter().state.location.pathname
  }

  function assertRenderedPage(
    page: 'dashboard' | 'form' | 'review' | 'done',
    id?: string,
  ) {
    const marker = getPageMarker()
    const actualPage = marker?.dataset.historyEventsPage
    const actualId = marker?.dataset.historyEventsId

    if (actualPage !== page) {
      throw new Error(`Expected history page ${page}, got ${actualPage}`)
    }

    if (id !== undefined && actualId !== id) {
      throw new Error(`Expected history id ${id}, got ${actualId}`)
    }
  }

  async function waitForPage(
    page: 'dashboard' | 'form' | 'review' | 'done',
    id?: string,
  ) {
    await lifecycle.waitForCounter(
      () => {
        try {
          assertRenderedPage(page, id)
          return 1
        } catch {
          return 0
        }
      },
      1,
      { label: `${page} history page marker` },
    )
  }

  function subscribeToRouterEvents() {
    const router = lifecycle.getRouter()
    eventUnsubscribers = []

    for (const eventType of eventTypes) {
      for (const slot of eventSubscriberSlots) {
        eventUnsubscribers.push(
          router.subscribe(eventType, (event) => {
            runtime.recordEvent(eventType, slot, event)
          }),
        )
      }
    }
  }

  function unsubscribeFromRouterEvents() {
    for (const unsubscribe of eventUnsubscribers.splice(0).reverse()) {
      unsubscribe()
    }
  }

  async function navigatePushToForm(id: string) {
    await lifecycle.navigate(
      {
        to: '/history/form/$formId',
        params: { formId: id },
      },
      { wait: 'rendered', label: `push form ${id}` },
    )
    await waitForPage('form', id)
  }

  async function navigateIgnoredToReview(id: string) {
    runtime.recordIgnoredNavigation()
    await lifecycle.navigate(
      {
        to: '/history/review/$reviewId',
        params: { reviewId: id },
        ignoreBlocker: true,
      },
      { wait: 'rendered', label: `ignored review ${id}` },
    )
    await waitForPage('review', id)
    await drainDetachedNavigations(`ignored review ${id}`)
  }

  async function navigatePushToSecondForm(id: string) {
    await lifecycle.navigate(
      {
        to: '/history/form/$formId',
        params: { formId: id },
      },
      { wait: 'rendered', label: `push second form ${id}` },
    )
    await waitForPage('form', id)
  }

  async function navigateAllowedToReview(id: string) {
    const before = runtime.snapshot().blockers.resolverBlocked
    runtime.setBlockerMode('allow')

    await lifecycle.waitForRender(
      async () => {
        const navigation = lifecycle.getRouter().navigate({
          to: '/history/review/$reviewId',
          params: { reviewId: id },
        })

        await waitForBlocker(before, `/history/review/${id}`)
        runtime.allowActiveBlocker()
        await navigation
      },
      { label: `allowed blocker review ${id}` },
    )

    runtime.setBlockerMode('disabled')
    await waitForPage('review', id)
    await drainDetachedNavigations(`allowed review ${id}`)
  }

  async function rejectReviewNavigation(formId: string, reviewId: string) {
    const before = runtime.snapshot()
    runtime.setBlockerMode('reject')

    const navigation = lifecycle.getRouter().navigate({
      to: '/history/review/$reviewId',
      params: { reviewId },
    })
    detachedNavigations.push(captureNavigation(navigation))

    await waitForBlocker(
      before.blockers.resolverBlocked,
      `/history/review/${reviewId}`,
    )
    runtime.rejectActiveBlocker()
    runtime.setBlockerMode('disabled')
    await lifecycle.waitForCounter(
      () => runtime.snapshot().blockers.rejected,
      before.blockers.rejected + 1,
      { label: `rejected blocker ${reviewId}` },
    )
    await lifecycle.waitForPromise(Promise.resolve(), {
      label: `rejected blocker microtask ${reviewId}`,
    })

    if (getCurrentPathname() !== `/history/form/${formId}`) {
      throw new Error(
        `Rejected blocker left ${getCurrentPathname()} instead of /history/form/${formId}`,
      )
    }

    await waitForPage('form', formId)
  }

  async function goBackToForm(id: string) {
    await lifecycle.waitForRender(
      () => {
        lifecycle.getRouter().history.back()
      },
      { label: `history back to form ${id}` },
    )
    await waitForPage('form', id)
  }

  async function goForwardToReview(id: string) {
    await lifecycle.waitForRender(
      () => {
        lifecycle.getRouter().history.forward()
      },
      { label: `history forward to review ${id}` },
    )
    await waitForPage('review', id)
  }

  async function replaceDone() {
    await lifecycle.navigate(
      {
        to: historyEventsBlockersDonePath,
        replace: true,
      },
      { wait: 'rendered', label: 'replace history done' },
    )
    await waitForPage('done')
  }

  async function returnHomeIfNeeded() {
    const router = lifecycle.getRouter()
    const index = router.history.location.state.__TSR_index

    if (router.state.location.pathname === historyEventsBlockersHomePath) {
      return
    }

    if (index <= 0) {
      await lifecycle.navigate(
        {
          to: historyEventsBlockersHomePath,
          replace: true,
          ignoreBlocker: true,
        },
        { wait: 'rendered', label: 'replace history home' },
      )
      await waitForPage('dashboard')
      return
    }

    await lifecycle.waitForRender(
      () => {
        router.history.go(-index, { ignoreBlocker: true })
      },
      { label: 'history return home' },
    )
    await waitForPage('dashboard')
  }

  async function waitForBlocker(
    expectedResolverBlocked: number,
    expectedPath: string,
  ) {
    await lifecycle.waitForCounter(
      () => runtime.snapshot().blockers.resolverBlocked,
      expectedResolverBlocked + 1,
      { label: `blocker resolver ${expectedPath}` },
    )

    const blocker = runtime.snapshot().activeBlocker

    if (!blocker) {
      throw new Error(`No active blocker for ${expectedPath}`)
    }

    if (blocker.nextPathname !== expectedPath) {
      throw new Error(
        `Expected blocker target ${expectedPath}, got ${blocker.nextPathname}`,
      )
    }
  }

  async function drainDetachedNavigations(label: string) {
    while (detachedNavigations.length > 0) {
      await lifecycle.waitForPromise(detachedNavigations.shift()!, {
        label: `${label} detached navigation`,
      })
    }
  }

  async function runHistoryGroup(
    input: HistoryEventsBlockersInput,
    assertEventCounters: boolean,
  ) {
    if (assertEventCounters) {
      runtime.resetEventCounters()
    }

    await navigatePushToForm(input.rejectedFormId)

    if (assertEventCounters) {
      assertSingleNavigationEventOrder(runtime.snapshot())
    }

    await rejectReviewNavigation(input.rejectedFormId, input.rejectedReviewId)
    await navigateIgnoredToReview(input.rejectedReviewId)
    await navigatePushToSecondForm(input.allowedFormId)
    await navigateAllowedToReview(input.allowedReviewId)
    await goBackToForm(input.allowedFormId)
    await goForwardToReview(input.allowedReviewId)
    await replaceDone()
  }

  async function before() {
    runtime.reset()
    detachedNavigations.length = 0
    unsubscribeFromRouterEvents()
    await lifecycle.before()
    subscribeToRouterEvents()
    runtime.resetEventCounters()
    await waitForPage('dashboard')
  }

  async function after() {
    runtime.reset()
    detachedNavigations.length = 0
    unsubscribeFromRouterEvents()
    await lifecycle.after()
    runtime.reset()
  }

  return {
    name: `client history events blockers loop (${framework})`,
    before,
    async run() {
      for (const input of historyEventsBlockersInputs) {
        await returnHomeIfNeeded()
        await runHistoryGroup(input, false)
      }
    },
    async sanity() {
      await before()

      try {
        await runHistoryGroup(historyEventsBlockersSanityInput, true)
        assertRenderedPage('done')

        const snapshot = runtime.snapshot()

        if (snapshot.blockers.rejected < 1) {
          throw new Error('History blocker sanity did not reject a navigation')
        }

        if (snapshot.blockers.allowed < 1) {
          throw new Error('History blocker sanity did not allow a navigation')
        }

        if (
          snapshot.canGoBackReads === 0 ||
          snapshot.canGoBackTrueReads === 0
        ) {
          throw new Error(
            'useCanGoBack subscriber did not observe stack changes',
          )
        }
      } finally {
        await after()
      }
    },
    after,
  }
}

function createHistoryEventsBlockersInput(
  index: number,
): HistoryEventsBlockersInput {
  return {
    rejectedFormId: token('reject-form', index),
    rejectedReviewId: token('reject-review', index),
    allowedFormId: token('allow-form', index),
    allowedReviewId: token('allow-review', index),
  }
}

function token(prefix: string, index: number) {
  return `${prefix}-${index}-${randomSegment(random)}`
}

function createBlockerCounters(): HistoryBlockerCounters {
  return {
    attempts: 0,
    ignored: 0,
    rejected: 0,
    allowed: 0,
    resolverBlocked: 0,
  }
}

function createEventCounters(): Record<HistoryEventType, number> {
  return {
    onBeforeNavigate: 0,
    onBeforeLoad: 0,
    onLoad: 0,
    onBeforeRouteMount: 0,
    onResolved: 0,
    onRendered: 0,
  }
}

function isFormPath(pathname: string) {
  return pathname.startsWith('/history/form/')
}

function isReviewPath(pathname: string) {
  return pathname.startsWith('/history/review/')
}

function pathSeed(pathname: string) {
  let seed = 0

  for (let index = 0; index < pathname.length; index++) {
    seed = (seed * 33 + pathname.charCodeAt(index)) >>> 0
  }

  return seed
}

function captureNavigation(
  value: Promise<void>,
): Promise<NavigationSettlement> {
  return value
    .then(
      (result): NavigationSettlement => ({
        status: 'fulfilled',
        value: result,
      }),
    )
    .catch(
      (reason: unknown): NavigationSettlement => ({
        status: 'rejected',
        reason,
      }),
    )
}

function assertSingleNavigationEventOrder(
  snapshot: HistoryEventsBlockersSnapshot,
) {
  for (const eventType of eventTypes) {
    if (snapshot.events[eventType] < eventSubscriberSlots.length) {
      throw new Error(`Expected ${eventType} subscribers to run`)
    }
  }

  assertEventPrecedes(snapshot.eventOrder, 'onBeforeNavigate', 'onBeforeLoad')
  assertEventPrecedes(snapshot.eventOrder, 'onBeforeLoad', 'onLoad')
  assertEventPrecedes(snapshot.eventOrder, 'onBeforeRouteMount', 'onResolved')
  assertEventPrecedes(snapshot.eventOrder, 'onResolved', 'onRendered')
}

function assertEventPrecedes(
  eventOrder: Array<HistoryEventType>,
  before: HistoryEventType,
  after: HistoryEventType,
) {
  const beforeIndex = eventOrder.indexOf(before)
  const afterIndex = eventOrder.indexOf(after)

  if (beforeIndex === -1 || afterIndex === -1 || beforeIndex >= afterIndex) {
    throw new Error(
      `Expected ${before} before ${after}, got ${eventOrder.join(',')}`,
    )
  }
}
