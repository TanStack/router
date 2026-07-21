import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const nativeModuleExtensions = [
  '.tsx',
  '.ts',
  '.jsx',
  '.js',
  '.mts',
  '.mjs',
  '.cts',
  '.cjs',
] as const

const nativeScriptReactModuleId = 'virtual:tanstack-start-nativescript-react'
const resolvedNativeScriptReactModuleId = `\0${nativeScriptReactModuleId}`
const nativeScriptJsxRuntimeModuleId =
  'virtual:tanstack-start-nativescript-jsx-runtime'
const resolvedNativeScriptJsxRuntimeModuleId = `\0${nativeScriptJsxRuntimeModuleId}`
const nativeScriptJsxDevRuntimeModuleId =
  'virtual:tanstack-start-nativescript-jsx-dev-runtime'
const resolvedNativeScriptJsxDevRuntimeModuleId = `\0${nativeScriptJsxDevRuntimeModuleId}`
const nativeScriptReactDomModuleId =
  'virtual:tanstack-start-nativescript-react-dom'
const resolvedNativeScriptReactDomModuleId = `\0${nativeScriptReactDomModuleId}`
const nativeScriptReactReconcilerModuleId =
  'virtual:tanstack-start-nativescript-react-reconciler'
const resolvedNativeScriptReactReconcilerModuleId = `\0${nativeScriptReactReconcilerModuleId}`
const nativeScriptExternalStoreModuleId =
  'virtual:tanstack-start-nativescript-external-store'
const resolvedNativeScriptExternalStoreModuleId = `\0${nativeScriptExternalStoreModuleId}`
const nativeScriptExternalStoreSelectorModuleId =
  'virtual:tanstack-start-nativescript-external-store-selector'
const resolvedNativeScriptExternalStoreSelectorModuleId = `\0${nativeScriptExternalStoreSelectorModuleId}`

export interface TanStackReactNativeScriptViteOptions {
  /** Directories whose imports may be redirected to NativeScript modules. */
  appDirectories?: Array<string>
  /** Route directory used to identify the root route module. */
  routesDirectory?: string
  /** Resolve sibling `*-native` modules inside appDirectories. */
  nativeOverrides?: boolean
  /**
   * Native root-route module, relative to the Vite root. This replaces the
   * generated route tree's web `__root` import without placing another route
   * file in the routes directory.
   */
  nativeRootRoute?: string
  /** Additional app-only package aliases, or false to disable a default alias. */
  packageAliases?: Record<string, string | false>
}

function cleanId(id: string): string {
  const queryIndex = id.indexOf('?')
  const hashIndex = id.indexOf('#')
  const end = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((current, index) => Math.min(current, index), id.length)
  return id.slice(0, end)
}

