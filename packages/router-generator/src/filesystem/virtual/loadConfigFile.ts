/**
 * Evaluates a virtual route config module (`virtualRouteConfig` file,
 * `__virtual.ts`). Every call evaluates the file again: the generator only
 * calls it when the scan is redone, and an edited config must be seen
 * (SPEC J1.10), so no module cache is kept between loads.
 */
export async function loadConfigFile(filePath: string) {
  // only virtual route configs need jiti: keep it off the startup path
  const { createJiti } = await import('jiti')
  const jiti = createJiti(filePath, {
    interopDefault: false,
    tsconfigPaths: true,
    moduleCache: false,
  })
  const loaded = await jiti.import<any>(filePath)
  return loaded
}
