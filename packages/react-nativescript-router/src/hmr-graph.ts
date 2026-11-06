// Pure helpers for mapping HMR module ids to route ids; kept free of
// NativeScript imports so they run under Node tests.

export const scriptExtension = /\.(?:[cm]?[jt]sx?)$/i
export const routeFile = /\/routes\/(.+)\.(?:[cm]?[jt]sx?)$/i
const rootRouteFile = /(?:^|\/)__root$/

export function moduleKey(id: string): string {
  const path = id.split('?')[0]!
  return (path.startsWith('/') ? path : `/${path}`).replace(scriptExtension, '')
}

/** `/src/routes/deps/index.tsx` → `/deps/`, `/src/routes/posts.$id.tsx` → `/posts/$id`. */
export function routeIdFromFile(fileId: string): string | null {
  const match = moduleKey(fileId).match(/\/routes\/(.+)$/)
  if (!match) return null
  const segments = match[1]!.split(/[./]/)
  if (rootRouteFile.test(segments.join('/'))) return null
  if (segments[segments.length - 1] === 'index') {
    segments[segments.length - 1] = ''
  }
  const id = `/${segments.join('/')}`
  return id === '/' ? '/' : id
}

/** Every module that transitively imports one of `changed`, plus `changed`. */
export function collectAffected(
  importers: Map<string, Set<string>>,
  changed: Iterable<string>,
): Set<string> {
  const affected = new Set<string>()
  const queue = [...changed]
  while (queue.length > 0) {
    const key = queue.pop()!
    if (affected.has(key)) continue
    affected.add(key)
    for (const importer of importers.get(key) ?? []) queue.push(importer)
  }
  return affected
}

/** Modules reachable from `roots` through `deps` that are also in `within`. */
export function collectDescendants(
  deps: Map<string, Set<string>>,
  roots: Iterable<string>,
  within: Set<string>,
): Set<string> {
  const found = new Set<string>()
  const queue = [...roots]
  while (queue.length > 0) {
    const key = queue.pop()!
    if (found.has(key) || !within.has(key)) continue
    found.add(key)
    for (const dep of deps.get(key) ?? []) queue.push(dep)
  }
  return found
}
