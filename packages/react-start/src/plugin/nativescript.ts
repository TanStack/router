import { tanstackRouterGenerator } from '@tanstack/router-plugin/vite'
import { tanstackReactNativeScript } from '@tanstack/react-nativescript-router/vite'
import {
  startClientCompilerVite,
  type StartClientCompilerViteOptions,
} from '@tanstack/start-plugin-core/vite/client-compiler'
import type { Config as RouterPluginConfig } from '@tanstack/router-plugin/vite'
import type { PluginOption } from 'vite'

export interface TanStackStartNativeScriptOptions {
  /** Absolute URL of the deployed Start server-function endpoint. */
  serverFnBase: string
  /** Use `dev` for a Vite development server and `build` for a deployment. */
  serverFnMode?: StartClientCompilerViteOptions['serverFnMode']
  /** Directories whose imports may be redirected to NativeScript modules. */
  appDirectories?: Array<string>
  /** Generate the shared route tree. Set to false when another build owns it. */
  router?: false | Partial<RouterPluginConfig>
  /** Resolve sibling `*-native` modules inside appDirectories. */
  nativeOverrides?: boolean
  /**
   * Native root-route module, relative to the Vite root. This replaces the
   * generated route tree's web `__root` import without placing another route
   * file in the routes directory.
   */
  nativeRootRoute?: string
  /** Alias app imports of TanStack Router and Start to native-safe entries. */
  aliases?: {
    router?: boolean
    start?: boolean
  }
  environmentName?: string
  generateFunctionId?: StartClientCompilerViteOptions['generateFunctionId']
}

/** Compile a React Start route tree as a standalone NativeScript client. */
export function tanstackStartNativeScript(
  options: TanStackStartNativeScriptOptions,
): Array<PluginOption> {
  const routesDirectory =
    options.router && options.router.routesDirectory
      ? options.router.routesDirectory
      : undefined

  return [
    tanstackReactNativeScript({
      appDirectories: options.appDirectories,
      routesDirectory,
      nativeOverrides: options.nativeOverrides,
      nativeRootRoute: options.nativeRootRoute,
      packageAliases: {
        '@tanstack/react-router':
          options.aliases?.router === false
            ? false
            : '@tanstack/react-nativescript-router',
        '@tanstack/react-start':
          options.aliases?.start === false
            ? false
            : '@tanstack/react-start/nativescript',
      },
    }),
    options.router === false
      ? null
      : tanstackRouterGenerator({
          target: 'react',
          ...options.router,
        }),
    ...startClientCompilerVite({
      framework: 'react',
      serverFnBase: options.serverFnBase,
      serverFnMode: options.serverFnMode,
      environmentName: options.environmentName,
      generateFunctionId: options.generateFunctionId,
    }),
  ]
}
