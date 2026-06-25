import type { AnyRouter } from '@tanstack/router-core'
import type { ClientNavWorkload } from '#client-nav/benchmark'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
  type Framework,
  type MountedTestApp,
} from '#client-nav/lifecycle'
import {
  assertAllBeforeLoadLevels,
  assertBeforeLoadLevelsAdvanced,
  beforeLoadContextActions,
  cloneBeforeLoadCounters,
  initialTaskTarget,
  makeTaskChain,
  type BeforeLoadCounters,
  type TaskRouteTarget,
} from './shared'

export interface MountedBeforeLoadContextApp<
  TRouter extends AnyRouter = AnyRouter,
> extends MountedTestApp<TRouter> {
  setRootSeed: (seed: number) => number
  getRootVersion: () => number
  getBeforeLoadCounters: () => BeforeLoadCounters
}

export type BeforeLoadContextMountTestApp<
  TRouter extends AnyRouter = AnyRouter,
> = (container: HTMLDivElement) => MountedBeforeLoadContextApp<TRouter>

const taskRoute = '/app/$orgId/projects/$projectId/tasks/$taskId'

export function createBeforeLoadContextWorkload<TRouter extends AnyRouter>(
  framework: Framework,
  mountTestApp: BeforeLoadContextMountTestApp<TRouter>,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  let mounted: MountedBeforeLoadContextApp<TRouter> | undefined = undefined
  let currentTarget = initialTaskTarget

  const lifecycle = createClientNavLifecycle<TRouter>({
    mountTestApp(container) {
      mounted = mountTestApp(container)
      return mounted
    },
  })

  function getMounted() {
    if (!mounted) {
      throw new Error('before-load-context app is not mounted')
    }

    return mounted
  }

  function getTaskMarker() {
    return lifecycle
      .getContainer()
      .querySelector<HTMLElement>('[data-bench-task="detail"]')
  }

  function markerMatches(target: TaskRouteTarget, contextVersion?: number) {
    const marker = getTaskMarker()

    if (!marker) {
      return false
    }

    const expectedVersion =
      contextVersion === undefined ? undefined : `${contextVersion}`

    return (
      marker.dataset.orgId === target.orgId &&
      marker.dataset.projectId === target.projectId &&
      marker.dataset.taskId === target.taskId &&
      marker.dataset.taskChain === makeTaskChain(target) &&
      (expectedVersion === undefined ||
        marker.dataset.contextVersion === expectedVersion)
    )
  }

  function assertTaskMarker(target: TaskRouteTarget, contextVersion?: number) {
    if (!markerMatches(target, contextVersion)) {
      const marker = getTaskMarker()
      const actual = marker
        ? `${marker.dataset.orgId}/${marker.dataset.projectId}/${marker.dataset.taskId}/${marker.dataset.contextVersion}`
        : 'missing marker'
      const expectedVersion =
        contextVersion === undefined ? '*' : `${contextVersion}`

      throw new Error(
        `Expected task marker ${makeTaskChain(target)}/${expectedVersion}, got ${actual}`,
      )
    }
  }

  async function waitForTaskMarker(
    target: TaskRouteTarget,
    contextVersion?: number,
  ) {
    await lifecycle.waitForCounter(
      () => (markerMatches(target, contextVersion) ? 1 : 0),
      1,
      {
        label: `task marker ${makeTaskChain(target)}`,
      },
    )
  }

  async function navigateToTarget(target: TaskRouteTarget) {
    await lifecycle.navigate({
      to: taskRoute,
      params: target,
      replace: true,
    })
    currentTarget = target
  }

  async function invalidateRootContext(rootSeed: number) {
    const controls = getMounted()
    const beforeCounters = cloneBeforeLoadCounters(
      controls.getBeforeLoadCounters(),
    )
    const expectedVersion = controls.setRootSeed(rootSeed)

    await lifecycle.waitForPromise(
      lifecycle.getRouter().invalidate({ sync: true }),
      {
        label: 'router.invalidate({ sync: true })',
      },
    )
    assertBeforeLoadLevelsAdvanced(
      beforeCounters,
      controls.getBeforeLoadCounters(),
      'router.invalidate()',
    )
    await waitForTaskMarker(currentTarget, expectedVersion)
  }

  async function runAction() {
    for (const action of beforeLoadContextActions) {
      if (action.type === 'navigate') {
        await navigateToTarget(action.target)
      } else {
        await invalidateRootContext(action.rootSeed)
      }
    }
  }

  async function before() {
    mounted = undefined
    currentTarget = initialTaskTarget

    await lifecycle.before()
    await waitForTaskMarker(initialTaskTarget, getMounted().getRootVersion())
  }

  async function after() {
    try {
      await lifecycle.after()
    } finally {
      mounted = undefined
      currentTarget = initialTaskTarget
    }
  }

  async function sanity() {
    await before()

    try {
      const controls = getMounted()
      assertAllBeforeLoadLevels(
        controls.getBeforeLoadCounters(),
        'initial load',
      )

      const firstNavigation = beforeLoadContextActions.find(
        (action) => action.type === 'navigate',
      )

      if (!firstNavigation || firstNavigation.type !== 'navigate') {
        throw new Error('before-load-context has no navigation sanity action')
      }

      await navigateToTarget(firstNavigation.target)
      assertTaskMarker(firstNavigation.target, controls.getRootVersion())

      const beforeCounters = cloneBeforeLoadCounters(
        controls.getBeforeLoadCounters(),
      )
      const expectedVersion = controls.setRootSeed(0x5a17a1)

      await lifecycle.waitForPromise(
        lifecycle.getRouter().invalidate({ sync: true }),
        {
          label: 'sanity router.invalidate({ sync: true })',
        },
      )
      assertBeforeLoadLevelsAdvanced(
        beforeCounters,
        controls.getBeforeLoadCounters(),
        'sanity invalidate',
      )
      await waitForTaskMarker(firstNavigation.target, expectedVersion)
      assertTaskMarker(firstNavigation.target, expectedVersion)
    } finally {
      await after()
    }
  }

  return {
    name: `client before-load context loop (${framework})`,
    before,
    run: runAction,
    sanity,
    after,
  }
}
