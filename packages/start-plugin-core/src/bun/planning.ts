import { join } from 'pathe'
import { ENTRY_POINTS } from '../constants'
import type { ResolvedStartEntryPlan } from '../planning'
import { BUN_ENVIRONMENT_NAMES } from './types'

export { BUN_ENVIRONMENT_NAMES }

export interface BunResolvedEntryAliases {
  client: string
  server: string
  start: string
  router: string
  alias: Record<(typeof ENTRY_POINTS)[keyof typeof ENTRY_POINTS], string>
}

function normalizeEntryPath(filePath: string): string {
  return filePath.startsWith('file:')
    ? filePath
    : filePath.startsWith('/')
      ? filePath
      : join(process.cwd(), filePath)
}

export function createBunResolvedEntryAliases(opts: {
  entryPaths: ResolvedStartEntryPlan['entryPaths']
}): BunResolvedEntryAliases {
  const client = normalizeEntryPath(opts.entryPaths.client)
  const server = normalizeEntryPath(opts.entryPaths.server)
  const start = normalizeEntryPath(opts.entryPaths.start)
  const router = normalizeEntryPath(opts.entryPaths.router)

  return {
    client,
    server,
    start,
    router,
    alias: {
      [ENTRY_POINTS.client]: client,
      [ENTRY_POINTS.server]: server,
      [ENTRY_POINTS.start]: start,
      [ENTRY_POINTS.router]: router,
    },
  }
}

export function createBunDefine(opts: {
  serverFnBase: string
  routerBasepath: string
  publicBase: string
  isDev: boolean
  inlineCssEnabled: boolean
}): Record<string, string> {
  return {
    'process.env.TSS_SERVER_FN_BASE': JSON.stringify(opts.serverFnBase),
    'process.env.TSS_ROUTER_BASEPATH': JSON.stringify(opts.routerBasepath),
    'process.env.TSS_DEV_SERVER': JSON.stringify(opts.isDev),
    'process.env.TSS_SHELL': JSON.stringify(false),
    'process.env.TSS_INLINE_CSS_ENABLED': JSON.stringify(opts.inlineCssEnabled),
    'process.env.TSS_DEV_SSR_STYLES_ENABLED': JSON.stringify(false),
    'import.meta.env.TSS_PUBLIC_BASE': JSON.stringify(opts.publicBase),
  }
}

export function resolveBunOutputDirectories(opts: {
  root: string
  clientOutDir?: string
  serverOutDir?: string
}): { client: string; server: string } {
  return {
    client: join(opts.root, opts.clientOutDir ?? 'dist/client'),
    server: join(opts.root, opts.serverOutDir ?? 'dist/server'),
  }
}
