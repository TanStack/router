'use client'

import * as React from 'react'
import { Matches } from './Matches'
import { Link } from './link'
import { RouteLinkProvider } from './routeLink'
import { RouterContextProviderBase } from './routerContextProvider'
import { RouterRendererProvider } from './routerRenderer'
import { ErrorComponent } from './CatchBoundary'
import { DefaultGlobalNotFound } from './not-found'
import { ScrollRestoration } from './scroll-restoration'
import type { AnyRouter, RegisteredRouter } from '@tanstack/router-core'
import type { RouterProps } from './routerContextProvider'

const defaultRouterRenderer = {
  errorComponent: ErrorComponent,
  notFoundComponent: DefaultGlobalNotFound,
  scrollRestorationComponent: ScrollRestoration,
}

/**
 * Low-level provider that places the router into React context and optionally
 * updates router options from props. Most apps should use `RouterProvider`.
 */
export function RouterContextProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({
  router,
  children,
  ...rest
}: RouterProps<TRouter, TDehydrated> & {
  children: React.ReactNode
}) {
  return (
    <RouterRendererProvider renderer={defaultRouterRenderer}>
      <RouteLinkProvider component={Link}>
        <RouterContextProviderBase router={router} {...rest}>
          {children}
        </RouterContextProviderBase>
      </RouteLinkProvider>
    </RouterRendererProvider>
  )
}

/**
 * Top-level component that renders the active route matches and provides the
 * router to the React tree via context.
 *
 * Accepts the same options as `createRouter` via props to update the router
 * instance after creation.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction
 */
export function RouterProvider<
  TRouter extends AnyRouter = RegisteredRouter,
  TDehydrated extends Record<string, any> = Record<string, any>,
>({ router, ...rest }: RouterProps<TRouter, TDehydrated>) {
  return (
    <RouterContextProvider router={router} {...rest}>
      <Matches />
    </RouterContextProvider>
  )
}

export type { RouterProps } from './routerContextProvider'
