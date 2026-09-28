import { RouterProvider } from '@tanstack/react-router'
import { isServer } from '@tanstack/router-core/isServer'
import { createRoot } from 'react-dom/client'
import { assertScenario, isOutgoingCase } from '../cases'
import { assertStateUpdates, createLinkRouter, sourceOptions } from './workload'
import type { LinkRouter } from './workload'
import type { RouterHistory } from '@tanstack/history'
import type { LinkCaseId } from '../cases'

export const serverEnvironment: boolean | undefined = isServer

export function mountTestApp(
  container: HTMLElement,
  history: RouterHistory,
  caseId: LinkCaseId,
): {
  router: LinkRouter
  unmount: () => void
  assertStateUpdates: () => void
  verifyOutgoing: () => Promise<void>
} {
  const router = createLinkRouter(caseId, history, false)
  const root = createRoot(container)
  root.render(<RouterProvider router={router} />)

  return {
    router,
    unmount: () => root.unmount(),
    assertStateUpdates: () => assertStateUpdates(router),
    async verifyOutgoing() {
      if (!isOutgoingCase(caseId)) {
        return
      }
      const anchors = [...container.querySelectorAll('a[data-perf-link]')]
      let release!: () => void
      router.options.context.departure = new Promise<void>((resolve) => {
        release = resolve
      })
      const navigation = router.navigate({
        ...sourceOptions(caseId, 1),
        replace: true,
      })
      try {
        // This check is outside measurement. Both revisions must publish live
        // hrefs on the still-mounted owner, independently of active styling.
        for (let attempt = 0; ; attempt++) {
          try {
            assertScenario(caseId, 1, container, true)
            break
          } catch (error) {
            if (attempt === 99) {
              throw error
            }
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
          }
        }
        const current = container.querySelectorAll('a[data-perf-link]')
        if (anchors.some((anchor, index) => current[index] !== anchor)) {
          throw new Error(
            'Outgoing Links must stay mounted until the loader resolves',
          )
        }
      } finally {
        router.options.context.departure = undefined
        release()
        await navigation
      }
      assertScenario(caseId, 1, container)
      await router.navigate({ ...sourceOptions(caseId, 0), replace: true })
      assertScenario(caseId, 0, container)
    },
  }
}
