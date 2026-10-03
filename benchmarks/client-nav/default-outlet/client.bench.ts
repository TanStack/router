import { afterEach, beforeEach, bench, describe } from 'vitest'
import { createScenarioSetup } from '../scenarios/harness'
import { assertStepResult, outletCases, steps } from './cases'
import type * as App from './src/client'

const appModulePath = './dist/app.js'
const app: typeof App = await import(/* @vite-ignore */ appModulePath)
if (app.serverEnvironment !== false) {
  throw new Error('Default Outlet benchmarks require a production client build')
}

for (const workload of outletCases.filter((entry) => entry.boundaries)) {
  describe(`${workload.id}-pending`, () => {
    let mounted: ReturnType<typeof app.mountTestApp> | undefined
    let container: HTMLElement | undefined
    let pendingCommits = 0
    async function bounded(task: Promise<void>) {
      let timeout: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          task,
          new Promise<never>((_, reject) => {
            timeout = setTimeout(() => {
              const matches = mounted?.router.state.matches.map(
                (match) => `${match.routeId}:${match.status}`,
              )
              reject(
                new Error(
                  `Pending smoke timed out: ${matches?.join(',')}; DOM: ${container?.textContent}`,
                ),
              )
            }, 5_000)
          }),
        ])
      } finally {
        clearTimeout(timeout)
      }
    }
    const scenario = createScenarioSetup({
      frameworkLabel: 'React',
      mount: (element, history) => {
        container = element
        mounted = app.mountTestApp(element, history, workload, true)
        pendingCommits = 0
        return mounted
      },
      steps: [
        {
          type: 'click',
          testId: 'leaf-first',
          isSettled: () =>
            container?.querySelector('[data-testid="leaf-state"]')
              ?.textContent === 'first',
        },
        'home',
      ],
      assertAfterStep: (index, element) => {
        assertStepResult(index === 0 ? 0 : 3, element)
        if (index === 0) {
          const commits = mounted!.readPendingCommits()
          if (commits <= pendingCommits) {
            throw new Error('Pending UI must commit before the loader resolves')
          }
          pendingCommits = commits
          if (element.querySelector('[data-testid="pending-state"]')) {
            throw new Error('Pending UI must disappear after success')
          }
        }
      },
    })
    const setup = () => bounded(scenario.before())
    beforeEach(setup)
    afterEach(scenario.after)
    bench(
      `default Outlet pending to success smoke: ${workload.id}`,
      async () => {
        for (let index = 0; index < 2; index++) {
          await bounded(scenario.tick())
        }
        await scenario.finishBatch()
      },
      {
        warmupIterations: 2,
        warmupTime: 0,
        iterations: 3,
        time: 1_000,
        throws: true,
        setup,
        teardown: scenario.after,
      },
    )
  })
}

for (const workload of outletCases) {
  describe(workload.id, () => {
    let mounted: ReturnType<typeof app.mountTestApp> | undefined
    let reportedFibers = false
    const scenario = createScenarioSetup({
      frameworkLabel: 'React',
      mount: (container, history) => {
        mounted = app.mountTestApp(container, history, workload)
        return mounted
      },
      steps,
      assertAfterStep: (index, container) => {
        assertStepResult(index, container)
        if (!reportedFibers && index === 0) {
          console.info(
            `${workload.id}: ${mounted!.readFiberCount()} committed fibers`,
          )
          reportedFibers = true
        }
      },
    })
    beforeEach(scenario.before)
    afterEach(scenario.after)

    bench(
      `default Outlet navigation: ${workload.id}`,
      async () => {
        for (let index = 0; index < steps.length * 4; index++) {
          await scenario.tick()
        }
        await scenario.finishBatch()
      },
      {
        warmupIterations: 100,
        warmupTime: 1_000,
        time: 5_000,
        throws: true,
        setup: scenario.before,
        teardown: scenario.after,
      },
    )
  })
}
