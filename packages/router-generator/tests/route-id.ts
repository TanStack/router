/**
 * Shared test helper: the route id a route file creates its `Route` with,
 * found by evaluating the file (not by reading its text).
 */
import { transformWithOxc } from 'vite'

/** The router packages a route file may import its route constructors from. */
const routerPackages = /(["'])@tanstack\/(?:react|solid|vue)-router\1/g

/**
 * Evaluates a route file with stub route constructors (`createFileRoute`,
 * `createLazyFileRoute` of any framework's router package) and returns the
 * id its `Route` is created with. Like a bundler, fails on an invalid module
 * or an import of a name the stub does not provide.
 */
export async function routeIdOf(code: string): Promise<string> {
  const { code: javascript } = await transformWithOxc(code, 'route.tsx')
  const router = `data:text/javascript,${encodeURIComponent(
    `export const createFileRoute = (id) => (options) => ({ id, options })
export const createLazyFileRoute = createFileRoute`,
  )}`
  const linked = javascript.replaceAll(routerPackages, JSON.stringify(router))
  const { Route } = await import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(linked)}`
  )
  return Route.id as string
}
