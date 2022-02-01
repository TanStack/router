import { RollupOptions } from 'rollup'
import babel from '@rollup/plugin-babel'
import { terser } from 'rollup-plugin-terser'
import size from 'rollup-plugin-size'
import visualizer from 'rollup-plugin-visualizer'
import replace from '@rollup/plugin-replace'
import nodeResolve from '@rollup/plugin-node-resolve'
import path from 'path'

type Options = {
  input: string
  packageDir: string
  external: RollupOptions['external']
  banner: string
  jsName: string
  outputFile: string
}

const globals = {
  react: 'React',
  'react-dom': 'ReactDOM',
  '@tanstack/react-location': 'ReactLocation',
  '@tanstack/react-location-lite': 'ReactLocationLite',
  '@tanstack/react-location-devtools': 'ReactLocationDevtools',
  '@tanstack/react-location-elements-to-routes':
    'ReactLocationElementsToRoutes',
  '@tanstack/react-location-simple-cache': 'ReactLocationSimpleCache',
  '@tanstack/react-location-rank-routes': 'ReactLocationRankRoutes',
  '@tanstack/react-location-jsurl': 'ReactLocationJsurl',
  history: 'History',
}

const externals = [...Object.keys(globals), /@babel\/runtime/, 'history']

const umdDevPlugin = (type: 'development' | 'production') =>
  replace({
    'process.env.NODE_ENV': `"${type}"`,
    delimiters: ['', ''],
    preventAssignment: true,
  })

const babelPlugin = babel({
  babelHelpers: 'bundled',
  exclude: /node_modules/,
  extensions: ['.ts', '.tsx'],
})

export default function rollup(options: RollupOptions): RollupOptions[] {
  return [
    ...buildConfigs({
      name: 'react-location',
      packageDir: 'packages/react-location',
      jsName: 'ReactLocation',
      outputFile: 'react-location',
      entryFile: 'src/index.tsx',
    }),
    ...buildConfigs({
      name: 'react-location-lite',
      packageDir: 'packages/react-location-lite',
      jsName: 'ReactLocationLite',
      outputFile: 'react-location-lite',
      entryFile: 'src/index.tsx',
    }),
    ...buildConfigs({
      name: 'react-location-devtools',
      packageDir: 'packages/react-location-devtools',
      jsName: 'ReactLocationDevtools',
      outputFile: 'react-location-devtools',
      entryFile: 'src/index.tsx',
    }),
    ...buildConfigs({
      name: 'react-location-elements-to-routes',
      packageDir: 'packages/react-location-elements-to-routes',
      jsName: 'ReactLocationElementsToRoutes',
      outputFile: 'react-location-elements-to-routes',
      entryFile: 'src/index.tsx',
    }),
    ...buildConfigs({
      name: 'react-location-simple-cache',
      packageDir: 'packages/react-location-simple-cache',
      jsName: 'ReactLocationSimpleCache',
      outputFile: 'react-location-simple-cache',
      entryFile: 'src/index.tsx',
    }),
    ...buildConfigs({
      name: 'react-location-rank-routes',
      packageDir: 'packages/react-location-rank-routes',
      jsName: 'ReactLocationRankRoutes',
      outputFile: 'react-location-rank-routes',
      entryFile: 'src/index.tsx',
    }),
    ...buildConfigs({
      name: 'react-location-jsurl',
      packageDir: 'packages/react-location-jsurl',
      jsName: 'ReactLocationJsurl',
      outputFile: 'react-location-jsurl',
      entryFile: 'src/index.tsx',
    }),
  ]
}

function buildConfigs(opts: {
  packageDir: string
  name: string
  jsName: string
  outputFile: string
  entryFile: string
}): RollupOptions[] {
  const input = path.resolve(opts.packageDir, opts.entryFile)
  const externalDeps = [...externals]

  const external = (moduleName) => externalDeps.includes(moduleName)
  const banner = createBanner(opts.name)

  const options: Options = {
    input,
    jsName: opts.jsName,
    outputFile: opts.outputFile,
    packageDir: opts.packageDir,
    external,
    banner,
  }

  return [esm(options), cjs(options), umdDev(options), umdProd(options)]
}

function esm({ input, packageDir, external, banner }: Options): RollupOptions {
  return {
    // ESM
    external,
    input,
    output: {
      format: 'esm',
      sourcemap: true,
      dir: `${packageDir}/build/esm`,
      banner,
    },
    plugins: [babelPlugin, nodeResolve({ extensions: ['.ts', '.tsx'] })],
  }
}

function cjs({ input, external, packageDir, banner }: Options): RollupOptions {
  return {
    // CJS
    external,
    input,
    output: {
      format: 'cjs',
      sourcemap: true,
      dir: `${packageDir}/build/cjs`,
      preserveModules: true,
      exports: 'named',
      banner,
    },
    plugins: [babelPlugin, nodeResolve({ extensions: ['.ts', '.tsx'] })],
  }
}

function umdDev({
  input,
  external,
  packageDir,
  outputFile,
  banner,
  jsName,
}: Options): RollupOptions {
  return {
    // UMD (Dev)
    external,
    input,
    output: {
      format: 'umd',
      sourcemap: true,
      file: `${packageDir}/build/umd/index.development.js`,
      name: jsName,
      globals,
      banner,
    },
    plugins: [
      babelPlugin,
      nodeResolve({ extensions: ['.ts', '.tsx'] }),
      umdDevPlugin('development'),
    ],
  }
}

function umdProd({
  input,
  external,
  packageDir,
  outputFile,
  banner,
  jsName,
}: Options): RollupOptions {
  return {
    // UMD (Prod)
    external,
    input,
    output: {
      format: 'umd',
      sourcemap: true,
      file: `${packageDir}/build/umd/index.production.js`,
      name: jsName,
      globals,
      banner,
    },
    plugins: [
      babelPlugin,
      nodeResolve({ extensions: ['.ts', '.tsx'] }),
      umdDevPlugin('production'),
      terser({
        mangle: true,
        compress: true,
      }),
      size({}),
      visualizer({
        filename: `${packageDir}/build/stats-html.html`,
        gzipSize: true,
      }),
      visualizer({
        filename: `${packageDir}/build/stats-react.json`,
        json: true,
        gzipSize: true,
      }),
    ],
  }
}

function createBanner(libraryName: string) {
  return `/**
 * ${libraryName}
 *
 * Copyright (c) TanStack
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE.md file in the root directory of this source tree.
 *
 * @license MIT
 */`
}
