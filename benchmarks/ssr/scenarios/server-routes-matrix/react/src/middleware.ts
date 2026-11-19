import { createMiddleware } from '@tanstack/react-start'

export const make = <const TKey extends string>(key: TKey, value: number) =>
  createMiddleware({ type: 'request' }).server(({ next }) =>
    next({ context: { [key]: value } as Record<TKey, number> }),
  )
