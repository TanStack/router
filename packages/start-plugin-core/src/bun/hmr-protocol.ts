/**
 * Change classification and SSE protocol for Bun Start HMR (Phase 1+).
 */

export type BunHmrEventType =
  | 'full-reload'
  | 'client-reload'
  | 'server-only'
  | 'update'
  | 'error'

export type BunRebuildScope = 'client' | 'server' | 'both'

export type BunChangeKind =
  | 'route'
  | 'route-tree'
  | 'server-only'
  | 'client'
  | 'src'
  | 'unknown'

export interface BunRebuildResult {
  scope: BunRebuildScope
  /** SSE event to broadcast after rebuild */
  event: BunHmrEventType
  /** Absolute module URLs/paths for Phase 2 `update` events */
  modules?: Array<string>
  /** When true, skip re-importing server.js (client-only ESM updates). */
  skipServerReload?: boolean
  /** Optional error message for client overlay */
  error?: string
}

export interface BunChangeInfo {
  path: string
  kind: BunChangeKind
}

const SERVER_ONLY_RE =
  /\.(server|server-fn)\.[cm]?[jt]sx?$|\.server\.[cm]?[jt]sx?$/i

/**
 * Classify a changed file for rebuild scoping.
 */
export function classifyBunChange(
  root: string,
  absPath: string,
): BunChangeKind {
  const normalized = absPath.replace(/\\/g, '/')
  const rootNorm = root.replace(/\\/g, '/').replace(/\/$/, '')

  if (normalized.includes('routeTree.gen.')) {
    return 'route-tree'
  }

  if (
    normalized.includes('/routes/') &&
    /\.[cm]?[jt]sx?$/.test(normalized)
  ) {
    return 'route'
  }

  if (SERVER_ONLY_RE.test(normalized)) {
    return 'server-only'
  }

  if (normalized.startsWith(`${rootNorm}/src/`)) {
    if (/\.(css|scss|sass|less)$/i.test(normalized)) {
      return 'client'
    }
    if (
      /\/(components|hooks|ui)(\/|$)/i.test(normalized) ||
      /\.client\.[cm]?[jt]sx?$/i.test(normalized)
    ) {
      return 'client'
    }
    return 'src'
  }

  return 'unknown'
}

/** Map a filesystem change kind to a rebuild scope. */
export function rebuildScopeForChange(kind: BunChangeKind): BunRebuildScope {
  switch (kind) {
    case 'server-only':
      return 'server'
    case 'client':
      return 'client'
    case 'route':
    case 'route-tree':
    case 'src':
    case 'unknown':
    default:
      return 'both'
  }
}

/** Map a rebuild scope to an HMR SSE event type. */
export function hmrEventForScope(scope: BunRebuildScope): BunHmrEventType {
  switch (scope) {
    case 'server':
      return 'server-only'
    case 'client':
      return 'client-reload'
    case 'both':
    default:
      return 'full-reload'
  }
}

/** Whether route generator should re-run for this change. */
export function shouldRegenerateRoutes(kind: BunChangeKind): boolean {
  return kind === 'route' || kind === 'route-tree' || kind === 'unknown'
}
