const GENERIC_FUNCTION_NAMES = new Set(['', 'Mock', 'mockConstructor'])

export function instrumentMiddlewareArray<
  T extends (...args: Array<any>) => any,
>(
  middlewares: Array<T>,
  chain: Array<{ name: string; startTime: number; endTime: number }>,
): Array<T> {
  return middlewares.map((mw, i) => {
    const name =
      mw.name && !GENERIC_FUNCTION_NAMES.has(mw.name)
        ? mw.name
        : `middleware-${i}`
    const wrapped = async (ctx: any) => {
      const mwStart = performance.now()
      try {
        return await mw(ctx)
      } finally {
        chain.push({
          name,
          startTime: mwStart,
          endTime: performance.now(),
        })
      }
    }
    Object.defineProperty(wrapped, 'name', { value: name })
    return wrapped as unknown as T
  })
}
