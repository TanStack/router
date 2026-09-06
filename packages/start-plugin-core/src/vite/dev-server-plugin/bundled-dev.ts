export async function ensureLatestClientBuild(environment: unknown) {
  // PRIVATE-API WORKAROUND (https://github.com/vitejs/vite/issues/22991).
  // Vite has no supported SSR API to refresh/await bundled client output.
  // generateBundle observes full builds, but does not trigger regeneration
  // after HMR patches. Replace this entire helper when that API is available.
  // Vite <8.2 kept the engine on the environment; 8.2 moved it into bundledDev.
  const bundledDev =
    environment &&
    typeof environment === 'object' &&
    'bundledDev' in environment
      ? environment.bundledDev
      : undefined
  const container = bundledDev ?? environment
  const engine =
    container && typeof container === 'object' && 'devEngine' in container
      ? container.devEngine
      : undefined

  if (
    !engine ||
    typeof engine !== 'object' ||
    !('ensureLatestBuildOutput' in engine) ||
    typeof engine.ensureLatestBuildOutput !== 'function'
  ) {
    throw new Error(
      'TanStack Start could not access the Vite bundled-dev engine to synchronize the client build before SSR.',
    )
  }

  await engine.ensureLatestBuildOutput()
}
