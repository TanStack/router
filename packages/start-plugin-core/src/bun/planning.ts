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

function defineReplaceEnv(
  key: string,
  value: string,
): Record<string, string> {
  return {
    [`process.env.${key}`]: JSON.stringify(value),
    [`import.meta.env.${key}`]: JSON.stringify(value),
  }
}

export function createBunDefine(opts: {
  serverFnBase: string
  routerBasepath: string
  publicBase: string
  isDev: boolean
  inlineCssEnabled: boolean
  spaEnabled?: boolean
  disableCsrfMiddlewareWarning?: boolean
  /** Extra define entries (e.g. from `.env`). */
  extraDefine?: Record<string, string>
}): Record<string, string> {
  return {
    ...defineReplaceEnv('TSS_SERVER_FN_BASE', opts.serverFnBase),
    ...defineReplaceEnv('TSS_ROUTER_BASEPATH', opts.routerBasepath),
    ...defineReplaceEnv('TSS_DEV_SERVER', opts.isDev ? 'true' : 'false'),
    ...defineReplaceEnv(
      'TSS_SHELL',
      opts.isDev && opts.spaEnabled ? 'true' : 'false',
    ),
    ...defineReplaceEnv(
      'TSS_INLINE_CSS_ENABLED',
      opts.inlineCssEnabled ? 'true' : 'false',
    ),
    ...defineReplaceEnv(
      'TSS_DEV_SSR_STYLES_ENABLED',
      opts.isDev ? 'true' : 'false',
    ),
    ...defineReplaceEnv('TSS_DEV_SSR_STYLES_BASEPATH', opts.publicBase),
    ...defineReplaceEnv(
      'TSS_DISABLE_CSRF_MIDDLEWARE_WARNING',
      opts.disableCsrfMiddlewareWarning ? 'true' : 'false',
    ),
    ...defineReplaceEnv('TSS_PUBLIC_BASE', opts.publicBase),
    ...(opts.extraDefine ?? {}),
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
