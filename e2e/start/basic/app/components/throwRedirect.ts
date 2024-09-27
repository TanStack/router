import { redirect } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/start'

export const throwRedirect = createServerFn(
  'GET',
  (target: 'internal' | 'external') => {
    if (target === 'internal') {
      throw redirect({ to: '/posts' })
    }
    throw redirect({
      href: 'http://example.com',
    })
  },
)
