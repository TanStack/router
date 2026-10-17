import type { DeletableNodes } from '@tanstack/router-plugin'

/**
 * Route options the client bundle never reads. `ssr`, `server` and `headers`
 * run on the server only; `dehydrate` runs on the server at lifecycle settle,
 * and the client restores a transported result by its presence in the
 * payload, never by reading `dehydrate`.
 */
const CLIENT_DELETE_NODES: ReadonlyArray<DeletableNodes> = [
  'ssr',
  'server',
  'headers',
  'context.dehydrate',
  'beforeLoad.dehydrate',
  'loader.dehydrate',
]

/**
 * Route options the server bundle never reads. `hydrate` runs on the client
 * during hydration; `context.revalidate` runs on `router.invalidate()`,
 * which only happens on the client.
 */
const SERVER_DELETE_NODES: ReadonlyArray<DeletableNodes> = [
  'context.hydrate',
  'beforeLoad.hydrate',
  'loader.hydrate',
  'context.revalidate',
]

/**
 * The `deleteNodes` list for one build environment: the user's own list,
 * followed by the options that environment never reads. Removing them is a
 * size optimization, not a secrecy mechanism; import protection remains the
 * guard for server-only modules. What the compiler visits is documented on
 * `CodeSplittingOptions.deleteNodes`.
 */
export function getRouteOptionDeleteNodes(
  environment: 'client' | 'server',
  userDeleteNodes: ReadonlyArray<DeletableNodes> | undefined,
): Array<DeletableNodes> {
  const builtin =
    environment === 'client' ? CLIENT_DELETE_NODES : SERVER_DELETE_NODES

  return [...new Set([...(userDeleteNodes ?? []), ...builtin])]
}
