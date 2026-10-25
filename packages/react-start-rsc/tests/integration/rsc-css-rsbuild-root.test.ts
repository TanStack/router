import { expect, test } from 'vitest'
import { startRscRsbuildDevServer } from './rsc-app'
import { appFiles, rows, show } from './rsc-css-rsbuild-app'

// SPEC J4.16: discovery and wiring use the configured root, not the process
// working directory.
// Bug: Start's Rsbuild plugin writes its virtual modules (serialization
// adapters, RSC decode) under `<process.cwd()>/node_modules/.virtual`
// (rsbuild/virtual-modules.ts `virtualPath`, with `resolvedStartConfig.root`
// still empty at setup), where the app's `@tanstack/react-start` does not
// resolve when the process runs elsewhere (`rsbuild dev --root <app>` from
// a monorepo root).
// Impact: the dev server (and build) fails with "Module not found".
test(
  'Rsbuild: the app compiles when the process does not run in the app directory',
  async () => {
    const server = await startRscRsbuildDevServer({
      browser: true,
      inAppDirectory: false,
      files: appFiles,
    })
    expect(server.errors).toEqual([])
    const page = await show(server, rows[0]!.path)
    expect(page.errors).toEqual([])
  },
)
