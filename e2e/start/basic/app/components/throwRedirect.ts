import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'

export const throwRedirect = createServerFn()
  .validator(
    (opts: { target: 'internal' | 'external'; reloadDocument?: boolean }) =>
      opts,
  )
  .handler((ctx) => {
    if (ctx.data.target === 'internal') {
      throw redirect({ to: '/posts', reloadDocument: ctx.data.reloadDocument })
    }
    throw redirect({
      href: 'http://example.com',
    })
  })
