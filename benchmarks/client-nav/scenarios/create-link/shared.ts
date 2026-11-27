/**
 * Shared definition of the `create-link` scenario: the cost of custom Links
 * made with `createLink`, the documented way to give a design-system
 * component router navigation. Each step synchronously mounts, re-renders or
 * unmounts a list of them on the index route, without navigating, so the work
 * is the custom Link's component layers, setup, update and teardown, not
 * route matching or loading.
 *
 * Every Link wraps a plain anchor component through `createLink`. Two shapes
 * cover both `buildLocation` paths: a plain `to="/about"` and a
 * `to="/posts/$postId"` Link with `params`, `search` and `activeProps`. The
 * re-render step changes only the list's own attribute, so every Link gets
 * new but equal props, including fresh inline `params` and `search` objects.
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

export const readyTestId = 'create-link-ready'
export const linkListTestId = 'link-list'
export const customLinkClass = 'custom-link'

/**
 * `hidden` removes the list. `mounted` renders it with revision 0 and
 * `rerendered` with revision 1, so moving between them re-renders the list
 * with equal Link props.
 */
export type LinkListState = 'hidden' | 'mounted' | 'rerendered'

/** Sets the index route's Link list state; resolves once rendered. */
export type SetLinkListState = (state: LinkListState) => void | Promise<void>

export const linkListRevision = (state: LinkListState) =>
  state === 'rerendered' ? 1 : 0

const stepStates: ReadonlyArray<LinkListState> = [
  'mounted',
  'rerendered',
  'hidden',
]

export function createScenarioSteps(
  setLinkListState: SetLinkListState,
): ReadonlyArray<ScenarioStep> {
  return stepStates.map((state) => ({
    type: 'run',
    run: () => setLinkListState(state),
  }))
}

// Anchor index -> expected href, checked after every warm-up step that
// renders the list. Even indexes are `/about` Links, odd indexes the param
// Link of the same row.
const sampledHrefs: ReadonlyArray<readonly [number, string]> = [
  [0, '/about'],
  [1, '/posts/1?page=1'],
  [2 * 41 + 1, '/posts/42?page=2'],
  [expectedLinkCount - 2, '/about'],
  [expectedLinkCount - 1, `/posts/${LINK_ROW_COUNT}?page=5`],
]

export function assertStepResult(stepIndex: number, container: HTMLElement) {
  const state = stepStates[stepIndex]!
  const list = container.querySelector<HTMLElement>(
    `[data-testid="${linkListTestId}"]`,
  )

  if (state === 'hidden') {
    if (list !== null) {
      throw new Error('Expected the Link list to be unmounted')
    }
    return
  }

  if (!list) {
    throw new Error('Expected the Link list to be mounted')
  }
  const revision = String(linkListRevision(state))
  if (list.dataset.revision !== revision) {
    throw new Error(
      `Expected Link list revision ${revision}, received ${list.dataset.revision}`,
    )
  }
  const anchors = list.querySelectorAll('a')
  if (anchors.length !== expectedLinkCount) {
    throw new Error(
      `Expected ${expectedLinkCount} mounted Links, received ${anchors.length}`,
    )
  }
  if (list.querySelectorAll(`a.${customLinkClass}`).length !== anchors.length) {
    throw new Error('Expected every Link to render the custom anchor component')
  }
  for (const [index, href] of sampledHrefs) {
    const actual = anchors[index]!.getAttribute('href')
    if (actual !== href) {
      throw new Error(
        `Expected Link ${index} to have href "${href}", received "${actual}"`,
      )
    }
  }
  if (list.querySelector('a.active-link') !== null) {
    throw new Error('Expected no active Link on the index route')
  }
}

// One lap (mount, re-render and unmount 300 Links) per benchmark iteration.
// CodSpeed simulation ignores `benchOptions` and runs setup, the warm-up lap
// and one iteration 8 times within one test timeout; a lap stays comparable
// to `link-mount`'s.
export const ticksPerIteration = stepStates.length

export const benchOptions = {
  warmupIterations: 50,
  time: 8_000,
  throws: true,
}
