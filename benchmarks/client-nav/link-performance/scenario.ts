import { JSDOM } from 'jsdom'
import { createScenarioSetup } from '../scenarios/harness'
import { ticksPerIteration } from '../scenarios/links/shared'
import {
  NAVIGATION_STATES,
  assertScenario,
  getSourceUrl,
  laneLinkCounts,
} from './cases'
import type { LinkCaseId } from './cases'
import { PHASE_METRICS } from './worker-protocol'
import type { NavigationPhases } from './worker-protocol'
import type * as ClientApp from './src/client'
import type * as SsrApp from './src/ssr'

export interface LinkScenario {
  setup: () => Promise<void>
  batch: () => Promise<void>
  check: () => void
  teardown: () => void
  /** Per-navigation means since the previous call (timed `lane-*` cases). */
  takePhases?: () => NavigationPhases | undefined
}

export const samplingOptions = {
  warmupIterations: 100,
  warmupTime: 1_000,
  time: 5_000,
  throws: true,
}

/**
 * `expectDepartingSkip` asserts that the Links of the departing `/lane/a` leaf
 * do no work during `a->b` navigations. Bundles without that skip (an older
 * baseline) only record the work.
 */
export function createClientScenario(
  app: typeof ClientApp,
  id: LinkCaseId,
  expectDepartingSkip: boolean,
): LinkScenario {
  let mounted: ReturnType<typeof app.mountTestApp> | undefined
  let container: HTMLElement | undefined
  let anchors: Array<Element> = []
  const lane = laneLinkCounts(id)
  const phases: NavigationPhases = {}
  let resolveRendered = () => {}
  let loadedAt = 0
  let unsubscribe = () => {}
  const nextMacrotask = () =>
    new Promise<number>((resolve) =>
      setImmediate(() => resolve(performance.now())),
    )
  const test = createScenarioSetup({
    frameworkLabel: 'React',
    mount: (element, history) => {
      container = element
      mounted = app.mountTestApp(element, history, id)
      return mounted
    },
    initialUrl: getSourceUrl(id, 0),
    steps: NAVIGATION_STATES.map((state) => `go-state-${state}`),
    assertAfterStep: (index, element) => {
      assertScenario(id, NAVIGATION_STATES[index]!, element)
      if (!mounted) {
        throw new Error('Link benchmark app was not mounted')
      }
      mounted.assertStateUpdates()
    },
  })

  return {
    async setup() {
      await test.before()
      if (!container || !mounted) {
        throw new Error('Link benchmark container was not created')
      }
      anchors = [
        ...container.querySelectorAll(
          lane
            ? '[data-owner="layout"] a[data-perf-link]'
            : 'a[data-perf-link]',
        ),
      ]
      const router = mounted.router
      const unsubscribeLoad = router.subscribe('onLoad', () => {
        loadedAt = performance.now()
      })
      const unsubscribeRendered = router.subscribe('onRendered', () =>
        resolveRendered(),
      )
      unsubscribe = () => {
        unsubscribeLoad()
        unsubscribeRendered()
      }
    },
    async batch() {
      if (!lane) {
        for (let index = 0; index < ticksPerIteration; index++) {
          await test.tick()
        }
        await test.finishBatch()
        return
      }
      // Each lane navigation starts from a settled app: work left over from
      // the previous navigation would otherwise run inside the sync window.
      for (let index = 0; index < ticksPerIteration; index++) {
        const state = NAVIGATION_STATES[index % NAVIGATION_STATES.length]!
        const link = container!.querySelector(
          `[data-testid="go-state-${state}"]`,
        )!
        const rendered = new Promise<void>((resolve) => {
          resolveRendered = resolve
        })
        const leafWork = app.laneLeafWork.count
        // Queued before the click, this is the first macrotask after the
        // click's synchronous work and microtasks (INP processing time).
        const firstTask = nextMacrotask()
        const start = performance.now()
        link.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            button: 0,
          }),
        )
        await rendered
        const end = performance.now()
        const syncEnd = Math.min(await firstTask, end)
        if (loadedAt < start) {
          throw new Error('Lane navigation rendered without an onLoad event')
        }
        if (
          expectDepartingSkip &&
          state % 2 === 1 &&
          app.laneLeafWork.count !== leafWork
        ) {
          throw new Error(
            `${id}: departing leaf Links did ${app.laneLeafWork.count - leafWork} renders or updater calls during a->b`,
          )
        }
        const phase = (phases[state % 2 === 0 ? 'b->a' : 'a->b'] ??= {
          syncMs: 0,
          onLoadMs: 0,
          totalMs: 0,
          count: 0,
        })
        phase.syncMs += syncEnd - start
        phase.onLoadMs += loadedAt - start
        phase.totalMs += end - start
        phase.count++
        await test.finishBatch()
      }
    },
    takePhases() {
      if (!lane) {
        return undefined
      }
      const means: NavigationPhases = {}
      for (const [label, phase] of Object.entries(phases)) {
        means[label] = { ...phase }
        for (const metric of PHASE_METRICS) {
          means[label][metric] /= phase.count
        }
        delete phases[label]
      }
      return means
    },
    check() {
      if (!container || !mounted) {
        throw new Error('Link benchmark app was not mounted')
      }
      assertScenario(id, 0, container)
      mounted.assertStateUpdates()
      if (mounted.router.history.length !== 1) {
        throw new Error('Link benchmark history must remain bounded')
      }
      const current = container.querySelectorAll(
        lane ? '[data-owner="layout"] a[data-perf-link]' : 'a[data-perf-link]',
      )
      if (anchors.some((anchor, index) => current[index] !== anchor)) {
        throw new Error('Measured Links must stay mounted across navigations')
      }
    },
    teardown() {
      unsubscribe()
      unsubscribe = () => {}
      test.after()
    },
  }
}

export function createSsrScenario(
  app: typeof SsrApp,
  id: LinkCaseId,
): LinkScenario {
  let html = ''
  let state = 0
  function check() {
    const dom = new JSDOM(html)
    try {
      assertScenario(id, state, dom.window.document)
    } finally {
      dom.window.close()
    }
  }

  return {
    async setup() {
      for (const nextState of NAVIGATION_STATES) {
        state = nextState
        html = await app.renderScenario(id, state, true)
        check()
      }
    },
    async batch() {
      for (const nextState of NAVIGATION_STATES) {
        state = nextState
        html = await app.renderScenario(id, state)
      }
    },
    check,
    teardown() {
      html = ''
    },
  }
}
