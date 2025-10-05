import * as React from 'react'
import { isRedirect, useRouter } from '@tanstack/react-router'

type AwaitedReturn<T extends (...args: Array<any>) => Promise<any>> = Awaited<
  ReturnType<T>
>

type UseServerFnReturn<T extends (...args: Array<any>) => Promise<any>> =
  Parameters<T> extends []
    ? () => Promise<AwaitedReturn<T>>
    : Parameters<T> extends [infer TVariables]
      ? (variables: TVariables) => Promise<AwaitedReturn<T>>
      : (...args: Parameters<T>) => Promise<AwaitedReturn<T>>

export function useServerFn<T extends (...deps: Array<any>) => Promise<any>>(
  serverFn: T,
): UseServerFnReturn<T> {
  const router = useRouter()

  const handler = React.useCallback(
    async (...args: Parameters<T>) => {
      try {
        const res = await serverFn(...args)

        if (isRedirect(res)) {
          throw res
        }

        return res as AwaitedReturn<T>
      } catch (err) {
        if (isRedirect(err)) {
          err.options._fromLocation = router.state.location
          return router.navigate(
            router.resolveRedirect(err).options,
          ) as AwaitedReturn<T>
        }

        throw err
      }
    },
    [router, serverFn],
  )

  return handler as UseServerFnReturn<T>
}
