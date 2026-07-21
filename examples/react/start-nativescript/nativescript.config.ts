import type { NativeScriptConfig } from '@nativescript/core'

export default {
  id: 'com.tanstack.startnativescript',
  appPath: 'src',
  appResourcesPath: 'App_Resources',
  bundler: 'vite',
  bundlerConfigPath: 'vite.native.config.ts',
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none',
  },
  cli: {
    packageManager: 'pnpm',
    additionalPathsToClean: ['.ns-vite-build'],
  },
} satisfies NativeScriptConfig
