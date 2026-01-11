import { createRouter } from '@tanstack/vue-router'
import { createIsomorphicFn } from '@tanstack/vue-start'
import { routeTree } from './routeTree.gen'

const getSSROptions = createIsomorphicFn().server(() => {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  const nonce = Array.from(array, (b) => b.toString(16).padStart(2, '0')).join(
    '',
  )
  return { nonce }
})

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    ssr: getSSROptions(),
  })
}
