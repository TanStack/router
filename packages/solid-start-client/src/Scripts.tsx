import { Scripts as RouterScripts } from '@tanstack/solid-router'

export const Scripts = () => {
  if (process.env.NODE_ENV === 'development') {
    console.warn('The Scripts component was moved to `@tanstack/solid-router`')
  }
  return <RouterScripts />
}
