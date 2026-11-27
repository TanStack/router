/**
 * Shared definition of the `link-viewport` scenario: mounting and unmounting
 * a list of `preload="viewport"` Links. Each step navigates between `/`, which
 * renders no viewport Links, and `/list`, which renders VIEWPORT_LINK_COUNT
 * of them, so every tick either starts or stops observing the whole list.
 *
 * jsdom has no `IntersectionObserver`, and Links skip viewport observation
 * without one, so the scenario installs a minimal deterministic stub for its
 * lifetime. The stub never reports intersections: no preload runs, and the
 * measured work is the Links' observer setup and teardown. The three framework
 * apps consume these constants so the workload is identical modulo the
 * rendering layer.
 */
import type { ScenarioStep } from '../harness'

export const VIEWPORT_LINK_COUNT = 200

export const itemIds = Array.from({ length: VIEWPORT_LINK_COUNT }, (_, index) =>
  String(index + 1),
)

export const viewportLinkClass = 'viewport-link'
export const homeMarker = 'home'
export const listMarker = 'list'

interface StepDef {
  testId: string
  marker: string
  /** Expected number of mounted viewport Links after the step. */
  linkCount: number
}

export const stepDefs: ReadonlyArray<StepDef> = [
  // 1. home -> list: every viewport Link mounts and starts observing.
  { testId: 'go-list', marker: listMarker, linkCount: VIEWPORT_LINK_COUNT },
  // 2. list -> home: every viewport Link unmounts and stops observing.
  { testId: 'go-home', marker: homeMarker, linkCount: 0 },
]

export const initialUrl = '/'

export const scenarioSteps: ReadonlyArray<ScenarioStep> = stepDefs.map(
  (step) => step.testId,
)

/**
 * Minimal `IntersectionObserver` that tracks its observed targets and never
 * invokes its callback, installed only between `before()` and `after()`.
 * Its counters let the untimed warm-up lap check that every mounted viewport
 * Link was observed exactly once and released on unmount, whether through
 * `unobserve` or `disconnect`.
 */
export function createViewportObserverStub() {
  const counts = { observed: 0, released: 0, live: 0 }
  let previous = { ...counts }

  class StubIntersectionObserver implements IntersectionObserver {
    readonly root = null
    readonly rootMargin: string
    readonly scrollMargin = '0px'
    readonly thresholds: ReadonlyArray<number> = [0]
    private readonly targets = new Set<Element>()

    constructor(
      _callback: IntersectionObserverCallback,
      options?: IntersectionObserverInit,
    ) {
      this.rootMargin = options?.rootMargin ?? '0px'
    }

    observe(target: Element) {
      if (!this.targets.has(target)) {
        this.targets.add(target)
        counts.observed++
        counts.live++
      }
    }

    unobserve(target: Element) {
      if (this.targets.delete(target)) {
        counts.released++
        counts.live--
      }
    }

    disconnect() {
      counts.released += this.targets.size
      counts.live -= this.targets.size
      this.targets.clear()
    }

    takeRecords(): Array<IntersectionObserverEntry> {
      return []
    }
  }

  const globals = globalThis as { IntersectionObserver?: unknown }
  let original: unknown

  function assertStepResult(stepIndex: number, container: HTMLElement) {
    const step = stepDefs[stepIndex]!

    const marker = container.querySelector('[data-testid="page-state"]')
    if (marker?.textContent !== step.marker) {
      throw new Error(
        `Expected page marker "${step.marker}" after step ${stepIndex}, received "${marker?.textContent}"`,
      )
    }

    const links = container.querySelectorAll(`a.${viewportLinkClass}`)
    if (links.length !== step.linkCount) {
      throw new Error(
        `Expected ${step.linkCount} viewport link(s) after step ${stepIndex}, received ${links.length}`,
      )
    }

    // Mounting observes each new Link once; unmounting releases each of them.
    const observed = counts.observed - previous.observed
    const released = counts.released - previous.released
    const expectedReleased = VIEWPORT_LINK_COUNT - step.linkCount
    previous = { ...counts }
    if (
      observed !== step.linkCount ||
      released !== expectedReleased ||
      counts.live !== step.linkCount
    ) {
      throw new Error(
        `Expected ${step.linkCount} observe(s), ${expectedReleased} release(s) and ${step.linkCount} observed target(s) after step ${stepIndex}, received ${observed}, ${released} and ${counts.live}`,
      )
    }
  }

  return {
    assertStepResult,
    /** Installs the stub around a scenario's mounted lifetime. */
    wrap<T extends { before: () => Promise<void>; after: () => void }>(
      scenario: T,
    ): T {
      return {
        ...scenario,
        async before() {
          original = globals.IntersectionObserver
          globals.IntersectionObserver = StubIntersectionObserver
          previous = { ...counts }
          await scenario.before()
        },
        after() {
          scenario.after()
          globals.IntersectionObserver = original
        },
      }
    },
  }
}

// One lap (mount, then unmount the list) per tick pair; 10 laps per iteration.
export const ticksPerIteration = stepDefs.length * 10

export const benchOptions = {
  warmupIterations: 50,
  time: 10_000,
  throws: true,
}
