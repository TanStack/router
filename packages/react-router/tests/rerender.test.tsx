import React from 'react'
import { afterEach, beforeEach, describe, expect, it, test, vi } from 'vitest'
import {
  cleanup,
  configure,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'

import {
  Link,
  Outlet,
  RouterProvider,
  createLink,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouteMask,
  createRouter,
  redirect,
  useLoaderData,
  useMatchRoute,
  useParams,
  useRouteContext,
  useRouterState,
  useSearch,
} from '../src'
import { useDebugger } from '../src/debugger'


describe('Rerender tests', () => {
  test('when using renderHook it returns a hook with same content to prove rerender works', async () => {
    const useIsFirstRender = () => {
      useDebugger({});
      const renderRef = React.useRef(true);
    
      if (renderRef.current === true) {
        renderRef.current = false;
        return {isFirst: true};
      }
    
      return {isFirst: renderRef.current};
    };

    let childrenContainer = <></>;
    
    
    const rootRoute = createRootRoute()
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => childrenContainer,
    })
    const routeTree = rootRoute.addChildren([indexRoute])
    
    const router = createRouter({
      routeTree: routeTree,
    })
    const RouterContainer = ({ children }: { children: React.ReactNode }) => {
      if (React.isValidElement(children)) {
        childrenContainer = children;
      }
      useDebugger({});
      return <RouterProvider router={router} />;
    };

    const { result, rerender } = renderHook(
      () => useIsFirstRender(),
      { wrapper: RouterContainer },
    )
    console.log("calling rerender first time")
    rerender();

    expect(result.current).toBeTruthy()
    expect(result.current.isFirst).toBeTruthy()
    console.log("calling rerender second time")
    rerender();
    expect(result.current.isFirst).toBeFalsy()
  })
})
