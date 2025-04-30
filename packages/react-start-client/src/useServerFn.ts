import { isRedirect } from '@tanstack/router-core'
import { useRouter } from '@tanstack/react-router'

export function useServerFn<T extends (...deps: Array<any>) => Promise<any>>(
  serverFn: T,
): (...args: Parameters<T>) => ReturnType<T> {
  const router = useRouter()

  return (async (...args: Array<any>) => {
    try {
      const res = await serverFn(...args)

      if (isRedirect(res)) {
        throw res
      }

      return res
    } catch (err) {
      if (isRedirect(err)) {
        err.options._fromLocation = router.state.location
        return router.navigate(router.resolveRedirect(err).options)
      }

      throw err
    }
  }) as any
}
