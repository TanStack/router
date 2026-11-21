export interface ViteLike {
  build: (config: Record<string, unknown>) => Promise<unknown>
  createServer: (config: Record<string, unknown>) => Promise<{
    listen: () => Promise<unknown>
    close: () => Promise<void>
    resolvedUrls: { local: Array<string> } | null
  }>
}
export const viteVersions: Array<{
  major: number
  load: () => Promise<ViteLike>
}>
