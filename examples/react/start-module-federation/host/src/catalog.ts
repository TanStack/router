import { getRemoteStylesheets } from '@module-federation/tanstack/runtime'

const catalogManifest = 'http://127.0.0.1:3001/mf-manifest.json'

export async function preloadCatalog(
  expose: string,
  load: () => Promise<unknown>,
) {
  const [stylesheets] = await Promise.all([
    getRemoteStylesheets(catalogManifest, expose).catch(() => []),
    load().catch(() => null),
  ])
  return { stylesheets }
}

export function stylesheetLinks(stylesheets: Array<string> | undefined) {
  return stylesheets?.map((href) => ({ rel: 'stylesheet', href }))
}
