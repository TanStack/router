import { Fragment } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { setupCoreRouterSsrQueryIntegration } from '@tanstack/router-ssr-query-core'
import type { RouterSsrQueryOptions } from '@tanstack/router-ssr-query-core'
import type { AnyRouter } from '@tanstack/react-router'

export type Options<TRouter extends AnyRouter> =
  RouterSsrQueryOptions<TRouter> & {
    WrapProvider?: (props: { children: any }) => React.JSX.Element
  }

export function setupRouterSsrQueryIntegration<TRouter extends AnyRouter>(
  opts: Options<TRouter>,
) {
  setupCoreRouterSsrQueryIntegration(opts)

  const OGWrap = opts.router.options.Wrap || Fragment
  const OuterWrapper = opts.WrapProvider || Fragment

  opts.router.options.Wrap = ({ children }) => {
      return (
        <OuterWrapper>
          <QueryClientProvider client={opts.queryClient}>
            <OGWrap>{children}</OGWrap>
          </QueryClientProvider>
        </OuterWrapper>
      )
  }
}
