import {
  createDeterministicRandom,
  randomSegment,
} from '#memory-client/bench-utils'

type Framework = 'react' | 'solid' | 'vue'

type ItemLocation = {
  id: string
  q: string
}

type MountedApp = {
  router: unknown
  unmount: () => void
}

type MountTestApp = (container: HTMLDivElement) => MountedApp

type NavigationRouter = {
  load: () => Promise<void>
  navigate: (options: {
    to: '/items/$id'
    params: { id: string }
    search: { q: string }
    replace: true
  }) => Promise<void>
  subscribe: (event: 'onRendered', listener: () => void) => () => void
}

const frameworkNames = {
  react: 'React',
  solid: 'Solid',
  vue: 'Vue',
} satisfies Record<Framework, string>
const uniqueLocationChurnIterations = 300
// Module-level so ids stay unique across runner invocations on one mount; the
// counter prefix removes any residual LCG birthday-collision risk.
const benchmarkRandom = createDeterministicRandom(0xdecafbad)
let locationCounter = 0

const uninitialized = () =>
  Promise.reject(
    new Error('unique-location-churn benchmark is not initialized'),
  )

function warnDevMode(framework: Framework) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `memory client benchmark is running without NODE_ENV=production; ${frameworkNames[framework]} dev overhead will dominate results.`,
    )
  }
}

export function createWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
) {
  warnDevMode(framework)

  let container: HTMLDivElement | undefined = undefined
  let unmount: (() => void) | undefined = undefined
  let unsub = () => {}
  let resolveRendered: () => void = () => {}
  let navigateTo: (location: ItemLocation) => Promise<void> = uninitialized

  function assertRenderedId(expected: string) {
    const actual =
      container?.querySelector<HTMLElement>('[data-bench-id]')?.dataset.benchId

    if (actual !== expected) {
      throw new Error(`Expected rendered item id ${expected}, got ${actual}`)
    }
  }

  async function waitForRenderedId(expected: string) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        assertRenderedId(expected)
        return
      } catch {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve())
        })
      }
    }

    assertRenderedId(expected)
  }

  function waitForNextRender() {
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
    const router = mounted.router as NavigationRouter
    unmount = mounted.unmount

    unsub = router.subscribe('onRendered', () => {
      resolveRendered()
    })

    navigateTo = async (location) => {
      const rendered = waitForNextRender()
      await Promise.all([
        router.navigate({
          to: '/items/$id',
          params: { id: location.id },
          search: { q: location.q },
          replace: true,
        }),
        rendered,
      ])
    }

    await router.load()
    await waitForRenderedId('initial')
  }

  function after() {
    unmount?.()
    container?.remove()
    unsub()

    container = undefined
    unmount = undefined
    unsub = () => {}
    resolveRendered = () => {}
    navigateTo = uninitialized
  }

  return {
    name: `mem unique-location-churn (${framework})`,
    before,
    navigate: (location: ItemLocation) => navigateTo(location),
    async run() {
      for (let index = 0; index < uniqueLocationChurnIterations; index++) {
        const id = `${(locationCounter++).toString(36)}-${randomSegment(benchmarkRandom)}`
        const q = `q-${randomSegment(benchmarkRandom)}`

        await navigateTo({ id, q })
      }
    },
    async sanity() {
      await before()

      try {
        await navigateTo({ id: 'sanity-one', q: 'q-sanity-one' })
        assertRenderedId('sanity-one')
        await navigateTo({ id: 'sanity-two', q: 'q-sanity-two' })
        assertRenderedId('sanity-two')
      } finally {
        after()
      }
    },
    after,
  }
}
