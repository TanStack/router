import { Fragment } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { AnyRouter } from '@tanstack/react-router'
import {
  RouterSsrQueryOptions,
  setupCoreRouterSsrQueryIntegration,
} from '@tanstack/router-ssr-query-core'

export type Options<TRouter extends AnyRouter> =
  RouterSsrQueryOptions<TRouter> & {
    WrapProvider?: (props: { children: any }) => React.JSX.Element
  }

export function setupRouterSsrQueryIntegration<TRouter extends AnyRouter>(
  opts: Options<TRouter>,
) {
  setupCoreRouterSsrQueryIntegration(opts)

  const ogOptions = opts.router.options

  opts.router.options = {
    ...ogOptions,
    Wrap: ({ children }) => {
      const OuterWrapper = opts?.WrapProvider || Fragment
      const OGWrap = ogOptions.Wrap || Fragment
      return (
        <OuterWrapper>
          <QueryClientProvider client={opts.queryClient}>
            <OGWrap>{children}</OGWrap>
          </QueryClientProvider>
        </OuterWrapper>
      )
    },
  }
}
