import { watch, existsSync, readFileSync } from 'node:fs'
import { dirname, extname, join, normalize, relative, isAbsolute } from 'pathe'
import { formatListenBanner } from './listen-urls'
import { tryServeClientAsset } from './static-host'
import {
  classifyBunChange,
  hmrEventForScope,
  rebuildScopeForChange,
  shouldRegenerateRoutes,
  type BunChangeInfo,
  type BunHmrEventType,
  type BunRebuildResult,
} from './hmr-protocol'
import {
  DEV_CLIENT_PATH,
  FS_PREFIX,
  getHmrClientModuleSource,
  getHmrClientScriptTag,
  HMR_CLIENT_PATH,
  HMR_SSE_PATH,
  REACT_REFRESH_PATH,
  rewriteImportMetaHot,
} from './hmr-runtime'
import {
  fileExists,
  resolveBareSpecifier,
  resolveFsCandidate,
  transformDevModule,
  type DevTransformOptions,
} from './dev-transform'
import {
  DEPS_PREFIX,
  runOptimizeDeps,
  type OptimizeDepsResult,
} from './optimize-deps'
import {
  applyReactRefreshBabel,
  getReactRefreshBrowserEntry,
} from './react-refresh'
import {
  getNodeBuiltinStubSource,
  isNodeBuiltinFsPath,
  isNodeBuiltinSpecifier,
} from './node-builtin-stub'
import type { CompileStartFrameworkOptions } from '../types'

export interface BunDevServerOptions {
  root: string
  port: number
  hostname: string
  clientOutDir: string
  serverOutDir: string
  publicBase: string
  framework: CompileStartFrameworkOptions
  /** Absolute path to the app client entry (resolved file). */
  clientEntryPath: string
  /** `#tanstack-router-entry` / start / client / server → absolute files. */
  aliases?: Record<string, string>
  /** Define replacements for ESM-dev transforms. */
  define?: Record<string, string>
  /**
   * When true (default), serve client modules via on-demand ESM transform
   * (Phase 2). Server still uses the built handler.
   */
  esmDev?: boolean
  rebuild: (change: BunChangeInfo) => Promise<BunRebuildResult>
  invalidate: (ids: Iterable<string>) => void
  /** App module transform (code-splitter + StartCompiler). */
  transformAppModule?: DevTransformOptions['transformAppModule']
  /** Debounce window for coalescing rapid fs events (ms). */
  debounceMs?: number
  /** CSS emitted during builds for `/@tanstack-start/styles.css`. */
  emittedCss?: Map<string, string>
  /**
   * Vite-like dependency prebundling for ESM-dev (`/@deps`).
   * `false` disables; omit uses defaults (scan `src/` bare imports).
   */
  optimizeDeps?: import('./optimize-deps').OptimizeDepsConfig | false
}

/**
 * Clears production script/preload URLs from the SSR router manifest so ESM-dev
 * does not load built `/assets/*.js` after the SSR bootstrap.
 */
const ESM_DEV_MANIFEST_SCRUB_SCRIPT = `<script>
(function(){
  function scrub(routes){
    if(!routes) return;
    for (var id in routes) {
      var r = routes[id];
      if (r) { r.scripts = []; r.preloads = []; }
    }
  }
  var t = self.$_TSR;
  if (t && t.router && t.router.manifest) scrub(t.router.manifest.routes);
  document.currentScript && document.currentScript.remove();
})();
</script>`

/**
 * Vite-style `server.fs.allow` defaults: project root + nearest workspace root.
 * Prevents `/@fs` from serving arbitrary filesystem paths when hostname is `0.0.0.0`.
 */
export function resolveFsAllowList(root: string): Array<string> {
  const roots = new Set<string>([normalize(root)])
  let dir = normalize(root)
  for (let i = 0; i < 12; i++) {
    if (
      existsSync(join(dir, 'pnpm-workspace.yaml')) ||
      existsSync(join(dir, 'lerna.json')) ||
      existsSync(join(dir, 'nx.json')) ||
      hasPackageJsonWorkspaces(dir)
    ) {
      roots.add(dir)
      break
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }
  return [...roots]
}

/** Detect npm/Yarn/Bun `package.json` workspaces at a directory. */
function hasPackageJsonWorkspaces(dir: string): boolean {
  try {
    const raw = readFileSync(join(dir, 'package.json'), 'utf8')
    const pkg = JSON.parse(raw) as {
      workspaces?: Array<string> | { packages?: Array<string> }
    }
    if (Array.isArray(pkg.workspaces)) {
      return pkg.workspaces.length > 0
    }
    if (pkg.workspaces && Array.isArray(pkg.workspaces.packages)) {
      return pkg.workspaces.packages.length > 0
    }
    return false
  } catch {
    return false
  }
}

/** Return true when `absPath` is under one of the allow-list roots. */
export function isPathInsideAllowList(
  absPath: string,
  allowList: ReadonlyArray<string>,
): boolean {
  const normalized = normalize(absPath)
  for (const root of allowList) {
    const rel = relative(normalize(root), normalized)
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      return true
    }
  }
  return false
}

