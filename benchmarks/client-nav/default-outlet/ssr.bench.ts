import { bench, describe } from 'vitest'
import { outletCases } from './cases'
import type * as App from './src/ssr'

const appUrl = new URL('./dist/ssr/app.js', import.meta.url).href
const app: typeof App = await import(/* @vite-ignore */ appUrl)
if (app.serverEnvironment !== true) {
  throw new Error(
    'Default Outlet SSR benchmarks require a production server build',
  )
}

const states = ['first', 'second', 'empty'] as const
const workloads = outletCases.filter((entry) => entry.boundaries)
const expectedHtml = await Promise.all(
  states.map(async (state) => {
    const prepared = await app.createPreparedScenario(workloads[0]!, state)
    try {
      const html = prepared.render()
      prepared.check(html)
      return html
    } finally {
      prepared.dispose()
    }
  }),
)

for (const workload of workloads) {
  describe(workload.id, () => {
    let prepared: Array<
      Awaited<ReturnType<typeof app.createPreparedScenario>>
    > = []
    let html: Array<string> = []
    function check() {
      for (const [index, scenario] of prepared.entries()) {
        scenario.check(html[index]!)
        const repeated = scenario.render()
        scenario.check(repeated)
        if (html[index] !== expectedHtml[index] || repeated !== html[index]) {
          throw new Error(
            'Outlet modes and repeated renders must produce identical HTML',
          )
        }
      }
    }
    bench(
      `default Outlet SSR render only: ${workload.id}`,
      () => {
        for (let lap = 0; lap < 4; lap++) {
          for (const [index, scenario] of prepared.entries()) {
            html[index] = scenario.render()
          }
        }
      },
      {
        warmupIterations: 100,
        warmupTime: 1_000,
        time: 5_000,
        throws: true,
        async setup() {
          prepared = []
          html = []
          try {
            for (const state of states) {
              const scenario = await app.createPreparedScenario(workload, state)
              prepared.push(scenario)
              html.push(scenario.render())
            }
            check()
          } catch (error) {
            for (const scenario of prepared) {
              scenario.dispose()
            }
            throw error
          }
        },
        teardown() {
          try {
            check()
          } finally {
            for (const scenario of prepared) {
              scenario.dispose()
            }
            prepared = []
            html = []
          }
        },
      },
    )
  })
}
