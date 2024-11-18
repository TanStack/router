import { renderHook } from '@testing-library/react'
import React from 'react'
import { describe, expect, test } from 'vitest'

import { RouterProvider, createRootRoute, createRouter } from '../src'

/**
 * This test is to ensure that when using renderHook a rerender should trigger a rerender of the hook
 * If this is not the case, then rerender of hooks that use tanstack router will not be possible.
 */
describe('Rerender tests', () => {
  test('when using renderHook a rerender should trigger a rerender of the hook', () => {
    
    /**
     * This hook is used to determine if the component is being rendered for the first time
     * In production code this test would do the opposite, it would ensure a rerender would not do any state changes.
     * 
     * @returns {isFirst: boolean}
     */
    const useIsFirstRender = () => {
      const renderRef = React.useRef(true)

      if (renderRef.current === true) {
        renderRef.current = false
        return { isFirst: true }
      }

      return { isFirst: renderRef.current }
    }

    const RouterContainer = ({ children }: { children: React.ReactNode }) => {
      const TestComponent = React.useMemo(
        () => () => {
          return <>{children}</>
        },
        [children],
      )

      const componentRef = React.useRef(TestComponent)
      componentRef.current = TestComponent

      const routeTree = React.useMemo(() => {
        const rootRoute = createRootRoute({
          component: () => componentRef.current(),
        })
        return rootRoute
      }, [])

      const router = React.useMemo(
        () =>
          createRouter({
            routeTree: routeTree,
          }),
        [routeTree],
      )
      return <RouterProvider router={router} />
    }

    const { result, rerender } = renderHook(() => useIsFirstRender(), {
      wrapper: RouterContainer,
    })

    expect(result.current).toBeTruthy()
    expect(result.current.isFirst).toBeTruthy()
    rerender()

    expect(result.current.isFirst).toBeFalsy()
  })
})
