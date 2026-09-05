export async function ensureLatestClientBuild(environment: unknown) {
  // Vite 8.2 moved the engine from the environment into bundledDev.
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
