/**
 * Shared test helper: the route id a route file creates its `Route` with,
 * found by evaluating the file (not by reading its text).
 */
import { transformWithOxc } from 'vite'

/** The router packages a route file may import its route constructors from. */
const routerPackages = /(["'])@tanstack\/(?:react|solid|vue)-router\1/g

/** The JSX runtime that compiled JSX imports. */
const jsxRuntime = /(["'])react\/jsx-runtime\1/g

/**
 * Evaluates a route file with a stub of the router packages (any framework's)
 * and returns its exports. The stub provides the route constructors
 * (`createFileRoute`, `createLazyFileRoute`; a route is `{ id, options,
 * createdWith }`, `createdWith` naming the constructor)
 * and, for each name in `routerExports`, an export of that name whose value
 * is the name (`default` for a default export). JSX compiles to calls of a
 * stub JSX runtime. Like a bundler, fails on an invalid module or an import of
 * a name the stub does not provide.
 */
export async function evaluateRouteFile(
  code: string,
  routerExports: Array<string> = [],
): Promise<Record<string, any>> {
  const { code: javascript } = await transformWithOxc(code, 'route.tsx')
  const router = `data:text/javascript,${encodeURIComponent(
    `export const createFileRoute = (id) => (options) => ({ id, options, createdWith: 'createFileRoute' })
export const createLazyFileRoute = (id) => (options) => ({ id, options, createdWith: 'createLazyFileRoute' })
${routerExports
  .map((name) =>
    name === 'default'
      ? `export default 'default'`
      : `export const ${name} = ${JSON.stringify(name)}`,
  )
  .join('\n')}`,
  )}`
  const runtime = `data:text/javascript,${encodeURIComponent(
    `export const jsx = (type) => ({ type })
export const jsxs = jsx
export const Fragment = 'Fragment'`,
  )}`
  const linked = javascript
    .replaceAll(routerPackages, JSON.stringify(router))
    .replaceAll(jsxRuntime, JSON.stringify(runtime))
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
