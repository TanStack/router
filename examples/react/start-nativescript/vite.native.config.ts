import { getCliFlags } from '@nativescript/vite'
import { reactConfig } from '@nativescript/vite/react'
import { tanstackStartNativeScript } from '@tanstack/react-start/plugin/nativescript'
import { defineConfig, mergeConfig } from 'vite'

function isAndroidBuild(): boolean {
  // NATIVESCRIPT_BUNDLER_ENV is checked first: the CLI injects it into the
  // integrated dev-server process, where the argv --env flags may be absent.
  try {
    const env = JSON.parse(process.env.NATIVESCRIPT_BUNDLER_ENV ?? '{}')
    if (env.android) {
      return true
    }
    if (env.ios || env.visionos) {
      return false
    }
  } catch {
    // fall through to the argv flags
  }
  return Boolean(getCliFlags().android)
}

function getServerFnBase(mode: string): string {
  const configured = process.env.TSS_SERVER_FN_BASE
  if (configured) {
    return configured
  }
  if (mode === 'production') {
    throw new Error(
      'Set TSS_SERVER_FN_BASE to the deployed absolute Start server-function URL before building the native app.',
    )
  }
  return isAndroidBuild()
    ? 'http://10.0.2.2:3000/_serverFn/'
    : 'http://127.0.0.1:3000/_serverFn/'
}

export default defineConfig(({ mode }) =>
  mergeConfig(reactConfig({ mode }), {
    resolve: {
      preserveSymlinks: false,
    },
    plugins: [
      tanstackStartNativeScript({
        serverFnBase: getServerFnBase(mode),
        serverFnMode: mode === 'production' ? 'build' : 'dev',
        nativeRootRoute: 'src/native/root-route.tsx',
      }),
    ],
  }),
)
