import { isRedirect, useRouter } from '@tanstack/react-router'

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
        router.navigate(
          router.resolveRedirect({
            ...err,
            _fromLocation: router.state.location,
          }),
        )
      }

      throw err
    }
  }) as any
}
