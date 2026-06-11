import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import solid from 'vite-plugin-solid'

// Produce two builds:
//  - default (client/DOM): `dist/esm/index.js` + `dist/cjs/index.cjs`
//  - SSR (BUILD_SSR=true):  `dist/esm/index.server.js`
//
// vite-plugin-solid's default DOM JSX transform emits module-scope
// `delegateEvents([...])` and `template(...)` calls that touch `window` /
// throw "client-only API" when the bundled Solid runtime is its DOM build.
// See https://github.com/TanStack/router/issues/7205.
//
// Neither just externalizing `solid-js/web` nor just swapping conditions is
// enough: Solid's SSR build exports those functions as stubs that throw on
// call, and consumer bundlers (e.g. nitro) eagerly concatenate the lazy
// chunks into the server entry, so the module-scope calls fire at import.
// Shipping a second bundle compiled with `ssr: true` makes vite-plugin-solid
// emit `ssr()` / `ssrElement()` calls instead, which are real SSR primitives.
// The `node` export condition in package.json picks this build automatically.
const ssr = process.env.BUILD_SSR === 'true'

const config = defineConfig({
  plugins: [solid({ ssr })],
})

const merged = mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: './src/index.tsx',
    srcDir: './src',
    bundledDeps: ['solid-js', 'solid-js/web'],
    // Only emit CJS and declaration files for the client build — the SSR
    // build only needs ESM, and the types are identical.
    cjs: !ssr,
  }),
)

merged.build.rolldownOptions.output.manualChunks = undefined
merged.build.rolldownOptions.output.preserveModules = false

if (ssr) {
  // Don't wipe the client build produced in the previous step.
  merged.build.emptyOutDir = false
  merged.build.lib.formats = ['es']
  // Build in SSR mode so Vite resolves `solid-js/web` via the `node` export
  // condition and pulls in Solid's server build.
  merged.build.ssr = true
  merged.ssr = {
    // Still bundle Solid so the server artifact is self-contained.
    noExternal: ['solid-js', 'solid-js/web'],
  }
  // `lib.fileName` isn't honored when `build.ssr` is set, so drive the
  // output names via rolldown directly.
  merged.build.rolldownOptions.output.entryFileNames = 'esm/index.server.js'
  merged.build.rolldownOptions.output.chunkFileNames = 'esm/[name].js'
  // Skip declaration-file generation — the client build already produced
  // `.d.ts`/`.d.cts` files that are valid for both.
  merged.plugins = merged.plugins.filter(
    (p: any) => !p || p.name !== 'vite:dts',
  )
}

export default merged
