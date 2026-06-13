type Framework = 'react' | 'solid' | 'vue'
type Target = '/a' | '/b'

type MountedApp = {
  router: unknown
  unmount: () => void
}

type MountTestApp = (container: HTMLDivElement) => MountedApp

type NavigationRouter = {
  load: () => Promise<void>
  navigate: (options: { to: Target; replace: true }) => Promise<void>
  subscribe: (event: 'onRendered', listener: () => void) => () => void
}

const frameworkNames = {
  react: 'React',
  solid: 'Solid',
  vue: 'Vue',
} satisfies Record<Framework, string>
const navigationChurnIterations = 300

const uninitialized = () =>
  Promise.reject(new Error('navigation-churn benchmark is not initialized'))

function warnDevMode(framework: Framework) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `memory client benchmark is running without NODE_ENV=production; ${frameworkNames[framework]} dev overhead will dominate results.`,
    )
  }
}

export function createSetup(framework: Framework, mountTestApp: MountTestApp) {
  warnDevMode(framework)

  let container: HTMLDivElement | undefined = undefined
  let unmount: (() => void) | undefined = undefined
  let unsub = () => {}
  let resolveRendered: () => void = () => {}
  let navigateTo: (target: Target) => Promise<void> = uninitialized

  function assertRenderedPage(target: Target) {
    const expected = target.slice(1)
    const actual =
      container?.querySelector<HTMLElement>('[data-bench-page]')?.dataset
        .benchPage

    if (actual !== expected) {
      throw new Error(`Expected rendered page ${expected}, got ${actual}`)
    }
  }

  async function waitForRenderedPage(target: Target) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        assertRenderedPage(target)
        return
      } catch {
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve())
        })
      }
    }

    assertRenderedPage(target)
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

    navigateTo = async (target) => {
      const rendered = waitForNextRender()
      await Promise.all([
        router.navigate({
          to: target,
          replace: true,
        }),
        rendered,
      ])
    }

    await router.load()
    await waitForRenderedPage('/a')
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
    name: `mem navigation-churn (${framework})`,
    before,
    navigate: (target: Target) => navigateTo(target),
    async run() {
      for (let index = 0; index < navigationChurnIterations; index++) {
        await navigateTo(index % 2 === 0 ? '/b' : '/a')
      }
    },
    async sanity() {
      await before()

      try {
        assertRenderedPage('/a')
        await navigateTo('/b')
        assertRenderedPage('/b')
      } finally {
        after()
      }
    },
    after,
  }
}
