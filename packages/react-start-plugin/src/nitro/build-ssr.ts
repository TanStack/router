import { resolve } from 'node:path'
import { build, mergeConfig } from 'vite'
import type { UserConfig } from 'vite'

export async function buildSSRApp({
  root,
  viteConfig,
  ssrEntry,
}: {
  root: string
  viteConfig: UserConfig
  ssrEntry: string
}) {
  const ssrBuildConfig = mergeConfig(viteConfig, {
    build: {
      ssr: true,
      rollupOptions: {
        input: ssrEntry,
      },
      outDir: resolve(root, 'dist/ssr'),
    },
  })

  await build(ssrBuildConfig)
}
