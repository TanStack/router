import type * as App from './src/app'

const appModulePath = './dist/app.js'
const { mountTestApp } = (await import(
  /* @vite-ignore */ appModulePath
)) as typeof App
const mountUnmountIterations = 100

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

export function setup() {
  if (process.env.NODE_ENV !== 'production') {
    console.warn(
      'memory client benchmark is running without NODE_ENV=production; React dev overhead will dominate results.',
    )
  }

  async function cycle() {
    const container = document.createElement('div')
    document.body.append(container)

    let unmount = () => {}
    let unsubscribe = () => {}

    try {
      const mounted = mountTestApp(container)
      const { router } = mounted
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
    name: 'mem mount-unmount (react)',
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
