/**
 * Shared test helper: the route id a route file creates its `Route` with,
 * found by evaluating the file (not by reading its text).
 */
import { transformWithOxc } from 'vite'

/** The router packages a route file may import its route constructors from. */
const routerPackages = /(["'])@tanstack\/(?:react|solid|vue)-router\1/g

/**
 * Evaluates a route file with a stub of the router packages (any framework's)
 * and returns its exports. The stub provides the route constructors
 * (`createFileRoute`, `createLazyFileRoute`; a route is `{ id, options }`)
 * and, for each name in `routerExports`, an export of that name whose value
 * is the name (`default` for a default export). Like a bundler, fails on an
 * invalid module or an import of a name the stub does not provide.
 */
export async function evaluateRouteFile(
  code: string,
  routerExports: Array<string> = [],
): Promise<Record<string, any>> {
  const { code: javascript } = await transformWithOxc(code, 'route.tsx')
  const router = `data:text/javascript,${encodeURIComponent(
    `export const createFileRoute = (id) => (options) => ({ id, options })
export const createLazyFileRoute = createFileRoute
${routerExports
  .map((name) =>
    name === 'default'
      ? `export default 'default'`
      : `export const ${name} = ${JSON.stringify(name)}`,
  )
  .join('\n')}`,
  )}`
  const linked = javascript.replaceAll(routerPackages, JSON.stringify(router))
  return import(
    /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(linked)}`
  )
}

/**
 * Evaluates a route file (see `evaluateRouteFile`) and returns the id its
 * `Route` is created with.
 */
export async function routeIdOf(code: string): Promise<string> {
  const { Route } = await evaluateRouteFile(code)
  return Route.id as string
}
