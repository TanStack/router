/**
 * Evaluates a virtual route config module (`virtualRouteConfig` file,
 * `__virtual.ts`). The generator only calls it when the scan is redone, and
 * an edited config must be seen (SPEC J1.10), so jiti keeps no module cache
 * between loads: every call evaluates a TypeScript file (`.ts`, `.mts`,
 * `.cts`, `.tsx`) again. A native JavaScript file (`.js`, `.mjs`, `.cjs`)
 * jiti 2.7.0 hands to Node's loader, whose module cache keeps the first
 * evaluation for the process: its edits are seen after a restart.
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
