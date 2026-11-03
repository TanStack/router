import { defineConfig, mergeConfig } from 'vitest/config'
import { tanstackViteConfig } from '@tanstack/vite-config'
import packageJson from './package.json'

/** The build output (`dist`) of this package and `@tanstack/react-start`. */
const builtStartPackages =
  /\/packages\/(?:start-plugin-core|react-start)\/dist\//

const config = defineConfig({
  test: {
    name: packageJson.name,
    dir: './tests',
    watch: false,
    typecheck: { enabled: true },
    // The integration tests build apps with the built Start packages
    // (`tests/integration/start-app.ts`): Node loads them, as it loads an
    // installed package, so the plugin and the loaders Rspack loads from
    // the same `dist` share one module instance.
    server: { deps: { external: [builtStartPackages] } },
  },
})

export default mergeConfig(
  config,
  tanstackViteConfig({
    tsconfigPath: './tsconfig.build.json',
    entry: [
      './src/index.ts',
      './src/utils.ts',
      './src/vite/index.ts',
      './src/rsbuild/index.ts',
      './src/rsbuild/types.ts',
      './src/rsbuild/import-protection-loader.ts',
      './src/rsbuild/start-compiler-metadata-loader.ts',
    ],
    srcDir: './src',
    outDir: './dist',
    cjs: false,
  }),
)
