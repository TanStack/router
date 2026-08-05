/**
 * Client-assets manifest bridge for server-rendered `lazy()` components.
 *
 * Solid's streaming renderer resolves the modules behind server-rendered
 * `lazy()` boundaries to their client JS/CSS assets through the `manifest`
 * render option — emitting stylesheet links for lazy chunks and serializing
 * the module→asset map the client needs to preload them before hydration.
 *
 * This module is a stub on purpose: bundler integrations that can answer
 * those lookups (e.g. TanStack Start's vite plugin, which swaps this module
 * for vite-plugin-solid's `virtual:solid-manifest`) replace it at build
 * time. Everywhere else — plain SSR setups, bundlers without an
 * integration — it stays `undefined` and rendering falls back to the
 * router's own route manifest.
 *
 * The swap is keyed off this file's path (`ssr/clientAssetsManifest`), so
 * renaming or moving it breaks the integration.
 */
const clientAssetsManifest: unknown = undefined

export default clientAssetsManifest
