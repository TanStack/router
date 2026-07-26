import { isRedirect, useRouter } from '@tanstack/octane-router'

export function useServerFn<T extends (...deps: Array<any>) => Promise<any>>(
  serverFn: T,
): (...args: Parameters<T>) => ReturnType<T> {
  const router = useRouter()

  return (async (...args: Array<any>) => {
    try {
      const response = await serverFn(...args)

      if (isRedirect(response)) {
        throw response
      }

      return response
    } catch (error) {
      if (isRedirect(error)) {
        error.options._fromLocation = router.stores.location.get()
        return router.navigate(router.resolveRedirect(error).options)
      }

      throw error
    }
  }) as (...args: Parameters<T>) => ReturnType<T>
}
