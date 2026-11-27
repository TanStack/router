/**
 * Shared definition of the `link-mount` scenario: the cost of mounting and
 * unmounting a large list of `<Link>`s without navigating. Each step
 * synchronously renders or removes the list on the index route, so the work
 * is Link setup and teardown (href building, active state, effects and
 * subscriptions), not route matching or loading.
 *
 * Two Link shapes cover both `buildLocation` paths: a plain `to="/about"`
 * and a `to="/posts/$postId"` Link with `params`, `search` and `activeProps`.
 * The default app keeps TanStack Router's `defaultPreload: false`; the intent
 * app sets `defaultPreload: 'intent'`, which attaches Link's intent handlers.
 */
import type { ScenarioStep } from '../harness'

// 150 rows x 2 Link shapes = 300 Links per mount.
export const LINK_ROW_COUNT = 150
export const LINKS_PER_ROW = 2
export const expectedLinkCount = LINK_ROW_COUNT * LINKS_PER_ROW

export const linkRows = Array.from({ length: LINK_ROW_COUNT }, (_, index) => ({
  postId: String(index + 1),
  page: (index % 5) + 1,
}))

export const readyTestId = 'link-mount-ready'
export const linkListTestId = 'link-list'

export type LinkMountPreload = 'default' | 'intent'

/** Sets whether the index route renders the Link list; resolves once rendered. */
export type SetLinksVisible = (visible: boolean) => void | Promise<void>

export function createScenarioSteps(
  setLinksVisible: SetLinksVisible,
): ReadonlyArray<ScenarioStep> {
  return [
    { type: 'run', run: () => setLinksVisible(true) },
    { type: 'run', run: () => setLinksVisible(false) },
  ]
}

// Anchor index -> expected href, checked after every warm-up mount. Even
// indexes are `/about` Links, odd indexes the param Link of the same row.
const sampledHrefs: ReadonlyArray<readonly [number, string]> = [
  [0, '/about'],
  [1, '/posts/1?page=1'],
  [2 * 41 + 1, '/posts/42?page=2'],
  [expectedLinkCount - 2, '/about'],
  [expectedLinkCount - 1, `/posts/${LINK_ROW_COUNT}?page=5`],
]

export function assertStepResult(stepIndex: number, container: HTMLElement) {
  const list = container.querySelector(`[data-testid="${linkListTestId}"]`)

  if (stepIndex === 1) {
    if (list !== null) {
      throw new Error('Expected the Link list to be unmounted')
    }
    return
  }

  const anchors = list?.querySelectorAll('a') ?? []
  if (anchors.length !== expectedLinkCount) {
    throw new Error(
      `Expected ${expectedLinkCount} mounted Links, received ${anchors.length}`,
    )
  }
  for (const [index, href] of sampledHrefs) {
    const actual = anchors[index]!.getAttribute('href')
    if (actual !== href) {
      throw new Error(
        `Expected Link ${index} to have href "${href}", received "${actual}"`,
      )
    }
  }
  if (list!.querySelector('a.active-link') !== null) {
    throw new Error('Expected no active Link on the index route')
  }
}

// One lap (a single mount/unmount cycle of 300 Links) per benchmark iteration.
// CodSpeed simulation ignores `benchOptions` and runs setup, the warm-up lap
// and one iteration 8 times within one test timeout; a lap keeps Vue's run
// well inside it.
export const ticksPerIteration = 2

export const benchOptions = {
  warmupIterations: 50,
  time: 8_000,
  throws: true,
}
