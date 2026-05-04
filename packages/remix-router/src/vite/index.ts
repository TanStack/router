import { remixClientEntries } from './clientEntries'
export type {
  ClientEntriesPluginOptions,
  ClientEntryManifest,
} from './clientEntries'

/**
 * Plugin suite for `@tanstack/remix-router`. Currently ships:
 *
 * - {@link remixClientEntries} — discovers `clientEntry()` calls in your
 *   source, splits each into its own chunk, and produces an asset
 *   manifest mapping logical entry IDs to deployed chunk URLs. The
 *   server uses this manifest to populate `resolveClientEntry` so the
 *   `<!-- rmx:h:hN -->` markers point at real assets.
 *
 * Server-only code (markdown renderers, ORMs, image pipelines, etc.) is
 * stripped from client bundles via the same mechanism `createServerFn`
 * relies on — `import.meta.env.SSR` substitution + rolldown DCE — when
 * the server-only module is reachable only through a `createServerFn`
 * handler. No router-specific plugin is required for that path.
 */
export interface RemixRouterPluginOptions {
  clientEntries?:
    | import('./clientEntries').ClientEntriesPluginOptions
    | false
}

export function remixRouter(options: RemixRouterPluginOptions = {}) {
  const plugins: Array<unknown> = []
  if (options.clientEntries !== false) {
    plugins.push(remixClientEntries(options.clientEntries ?? {}))
  }
  return plugins
}

export { remixClientEntries }
