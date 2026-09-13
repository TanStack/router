import { createServerFn } from '@tanstack/react-start'
import {
  getCookie,
  getRequestUrl,
  setCookie,
  setResponseHeader,
} from '@tanstack/react-start/server'
import { z } from 'zod'
const schema = z.object({
  goal: z
    .string()
    .trim()
    .min(1, 'Enter a reading goal.')
    .max(80, 'Use 80 characters or fewer.'),
})
export const readGoal = createServerFn({ method: 'GET' }).handler(() => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return getCookie('reading_goal') ?? 'Read one chapter'
})
export const saveGoal = createServerFn({ method: 'POST' })
  .validator(z.object({ goal: z.string() }))
  .handler(({ data }) => {
    setResponseHeader('Cache-Control', 'private, no-store')
    const result = schema.safeParse(data)
    if (!result.success) {
      return {
        error: result.error.issues[0]?.message ?? 'Check your reading goal.',
      }
    }
    setCookie('reading_goal', result.data.goal, {
      httpOnly: true,
      sameSite: 'lax',
      secure: getRequestUrl().protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return { error: '' }
  })
