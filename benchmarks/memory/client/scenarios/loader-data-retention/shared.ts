import {
  createDeterministicRandom,
  randomSegment,
} from '#memory-client/bench-utils'
import {
  createBenchContainer,
  nextAnimationFrame,
  noop,
  removeBenchContainer,
  warnClientMemoryDevMode,
} from '#memory-client/lifecycle'
import type { Framework, MountTestApp } from '#memory-client/lifecycle'

type RenderEvent = {
  toLocation: {
    pathname: string
  }
}

type LoaderDataRouter = {
  load: () => Promise<void>
  navigate: (options: {
    to: '/page/$id'
    params: { id: string }
    replace: true
  }) => Promise<void>
  subscribe: (
    event: 'onRendered',
    listener: (event: RenderEvent) => void,
  ) => () => void
}

const loaderDataRetentionNavigationCount = 40
const loaderDataRetentionWarmupCount = loaderDataRetentionNavigationCount
const pageIds = createPageIds(loaderDataRetentionNavigationCount, 11, '')
const warmupPageIds = createPageIds(
  loaderDataRetentionWarmupCount,
  0x10ade2,
  'warmup-',
)

const uninitialized = () =>
  Promise.reject(
    new Error('loader-data-retention benchmark is not initialized'),
  )

function createPageIds(count: number, seed: number, prefix: string) {
  const random = createDeterministicRandom(seed)

  return Array.from(
    { length: count },
    (_, index) => `${prefix}${index}-${randomSegment(random)}`,
  )
}

export function createWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
  loaderPayloadRecordCount: number,
) {
  warnClientMemoryDevMode(framework)

  let container: HTMLDivElement | undefined = undefined
  let unmount = noop
  let unsub = noop
  let resolveRendered: () => void = noop
  let expectedRenderedPath: string | undefined = undefined
  let navigateTo: (id: string) => Promise<void> = uninitialized

  function assertRenderedShell() {
    const actual =
      container?.querySelector<HTMLElement>('[data-bench-page]')?.dataset
        .benchPage

    if (actual !== 'shell') {
      throw new Error(`Expected rendered shell page, got ${actual}`)
    }
  }

  function assertRenderedPage(id: string) {
    const page = container?.querySelector<HTMLElement>(
      '[data-bench-page="page"]',
    )
    const actualId = page?.dataset.benchId
    const actualCount = page?.dataset.benchCount
    const expectedCount = String(loaderPayloadRecordCount)

    if (actualId !== id || actualCount !== expectedCount) {
      throw new Error(
        `Expected rendered page ${id}:${expectedCount}, got ${actualId}:${actualCount}`,
      )
    }
  }

  async function waitForRenderedShell() {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        assertRenderedShell()
        return
      } catch {
        await nextAnimationFrame()
      }
    }

    assertRenderedShell()
  }

  function waitForNextRender(pathname: string) {
    expectedRenderedPath = pathname

    return new Promise<void>((resolve) => {
      resolveRendered = resolve
    })
  }

  async function before() {
    if (container) {
      after()
    }

    container = createBenchContainer()

    const mounted = mountTestApp(container)
    const router = mounted.router as LoaderDataRouter
    unmount = mounted.unmount

    unsub = router.subscribe('onRendered', (event) => {
      if (
        expectedRenderedPath &&
        event.toLocation.pathname !== expectedRenderedPath
      ) {
        return
      }

      const resolve = resolveRendered
      resolveRendered = noop
      expectedRenderedPath = undefined
      resolve()
    })

    navigateTo = async (id) => {
      const pathname = `/page/${id}`
      const rendered = waitForNextRender(pathname)

      await router.navigate({
        to: '/page/$id',
        params: { id },
        replace: true,
      })
      await rendered
      assertRenderedPage(id)
    }

    await router.load()
    await waitForRenderedShell()
  }

  function after() {
    unmount()
    removeBenchContainer(container)
    unsub()

    container = undefined
    unmount = noop
    unsub = noop
    resolveRendered = noop
    expectedRenderedPath = undefined
    navigateTo = uninitialized
  }

  async function runPageIds(ids: ReadonlyArray<string>) {
    for (const id of ids) {
      await navigateTo(id)
    }
  }

  return {
    name: `mem client loader-data-retention (${framework})`,
    before,
    navigate: (id: string) => navigateTo(id),
    run: () => runPageIds(pageIds),
    warmup: () => runPageIds(warmupPageIds),
    async sanity() {
      await before()

      try {
        assertRenderedShell()
        await navigateTo('sanity-a')
        assertRenderedPage('sanity-a')
      } finally {
        after()
      }
    },
    after,
  }
}