function isInsideDirectory(file: string, directory: string): boolean {
  const relative = path.relative(directory, file)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

function stripNativeModuleExtension(file: string): string | undefined {
  const extension = nativeModuleExtensions.find((candidate) =>
    file.endsWith(candidate),
  )
  return extension ? file.slice(0, -extension.length) : undefined
}

function createNativeScriptResolver(
  options: TanStackReactNativeScriptViteOptions,
): Plugin {
  let root = process.cwd()
  let appDirectories: Array<string> = []
  let routesDirectory = ''
  let nativeRootRoute: string | undefined
  let isProduction = false
  let rendererBridgeInitialized = false
  let reactSource = ''
  let reactExportNames: Array<string> = []
  let jsxRuntimeSource = ''
  let jsxRuntimeExportNames: Array<string> = []
  let jsxDevRuntimeSource = ''
  let jsxDevRuntimeExportNames: Array<string> = []
  let reactDomModule = ''
  let reactReconcilerSource = ''
  let schedulerSource = ''
  let externalStoreSelectorSource = ''
  let sourceMapModule = ''

  const resolveSourceMapModule = () => {
    if (sourceMapModule) {
      return sourceMapModule
    }

    const rootRequire = createRequire(path.join(root, 'package.json'))
    try {
      sourceMapModule = rootRequire.resolve('source-map-js')
      return sourceMapModule
    } catch {
      const nativeScriptViteEntry = rootRequire.resolve('@nativescript/vite')
      const nativeScriptViteRequire = createRequire(nativeScriptViteEntry)
      const viteEntry = nativeScriptViteRequire.resolve('vite')
      sourceMapModule = createRequire(viteEntry).resolve('source-map-js')
      return sourceMapModule
    }
  }

  const initializeRendererBridge = () => {
    if (rendererBridgeInitialized) {
      return
    }

    const require = createRequire(path.join(root, 'package.json'))
    const reactPackagePath = require.resolve('react/package.json')
    const reactPackageRoot = path.dirname(reactPackagePath)
    const environment = isProduction ? 'production' : 'development'
    reactSource = readFileSync(
      path.join(reactPackageRoot, 'cjs', `react.${environment}.js`),
      'utf8',
    )
    jsxRuntimeSource = readFileSync(
      path.join(reactPackageRoot, 'cjs', `react-jsx-runtime.${environment}.js`),
      'utf8',
    )
    jsxDevRuntimeSource = readFileSync(
      path.join(
        reactPackageRoot,
        'cjs',
        `react-jsx-dev-runtime.${environment}.js`,
      ),
      'utf8',
    )

    const isIdentifier = (name: string) => /^[$A-Z_a-z][$\w]*$/.test(name)
    reactExportNames = Object.keys(require('react')).filter(isIdentifier)
    jsxRuntimeExportNames = Object.keys(require('react/jsx-runtime')).filter(
      isIdentifier,
    )
    jsxDevRuntimeExportNames = Object.keys(
      require('react/jsx-dev-runtime'),
    ).filter(isIdentifier)

    const adapterPackagePath =
      require.resolve('@tanstack/react-nativescript-router/package.json')
    reactDomModule = path.join(
      path.dirname(adapterPackagePath),
      'dist/esm/react-dom.js',
    )

    const rendererPackagePath =
      require.resolve('react-nativescript/package.json')
    const rendererRequire = createRequire(rendererPackagePath)
    const reactReconcilerPackagePath = rendererRequire.resolve(
      'react-reconciler/package.json',
    )
    const reactReconcilerRequire = createRequire(reactReconcilerPackagePath)
    reactReconcilerSource = readFileSync(
      path.join(
        path.dirname(reactReconcilerPackagePath),
        'cjs',
        `react-reconciler.${environment}.js`,
      ),
      'utf8',
    )
    const schedulerPackagePath = reactReconcilerRequire.resolve(
      'scheduler/package.json',
    )
    schedulerSource = readFileSync(
      path.join(
        path.dirname(schedulerPackagePath),
        'cjs',
        `scheduler.${environment}.js`,
      ),
      'utf8',
    )

    const adapterRequire = createRequire(adapterPackagePath)
    const reactStorePackagePath = adapterRequire.resolve(
      '@tanstack/react-store/package.json',
    )
    const reactStoreRequire = createRequire(reactStorePackagePath)
    const externalStorePackagePath = reactStoreRequire.resolve(
      'use-sync-external-store/package.json',
    )
    externalStoreSelectorSource = readFileSync(
      path.join(
        path.dirname(externalStorePackagePath),
        'cjs',
        'use-sync-external-store-shim',
        `with-selector.${environment}.js`,
      ),
      'utf8',
    )

    rendererBridgeInitialized = true
  }

  const configurePaths = (config: ResolvedConfig) => {
    root = config.root
    isProduction = config.isProduction
    rendererBridgeInitialized = false
    sourceMapModule = ''
    appDirectories = (options.appDirectories ?? ['src']).map((directory) =>
      path.resolve(root, directory),
    )
    routesDirectory = path.resolve(
      root,
      options.routesDirectory ?? 'src/routes',
    )
    nativeRootRoute = options.nativeRootRoute
      ? path.resolve(root, options.nativeRootRoute)
      : undefined

    if (nativeRootRoute && !existsSync(nativeRootRoute)) {
      throw new Error(
        `NativeScript root route does not exist: ${nativeRootRoute}`,
      )
    }
  }

  const isAppModule = (id: string | undefined): boolean => {
    if (!id || id.startsWith('\0')) {
      return false
    }
    const file = cleanId(id)
    return appDirectories.some((directory) =>
      isInsideDirectory(file, directory),
    )
  }

  return {
    name: 'tanstack-react-start:nativescript-resolver',
    enforce: 'pre',
    configResolved(config: ResolvedConfig) {
      configurePaths(config)
    },
    async resolveId(source, importer) {
      if (source === 'source-map-js') {
        return resolveSourceMapModule()
      }
      if (source === nativeScriptReactModuleId) {
        return resolvedNativeScriptReactModuleId
      }
      if (source === nativeScriptJsxRuntimeModuleId) {
        return resolvedNativeScriptJsxRuntimeModuleId
      }
      if (source === nativeScriptJsxDevRuntimeModuleId) {
        return resolvedNativeScriptJsxDevRuntimeModuleId
      }
      if (source === nativeScriptReactDomModuleId) {
        return resolvedNativeScriptReactDomModuleId
      }
      if (source === nativeScriptReactReconcilerModuleId) {
        return resolvedNativeScriptReactReconcilerModuleId
      }
      if (source === nativeScriptExternalStoreModuleId) {
        return resolvedNativeScriptExternalStoreModuleId
      }
      if (source === nativeScriptExternalStoreSelectorModuleId) {
        return resolvedNativeScriptExternalStoreSelectorModuleId
      }

      if (!isAppModule(importer)) {
        return null
      }

      const aliasTarget = {
        '@tanstack/react-router': '@tanstack/react-nativescript-router',
        ...options.packageAliases,
      }[source]

      if (aliasTarget) {
        const resolved = await this.resolve(aliasTarget, importer, {
          skipSelf: true,
        })
        if (!resolved) {
          this.error(
            `Could not resolve ${aliasTarget}. Install the NativeScript adapter before building the native client.`,
          )
        }
        return resolved
      }

      const resolved = await this.resolve(source, importer, { skipSelf: true })
      if (!resolved || resolved.external) {
        return null
      }

      const resolvedFile = cleanId(resolved.id)
      if (!isAppModule(resolvedFile)) {
        return null
      }

      const base = stripNativeModuleExtension(resolvedFile)
      if (!base || base.endsWith('-native')) {
        return null
      }

      if (
        nativeRootRoute &&
        path.basename(base) === '__root' &&
        isInsideDirectory(resolvedFile, routesDirectory)
      ) {
        return nativeRootRoute
      }

      if (options.nativeOverrides === false) {
        return null
      }

      for (const extension of nativeModuleExtensions) {
        const candidate = `${base}-native${extension}`
        if (existsSync(candidate)) {
          return candidate
        }
      }

      return null
    },
    load(id) {
      if (
        id === resolvedNativeScriptReactModuleId ||
        id === resolvedNativeScriptJsxRuntimeModuleId ||
        id === resolvedNativeScriptJsxDevRuntimeModuleId ||
        id === resolvedNativeScriptReactDomModuleId ||
        id === resolvedNativeScriptReactReconcilerModuleId ||
        id === resolvedNativeScriptExternalStoreSelectorModuleId
      ) {
        initializeRendererBridge()
      }

      if (id === resolvedNativeScriptReactModuleId) {
        return `
const __module = { exports: {} }
const __exports = __module.exports
const __require = (id) => { throw new Error('Unexpected React dependency: ' + id) }
;(function (module, exports, require) {
${reactSource}
})(__module, __exports, __require)
const React = __module.exports
export default React
export const { ${reactExportNames.join(', ')} } = React
`
      }
      if (id === resolvedNativeScriptJsxRuntimeModuleId) {
        return `
import React from ${JSON.stringify(nativeScriptReactModuleId)}
const __module = { exports: {} }
const __exports = __module.exports
const __require = (id) => {
  if (id === 'react') return React
  throw new Error('Unexpected React JSX runtime dependency: ' + id)
}
;(function (module, exports, require) {
${jsxRuntimeSource}
})(__module, __exports, __require)
const runtime = __module.exports
export default runtime
export const { ${jsxRuntimeExportNames.join(', ')} } = runtime
`
      }
      if (id === resolvedNativeScriptJsxDevRuntimeModuleId) {
        return `
import React from ${JSON.stringify(nativeScriptReactModuleId)}
const __module = { exports: {} }
const __exports = __module.exports
const __require = (id) => {
  if (id === 'react') return React
  throw new Error('Unexpected React JSX dev runtime dependency: ' + id)
}
;(function (module, exports, require) {
${jsxDevRuntimeSource}
})(__module, __exports, __require)
const runtime = __module.exports
export default runtime
export const { ${jsxDevRuntimeExportNames.join(', ')} } = runtime
`
      }
      if (id === resolvedNativeScriptReactDomModuleId) {
        return `export { flushSync } from ${JSON.stringify(reactDomModule)}`
      }
      if (id === resolvedNativeScriptReactReconcilerModuleId) {
        return `
import React from ${JSON.stringify(nativeScriptReactModuleId)}
const __schedulerModule = { exports: {} }
const __schedulerExports = __schedulerModule.exports
;(function (module, exports) {
${schedulerSource}
})(__schedulerModule, __schedulerExports)
const Scheduler = __schedulerModule.exports
const __module = { exports: {} }
const __exports = __module.exports
const __require = (id) => {
  if (id === 'react') return React
  if (id === 'scheduler') return Scheduler
  throw new Error('Unexpected React reconciler dependency: ' + id)
}
;(function (module, exports, require) {
${reactReconcilerSource}
})(__module, __exports, __require)
const ReactReconciler = __module.exports
export default ReactReconciler
`
      }
      if (id === resolvedNativeScriptExternalStoreModuleId) {
        return `export { useSyncExternalStore } from ${JSON.stringify(nativeScriptReactModuleId)}`
      }
      if (id === resolvedNativeScriptExternalStoreSelectorModuleId) {
        return `
import * as React from ${JSON.stringify(nativeScriptReactModuleId)}
import * as shim from ${JSON.stringify(nativeScriptExternalStoreModuleId)}
const __module = { exports: {} }
const __exports = __module.exports
const __require = (id) => {
  if (id === 'react') return React
  if (id === 'use-sync-external-store/shim') return shim
  throw new Error('Unexpected external-store selector dependency: ' + id)
}
;(function (module, exports, require) {
${externalStoreSelectorSource}
})(__module, __exports, __require)
const selector = __module.exports
export const { useSyncExternalStoreWithSelector } = selector
`
      }
      return null
    },
    config() {
      return {
        build: {
          modulePreload: false,
        },
        resolve: {
          alias: [
            {
              find: /^react-reconciler$/,
              replacement: nativeScriptReactReconcilerModuleId,
            },
            {
              find: /^react\/jsx-runtime$/,
              replacement: nativeScriptJsxRuntimeModuleId,
            },
            {
              find: /^react\/jsx-dev-runtime$/,
              replacement: nativeScriptJsxDevRuntimeModuleId,
            },
            {
              find: /^react$/,
              replacement: nativeScriptReactModuleId,
            },
            {
              find: /^react-dom$/,
              replacement: nativeScriptReactDomModuleId,
            },
            {
              find: /^use-sync-external-store\/shim\/with-selector$/,
              replacement: nativeScriptExternalStoreSelectorModuleId,
            },
            {
              find: /^use-sync-external-store\/shim$/,
              replacement: nativeScriptExternalStoreModuleId,
            },
          ],
        },
      }
    },
  }
}

/** Configure Vite for React rendered by NativeScript rather than React DOM. */
export function tanstackReactNativeScript(
  options: TanStackReactNativeScriptViteOptions = {},
): Plugin {
  return createNativeScriptResolver(options)
}