/** Resolve a request pathname under `public/`, rejecting path traversal. */
export function resolvePublicAssetPath(
  root: string,
  pathname: string,
): string | null {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0') || decoded.includes('..')) {
    return null
  }
  const publicDir = normalize(join(root, 'public'))
  const relativePath = decoded.replace(/^\//, '')
  const candidate = normalize(join(publicDir, relativePath))
  if (!isPathInsideAllowList(candidate, [publicDir])) {
    return null
  }
  return candidate
}

/** Inject HMR / React Refresh / ESM-dev entry scripts into HTML. */
function injectDevScripts(
  html: string,
  opts: { framework: CompileStartFrameworkOptions; esmDev: boolean },
): string {
  // Drop production / prior ESM entry tags — we re-inject in a fixed order.
  let next = html.replace(
    /<script[^>]*type=["']module["'][^>]*src=["'][^"']*(?:\/assets\/[^"']+|\/@tanstack-dev\/client)["'][^>]*><\/script>\s*/gi,
    '',
  )
  next = next.replace(
    /<script[^>]*src=["'][^"']*(?:\/assets\/[^"']+|\/@tanstack-dev\/client)["'][^>]*type=["']module["'][^>]*><\/script>\s*/gi,
    '',
  )

  if (opts.esmDev) {
    // Built /assets/*.js must not load alongside ESM-dev — a second StartClient
    // would hydrate after $_TSR.h() tears down bootstrap data.
    next = next.replace(/<link\b[^>]*>/gi, (tag) => {
      if (!/\/assets\//.test(tag)) {
        return tag
      }
      if (/\.css\b/i.test(tag)) {
        return tag
      }
      return ''
    })
  }

  const parts: Array<string> = []
  // React Refresh MUST run before app modules (provides $RefreshSig$ / $RefreshReg$).
  if (opts.framework === 'react' && opts.esmDev) {
    parts.push(
      `<script type="module" src="${REACT_REFRESH_PATH}"></script>`,
    )
  }
  parts.push(getHmrClientScriptTag())
  if (opts.esmDev) {
    parts.push(`<script type="module" src="${DEV_CLIENT_PATH}"></script>`)
  }

  const injection = parts.join('\n')
  // Scrub must run after $tsr bootstrap (end of body), before deferred modules.
  // Without this, SSR manifest still points at built /assets/*.js and the browser
  // loads a second StartClient after $_TSR.h() tears down bootstrap data.
  const scrubManifest = opts.esmDev ? ESM_DEV_MANIFEST_SCRUB_SCRIPT : ''

  if (next.includes('</head>')) {
    next = next.replace('</head>', `${injection}\n</head>`)
  } else if (next.includes('</body>')) {
    next = next.replace('</body>', `${injection}</body>`)
  } else {
    next = `${next}${injection}`
  }

  if (scrubManifest) {
    if (next.includes('</body>')) {
      next = next.replace('</body>', `${scrubManifest}</body>`)
    } else {
      next = `${next}${scrubManifest}`
    }
  }
  return next
}

/** Encode an HMR event as an SSE `data:` payload. */
function encodeSse(
  event: BunHmrEventType,
  modules?: Array<string>,
  error?: string,
): string {
  const payload =
    event === 'update'
      ? JSON.stringify({ type: event, modules: modules ?? [] })
      : event === 'error'
        ? JSON.stringify({ type: event, error: error ?? 'Rebuild failed' })
        : JSON.stringify({ type: event })
  return `data: ${payload}\n\n`
}

/**
 * Bun.serve hosting built server handler + client assets / ESM middleware,
 * with classified rebuild and HMR EventSource protocol.
 */
