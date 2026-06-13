import {
  createDeterministicRandom,
  randomSegment,
} from '#memory-client/bench-utils'

type Framework = 'react' | 'solid' | 'vue'

type MountedApp = {
  router: unknown
  unmount: () => void
}

type MountTestApp = (container: HTMLDivElement) => MountedApp

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

const frameworkNames = {
  react: 'React',
  solid: 'Solid',
  vue: 'Vue',
} satisfies Record<Framework, string>
const loaderDataRetentionNavigationCount = 20
const pageIds = createPageIds()

const uninitialized = () =>
  Promise.reject(
    new Error('loader-data-retention benchmark is not initialized'),
  )

function warnDevMode(framework: Framework) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `memory client benchmark is running without NODE_ENV=production; ${frameworkNames[framework]} dev overhead will dominate results.`,
    )
  }
}

function createPageIds() {
  const random = createDeterministicRandom(11)

  return Array.from(
    { length: loaderDataRetentionNavigationCount },
    (_, index) => `${index}-${randomSegment(random)}`,
  )
}

export function createWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
  loaderPayloadRecordCount: number,
) {
  warnDevMode(framework)

  let container: HTMLDivElement | undefined = undefined
  let unmount: (() => void) | undefined = undefined
  let unsub = () => {}
  let resolveRendered: () => void = () => {}
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
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve())
        })
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

    container = document.createElement('div')
    document.body.append(container)

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
      resolveRendered = () => {}
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
    unmount?.()
    container?.remove()
    unsub()

    container = undefined
    unmount = undefined
    unsub = () => {}
    resolveRendered = () => {}
    expectedRenderedPath = undefined
    navigateTo = uninitialized
  }

  return {
    name: `mem loader-data-retention (${framework})`,
    before,
    navigate: (id: string) => navigateTo(id),
    async run() {
      for (const id of pageIds) {
        await navigateTo(id)
      }
    },
    async sanity() {
      await before()

      try {
        await navigateTo('sanity-a')
        assertRenderedPage('sanity-a')
        await navigateTo('sanity-b')
        assertRenderedPage('sanity-b')
      } finally {
        after()
      }
    },
    after,
  }
}
