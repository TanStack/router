import { watch } from 'node:fs'
import { join, normalize } from 'pathe'
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
  transformDevModule,
  type DevTransformOptions,
} from './dev-transform'
import {
  applyReactRefreshBabel,
  getReactRefreshBrowserEntry,
} from './react-refresh'
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
}

function injectDevScripts(
  html: string,
  opts: { framework: CompileStartFrameworkOptions; esmDev: boolean },
): string {
  const parts: Array<string> = []
  if (opts.framework === 'react' && opts.esmDev) {
    parts.push(
      `<script type="module" src="${REACT_REFRESH_PATH}"></script>`,
    )
  }
  parts.push(getHmrClientScriptTag())

  // In ESM dev, ensure a module entry exists if HTML has no client script yet.
  if (opts.esmDev && !html.includes(DEV_CLIENT_PATH)) {
    parts.push(`<script type="module" src="${DEV_CLIENT_PATH}"></script>`)
  }

  const injection = parts.join('\n')
  if (html.includes(HMR_SSE_PATH) || html.includes(HMR_CLIENT_PATH)) {
    return html
  }
  if (html.includes('</body>')) {
    return html.replace('</body>', `${injection}</body>`)
  }
  return `${html}${injection}`
}

function encodeSse(event: BunHmrEventType, modules?: Array<string>): string {
  const payload =
    event === 'update'
      ? JSON.stringify({ type: event, modules: modules ?? [] })
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

  const notify = (event: BunHmrEventType, modules?: Array<string>) => {
    const payload = encoder.encode(encodeSse(event, modules))
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
    if (rebuildQueued) return
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
      handlerModule = (await import(`${serverEntry}?t=${Date.now()}`)) as {
        default: { fetch: (req: Request) => Response | Promise<Response> }
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
      console.error('[tanstack-start-bun] rebuild failed', error)
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

  const watcher = watch(
    join(opts.root, 'src'),
    { recursive: true },
    (_event, filename) => {
      if (!filename) return
      if (filename.includes('routeTree.gen.')) return
      scheduleRebuild(join(opts.root, 'src', filename))
    },
  )

  const transformOpts: DevTransformOptions = {
    root: opts.root,
    framework: opts.framework,
    transformAppModule: opts.transformAppModule,
    applyReactRefresh:
      opts.framework === 'react'
        ? (code, absPath) => applyReactRefreshBabel(code, absPath)
        : undefined,
  }

  async function serveEsmPath(url: URL): Promise<Response | null> {
    if (!esmDev) return null

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
      return new Response(getReactRefreshBrowserEntry(), {
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

    if (url.pathname.startsWith('/@id/')) {
      const encoded = url.pathname.slice('/@id/'.length)
      const spec = decodeURIComponent(encoded)
      const importer =
        url.searchParams.get('importer') ?? opts.clientEntryPath
      const resolved = await resolveBareSpecifier(spec, importer)
      if (!resolved) {
        return new Response(`Cannot resolve ${spec}`, { status: 404 })
      }
      // Redirect browser to /@fs so subsequent relative imports work
      return Response.redirect(
        `${url.origin}${FS_PREFIX}${normalize(resolved)}`,
        302,
      )
    }

    if (url.pathname.startsWith(`${FS_PREFIX}/`) || url.pathname.startsWith(FS_PREFIX)) {
      const abs = normalize(url.pathname.slice(FS_PREFIX.length) || '/')
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

      const response = await handlerModule.default.fetch(req)
      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('text/html')) {
        let html = await response.text()
        // Point hashed entry at ESM dev entry when possible
        if (esmDev) {
          html = html.replace(
            /<script[^>]+type=["']module["'][^>]+src=["'][^"']*assets\/[^"']+["'][^>]*><\/script>/g,
            `<script type="module" src="${DEV_CLIENT_PATH}"></script>`,
          )
        }
        return new Response(
          injectDevScripts(html, {
            framework: opts.framework,
            esmDev,
          }),
          {
            status: response.status,
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
            },
          },
        )
      }
      return response
    },
  })

  console.info(
    `[tanstack-start-bun] dev server http://${opts.hostname}:${server.port}` +
      (esmDev ? ' (esm HMR)' : ''),
  )

  return {
    port: Number(server.port),
    hostname: opts.hostname,
    stop() {
      if (rebuildTimer) {
        clearTimeout(rebuildTimer)
      }
      watcher.close()
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