export async function createBunDevServer(opts: BunDevServerOptions): Promise<{
  stop: () => void
  port: number
  hostname: string
}> {
  const serverEntry = join(opts.serverOutDir, 'server.js')
  const debounceMs = opts.debounceMs ?? 120
  const esmDev = opts.esmDev !== false

  let handlerModule = (await import(`${serverEntry}?t=${Date.now()}`)) as {
    default: { fetch: (req: Request) => Response | Promise<Response> }
  }

  const reloadClients = new Set<ReadableStreamDefaultController<Uint8Array>>()
  const encoder = new TextEncoder()

  const notify = (
    event: BunHmrEventType,
    modules?: Array<string>,
    error?: string,
  ) => {
    const payload = encoder.encode(encodeSse(event, modules, error))
    for (const controller of reloadClients) {
      try {
        controller.enqueue(payload)
      } catch {
        reloadClients.delete(controller)
      }
    }
  }

  let rebuildTimer: ReturnType<typeof setTimeout> | undefined
  let rebuildQueued = false
  let pendingPath: string | undefined

  const runRebuild = async () => {
    if (rebuildQueued) {
      return
    }
    rebuildQueued = true
    const changedPath = pendingPath
    pendingPath = undefined
    try {
      if (changedPath) {
        opts.invalidate([changedPath])
      }
      const kind = changedPath
        ? classifyBunChange(opts.root, changedPath)
        : 'unknown'
      const result = await opts.rebuild({
        path: changedPath ?? '',
        kind,
      })
      if (!result.skipServerReload) {
        handlerModule = (await import(`${serverEntry}?t=${Date.now()}`)) as {
          default: { fetch: (req: Request) => Response | Promise<Response> }
        }
      }

      if (result.error) {
        notify('error', undefined, result.error)
        return
      }

      // Phase 2: prefer module updates when ESM graph is live and only client changed
      if (
        esmDev &&
        changedPath &&
        (result.event === 'client-reload' || result.event === 'update')
      ) {
        const modules =
          result.modules ??
          (changedPath
            ? [`${FS_PREFIX}${normalize(changedPath)}`]
            : undefined)
        notify('update', modules)
      } else {
        notify(result.event, result.modules)
      }
      console.info(
        `[tanstack-start-bun] rebuilt (${result.scope} → ${result.event})`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.stack ?? error.message : String(error)
      console.error('[tanstack-start-bun] rebuild failed', error)
      notify('error', undefined, message)
    } finally {
      rebuildQueued = false
      if (pendingPath) {
        scheduleRebuild(pendingPath)
      }
    }
  }

  const scheduleRebuild = (changedPath: string) => {
    pendingPath = changedPath
    if (rebuildTimer) {
      clearTimeout(rebuildTimer)
    }
    rebuildTimer = setTimeout(() => {
      rebuildTimer = undefined
      void runRebuild()
    }, debounceMs)
  }

  const srcDir = join(opts.root, 'src')
  const watcher = existsSync(srcDir)
    ? watch(srcDir, { recursive: true }, (_event, filename) => {
        if (!filename) {
          return
        }
        if (filename.includes('routeTree.gen.')) {
          return
        }
        scheduleRebuild(join(srcDir, filename))
      })
    : null

  if (!watcher) {
    console.warn(
      `[tanstack-start-bun] No src/ directory at ${srcDir}; file watching disabled`,
    )
  }

  const optimizedDeps: OptimizeDepsResult = esmDev
    ? await runOptimizeDeps({
        root: opts.root,
        clientEntryPath: opts.clientEntryPath,
        aliases: opts.aliases,
        optimizeDeps: opts.optimizeDeps,
      })
    : {
        depsDir: '',
        hash: '',
        count: 0,
        urlForSpec: () => undefined,
        resolvePath: () => null,
        fallbackFsUrl: () => undefined,
      }

  const transformOpts: DevTransformOptions = {
    root: opts.root,
    framework: opts.framework,
    aliases: opts.aliases,
    define: opts.define,
    transformAppModule: opts.transformAppModule,
    optimizeDepsUrl: optimizedDeps.urlForSpec,
    applyReactRefresh:
      opts.framework === 'react'
        ? (code, absPath) => applyReactRefreshBabel(code, absPath)
        : undefined,
  }

  const fsAllowList = resolveFsAllowList(opts.root)

  function cacheControlForFsPath(absPath: string): string {
    // Bun 目录含版本哈希（react-aria@3.51.0+…）；应用源码仍 no-store 以便 HMR
    const normalized = absPath.replace(/\\/g, '/')
    if (
      normalized.includes('/node_modules/') ||
      normalized.includes('/.bun/')
    ) {
      return 'public, max-age=31536000, immutable'
    }
    return 'no-store'
  }

  async function serveEsmPath(url: URL): Promise<Response | null> {
    if (!esmDev) {
      return null
    }

    if (url.pathname === HMR_CLIENT_PATH) {
      return new Response(
        getHmrClientModuleSource({
          ssePath: HMR_SSE_PATH,
          enableReactRefresh: opts.framework === 'react',
        }),
        {
          headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        },
      )
    }

    if (url.pathname === REACT_REFRESH_PATH) {
      return new Response(await getReactRefreshBrowserEntry(), {
        headers: {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (url.pathname === DEV_CLIENT_PATH) {
      const entryUrl = `${FS_PREFIX}${normalize(opts.clientEntryPath)}`
      let code = `import ${JSON.stringify(entryUrl)}\n`
      code = rewriteImportMetaHot(code)
      return new Response(code, {
        headers: {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (url.pathname.startsWith(`${DEPS_PREFIX}/`)) {
      const abs = optimizedDeps.resolvePath(url.pathname)
      if (abs) {
        const code = await Bun.file(abs).text()
        return new Response(code, {
          headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }
      // Stale browser cache may still request /@deps/react.js after React
      // was moved back to /@fs — redirect instead of text/plain 404.
      const fsFallback = optimizedDeps.fallbackFsUrl(url.pathname)
      if (fsFallback) {
        return Response.redirect(`${url.origin}${fsFallback}`, 302)
      }
      return new Response(`// not found: ${url.pathname}\nexport {}\n`, {
        status: 404,
        headers: {
          'Content-Type': 'text/javascript; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      })
    }

    if (url.pathname.startsWith('/@id/')) {
      const encoded = url.pathname.slice('/@id/'.length)
      const spec = decodeURIComponent(encoded)
      if (isNodeBuiltinSpecifier(spec)) {
        return new Response(getNodeBuiltinStubSource(spec), {
          headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      }
      const depsUrl = optimizedDeps.urlForSpec(spec)
      if (depsUrl) {
        return Response.redirect(`${url.origin}${depsUrl}`, 302)
      }
      const importer =
        url.searchParams.get('importer') ?? opts.clientEntryPath
      const resolved = await resolveBareSpecifier(
        spec,
        importer,
        opts.aliases,
      )
      if (!resolved) {
        return new Response(`Cannot resolve ${spec}`, { status: 404 })
      }
      // Bun.resolve returns "node:…" literally — stub instead of /@fs
      if (isNodeBuiltinSpecifier(resolved)) {
        return new Response(getNodeBuiltinStubSource(resolved), {
          headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      }
      // Redirect browser to /@fs so subsequent relative imports work
      return Response.redirect(
        `${url.origin}${FS_PREFIX}${normalize(resolved)}`,
        302,
      )
    }

    if (url.pathname.startsWith(`${FS_PREFIX}/`) || url.pathname.startsWith(FS_PREFIX)) {
      const abs = normalize(url.pathname.slice(FS_PREFIX.length) || '/')
      if (isNodeBuiltinFsPath(abs)) {
        return new Response(getNodeBuiltinStubSource(abs), {
          headers: {
            'Content-Type': 'text/javascript; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      }
      const resolvedFs = resolveFsCandidate(abs)
      if (!resolvedFs) {
        return new Response(`Not found: ${abs}`, { status: 404 })
      }
      if (!isPathInsideAllowList(resolvedFs, fsAllowList)) {
        return new Response(
          `Forbidden: path outside server.fs.allow (${resolvedFs})`,
          { status: 403 },
        )
      }
      // Extensionless URL → redirect to canonical path (stable module graph)
      if (resolvedFs !== abs && !extname(abs)) {
        return Response.redirect(
          `${url.origin}${FS_PREFIX}${resolvedFs}${url.search}`,
          302,
        )
      }
      try {
        const moduleId = `${resolvedFs}${url.search}`
        const result = await transformDevModule(transformOpts, moduleId)
        return new Response(result.code, {
          headers: {
            'Content-Type': result.contentType,
            'Cache-Control': cacheControlForFsPath(resolvedFs),
          },
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.stack ?? error.message : String(error)
        console.error('[tanstack-start-bun] transform failed', resolvedFs, error)
        return new Response(message, {
          status: 500,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    }

    // /src/... convenience
    if (url.pathname.startsWith('/src/')) {
      const abs = normalize(join(opts.root, url.pathname))
      if (!(await fileExists(abs))) {
        return new Response(`Not found: ${abs}`, { status: 404 })
      }
      try {
        const result = await transformDevModule(transformOpts, abs)
        return new Response(result.code, {
          headers: {
            'Content-Type': result.contentType,
            'Cache-Control': 'no-store',
          },
        })
      } catch (error) {
        const message =
          error instanceof Error ? error.stack ?? error.message : String(error)
        console.error('[tanstack-start-bun] transform failed', abs, error)
        return new Response(message, {
          status: 500,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    }

    return null
  }

  const server = Bun.serve({
    port: opts.port,
    hostname: opts.hostname,
    async fetch(req) {
      const url = new URL(req.url)

      // Strip publicBase for routing (Vite-style basepath rewrite)
      const publicBase = opts.publicBase || '/'
      if (publicBase !== '/' && url.pathname.startsWith(publicBase.replace(/\/$/, ''))) {
        const base = publicBase.replace(/\/$/, '')
        if (url.pathname === base || url.pathname.startsWith(`${base}/`)) {
          url.pathname =
            url.pathname.slice(base.length) || '/'
        }
      }

      if (url.pathname === HMR_SSE_PATH) {
        let streamController: ReadableStreamDefaultController<Uint8Array>
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller
            reloadClients.add(controller)
            controller.enqueue(encoder.encode(`: connected\n\n`))
          },
          cancel() {
            reloadClients.delete(streamController)
          },
        })
        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          },
        })
      }

      // Dev SSR styles endpoint (TSS_DEV_SSR_STYLES_ENABLED)
      if (url.pathname.endsWith('/@tanstack-start/styles.css')) {
        const routesParam = url.searchParams.get('routes')
        const ids = routesParam ? routesParam.split(',') : []
        const routesManifest = (globalThis as any).TSS_ROUTES_MANIFEST as
          | Record<string, { filePath?: string }>
          | undefined
        const chunks: Array<string> = []
        const emitted = opts.emittedCss

        if (emitted && emitted.size > 0) {
          if (ids.length > 0 && routesManifest) {
            const seen = new Set<string>()
            for (const routeId of ids) {
              const filePath = routesManifest[routeId]?.filePath
              if (!filePath) {
                continue
              }
              const normalizedRoute = filePath.replace(/\\/g, '/')
              for (const [cssPath, css] of emitted) {
                if (seen.has(cssPath)) {
                  continue
                }
                const normalizedCss = cssPath.replace(/\\/g, '/')
                if (
                  normalizedCss === normalizedRoute ||
                  normalizedCss.startsWith(`${normalizedRoute}.`) ||
                  normalizedCss.includes(normalizedRoute)
                ) {
                  seen.add(cssPath)
                  chunks.push(`/* ${cssPath} */\n${css}`)
                }
              }
            }
          }
          if (chunks.length === 0) {
            for (const [cssPath, css] of emitted) {
              chunks.push(`/* ${cssPath} */\n${css}`)
            }
          }
        }

        return new Response(chunks.join('\n\n'), {
          headers: {
            'Content-Type': 'text/css; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        })
      }

      const esmResponse = await serveEsmPath(url)
      if (esmResponse) {
        return esmResponse
      }

      const staticResponse = await tryServeClientAsset(
        opts.clientOutDir,
        url.pathname,
      )
      if (staticResponse) {
        return staticResponse
      }

      // Also serve files from public/ during dev (before first rebuild copy)
      try {
        const publicPath = resolvePublicAssetPath(opts.root, url.pathname)
        if (publicPath) {
          const publicFile = Bun.file(publicPath)
          if (await publicFile.exists()) {
            return new Response(publicFile)
          }
        }
      } catch {
        // ignore
      }

      const response = await handlerModule.default.fetch(req)
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('text/html')) {
        const html = await response.text()
        const headers = new Headers(response.headers)
        headers.set('Content-Type', 'text/html; charset=utf-8')
        return new Response(
          injectDevScripts(html, {
            framework: opts.framework,
            esmDev,
          }),
          {
            status: response.status,
            statusText: response.statusText,
            headers,
          },
        )
      }
      return response
    },
  })

  console.info(
    formatListenBanner({
      headline:
        `[tanstack-start-bun] dev server` + (esmDev ? ' (esm HMR)' : ''),
      hostname: opts.hostname,
      port: Number(server.port),
    }),
  )

  return {
    port: Number(server.port),
    hostname: opts.hostname,
    stop() {
      if (rebuildTimer) {
        clearTimeout(rebuildTimer)
      }
      watcher?.close()
      for (const controller of reloadClients) {
        try {
          controller.close()
        } catch {
          // ignore
        }
      }
      reloadClients.clear()
      server.stop(true)
    },
  }
}

// Re-export helpers for tests / plugin wiring
export {
  classifyBunChange,
  rebuildScopeForChange,
  hmrEventForScope,
  shouldRegenerateRoutes,
}
export type { BunChangeInfo, BunRebuildResult, BunHmrEventType }
