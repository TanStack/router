import { createClientOnlyFn } from '@tanstack/solid-start'

export { fakeLogin, fakeLogout, isAuthed }

const isAuthed = createClientOnlyFn(() => {
  const tokenValue = localStorage.getItem('auth')
  return tokenValue === 'good'
})

const fakeLogin = createClientOnlyFn(() => {
  localStorage.setItem('auth', 'good')
})

const fakeLogout = createClientOnlyFn(() => {
  localStorage.removeItem('auth')
})
