import type * as App from './src/main'

const appModulePath = './dist/app.js'
const app: typeof App = await import(/* @vite-ignore */ appModulePath)
if (app.serverEnvironment !== false) {
  throw new Error(
    'Link reactivity benchmarks require a production client build',
  )
}

export function setup(reactiveCount: number) {
  let container: HTMLElement
  let mounted: Awaited<ReturnType<typeof app.mountTestApp>> | undefined
  let anchors: Array<HTMLAnchorElement>

  function assertOutput() {
    if (!mounted) {
      throw new Error('Link reactivity app must be mounted')
    }
    const current = Array.from(
      container.querySelectorAll<HTMLAnchorElement>('a[data-reactive-link]'),
    )
    if (current.length !== app.linkCount || mounted.gridRenderCount() !== 1) {
      throw new Error('Ref updates must preserve the grid and its 200 Links')
    }
    for (let index = 0; index < current.length; index++) {
      const value = index < reactiveCount ? mounted.currentValue() : 0
      const expected = `/items/item-${index}?value=${value}`
      if (
        current[index] !== anchors[index] ||
        current[index]!.getAttribute('href') !== expected
      ) {
        throw new Error(
          `Link ${index} must retain its node and href ${expected}`,
        )
      }
    }
    if (
      mounted.router.state.location.href !== '/' ||
      mounted.router.history.length !== 1
    ) {
      throw new Error('Reactive Link updates must not navigate')
    }
  }

  function cleanup() {
    mounted?.unmount()
    mounted = undefined
    container.remove()
    anchors = []
  }

  return {
    async before() {
      container = document.createElement('div')
      document.body.appendChild(container)
      try {
        mounted = await app.mountTestApp(container, reactiveCount)
        anchors = Array.from(
          container.querySelectorAll<HTMLAnchorElement>(
            'a[data-reactive-link]',
          ),
        )
        assertOutput()
        // Verify both update directions before timing starts.
        await mounted.tick()
        assertOutput()
        await mounted.tick()
        assertOutput()
      } catch (error) {
        cleanup()
        throw error
      }
    },
    tick: () => mounted!.tick(),
    after() {
      try {
        assertOutput()
      } finally {
        cleanup()
      }
    },
  }
}
