import { Scripts as RouterScripts } from '@tanstack/react-router'

export const Scripts = () => {
  if (process.env.NODE_ENV === 'development') {
    console.warn('The Scripts component was moved to `@tanstack/react-router`')
  }
  return <RouterScripts />
}
