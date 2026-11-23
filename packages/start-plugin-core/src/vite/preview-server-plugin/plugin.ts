import { pathToFileURL } from 'node:url'
import { basename, extname, join } from 'pathe'
import { NodeRequest, sendNodeResponse } from 'srvx/node'
import { joinURL } from 'ufo'
import { VITE_ENVIRONMENT_NAMES } from '../../constants'
import { getServerOutputDirectory } from '../output-directory'
import { getBundlerOptions } from '../../utils'
import type { Plugin } from 'vite'

export function previewServerPlugin(): Plugin {
  return {
    name: 'tanstack-start-core:preview-server',
    configurePreviewServer: {
      // Run last so platform plugins (Cloudflare, Vercel, etc.) can register their handlers first
      order: 'post',
      handler(server) {
        // Return a function so Vite's internal middlewares (static files, etc.) handle requests first.
        // Our SSR handler only processes requests that nothing else handled.
        return () => {
          // Cache the server build to avoid re-importing on every request
          let serverBuild: any = null

          server.middlewares.use(async (req, res, next) => {
            try {
              // Lazy load server build on first request
              if (!serverBuild) {
                // Derive output filename from input
                const serverEnv =
                  server.config.environments[VITE_ENVIRONMENT_NAMES.server]
                const serverInput =
                  getBundlerOptions(serverEnv?.build)?.input ?? 'server'

                if (typeof serverInput !== 'string') {
                  throw new Error('Invalid server input. Expected a string.')
                }

                // Get basename without extension and add .js
                const outputFilename = `${basename(serverInput, extname(serverInput))}.js`
                const serverOutputDir = getServerOutputDirectory(server.config)
                const serverEntryPath = join(serverOutputDir, outputFilename)
                const imported = await import(
                  pathToFileURL(serverEntryPath).toString()
                )

                serverBuild = imported.default
              }

              // Prepend base path to request URL to match routing setup
              req.url = joinURL(server.config.base, req.url ?? '/')

              const webReq = new NodeRequest({ req, res })
              const webRes: Response = await serverBuild.fetch(webReq)

              if (webRes.headers.get('content-type')?.startsWith('text/html')) {
                res.setHeader('content-encoding', 'identity')
              }

              // Vite preview's compression middleware wraps writeHead() and reads its headers as an object,
              // so the [name, value, ...] array srvx sends them as would become headers named "0", "1", ...
              // Set the headers here and give srvx only the body.
              // setHeader(), not setHeaders(): Vite's HTTPS server is HTTP/2, whose responses have no setHeaders().
              for (const [name, value] of webRes.headers) {
                if (name !== 'set-cookie') {
                  res.setHeader(name, value)
                }
              }
              // (all at once: Headers gives each cookie as its own entry, and setHeader() replaces)
              const cookies = webRes.headers.getSetCookie()
              if (cookies.length > 0) {
                res.setHeader('set-cookie', cookies)
              }
              res.writeHead(webRes.status, webRes.statusText)

              return sendNodeResponse(
                res,
                // (the status too: with compression, srvx's writeHead() is the one that sends it)
                new Response(webRes.body, {
                  status: webRes.status,
                  statusText: webRes.statusText,
                }),
              )
            } catch (error) {
              next(error)
            }
          })
        }
      },
    },
  }
}
