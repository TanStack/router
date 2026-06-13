type Framework = 'react' | 'solid' | 'vue'

type MountedApp = {
  router: unknown
  unmount: () => void
}

type MountTestApp = (container: HTMLDivElement) => MountedApp

type RenderRouter = {
  load: () => Promise<void>
  subscribe: (event: 'onRendered', listener: () => void) => () => void
}

const frameworkNames = {
  react: 'React',
  solid: 'Solid',
  vue: 'Vue',
} satisfies Record<Framework, string>
const mountUnmountIterations = 100

function warnDevMode(framework: Framework) {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      `memory client benchmark is running without NODE_ENV=production; ${frameworkNames[framework]} dev overhead will dominate results.`,
    )
  }
}

function drainMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve())
}

function assertEmptyBody() {
  if (document.body.childNodes.length !== 0) {
    throw new Error(
      `Expected document.body to be empty, found ${document.body.childNodes.length} child node(s)`,
    )
  }
}

export function createWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
) {
  warnDevMode(framework)

  async function cycle() {
    const container = document.createElement('div')
    document.body.append(container)

    let unmount = () => {}
    let unsubscribe = () => {}

    try {
      const mounted = mountTestApp(container)
      const router = mounted.router as RenderRouter
      unmount = mounted.unmount

      const rendered = new Promise<void>((resolve) => {
        unsubscribe = router.subscribe('onRendered', () => {
          resolve()
        })
      })

      await router.load()
      await rendered
      unsubscribe()
      unsubscribe = () => {}
    } finally {
      unmount()
      container.remove()
      unsubscribe()
      await drainMicrotasks()
    }
  }

  return {
    name: `mem mount-unmount (${framework})`,
    cycle,
    async run() {
      for (let index = 0; index < mountUnmountIterations; index++) {
        await cycle()
      }
    },
    async sanity() {
      assertEmptyBody()
      await cycle()
      await cycle()
      assertEmptyBody()
    },
  }
}
