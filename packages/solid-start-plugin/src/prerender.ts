import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getRollupConfig } from 'nitropack/rollup'
import { createNitro } from 'nitropack'
import { joinURL, withBase, withoutBase } from 'ufo'
import { buildNitroEnvironment } from './nitro/build-nitro.js'
import { createPool } from './createPool.js'
import type { fork } from 'node:child_process'
import type { ViteBuilder } from 'vite'
import type { $Fetch, Nitro } from 'nitropack'
import type { TanStackStartOutputConfig } from './schema.js'

interface ServerProcess {
  process: ReturnType<typeof fork>
  port: number
  baseUrl: string
}

export async function prerender({
  options,
  nitro,
  builder,
}: {
  options: TanStackStartOutputConfig
  nitro: Nitro
  builder: ViteBuilder
}) {
  console.info('Prendering pages...')

  const serverEnv = builder.environments['server']

  if (!serverEnv) {
    throw new Error(`Vite's "server" environment not found`)
  }

  const prerenderOutputDir = path.resolve(
    options.root,
    'node_modules/.tanstack-start/prerenderer',
  )

  const nodeNitro = await createNitro({
    ...nitro.options._config,
    preset: 'nitro-prerender',
    logLevel: 0,
    output: {
      dir: prerenderOutputDir,
      serverDir: path.resolve(prerenderOutputDir, 'server'),
      publicDir: path.resolve(prerenderOutputDir, 'public'),
    },
  })

  const nodeNitroRollupOptions = getRollupConfig(nodeNitro)

  const build = serverEnv.config.build

  build.outDir = prerenderOutputDir

  build.rollupOptions = {
    ...build.rollupOptions,
    ...nodeNitroRollupOptions,
    output: {
      ...build.rollupOptions.output,
      ...nodeNitroRollupOptions.output,
      sourcemap: undefined,
    },
  }

  await buildNitroEnvironment(nodeNitro, () => builder.build(serverEnv))

  // Import renderer entry
  const serverFilename =
    typeof nodeNitro.options.rollupConfig?.output.entryFileNames === 'string'
      ? nodeNitro.options.rollupConfig.output.entryFileNames
      : 'index.mjs'

  const serverEntrypoint = path.resolve(
    nodeNitro.options.output.serverDir,
    serverFilename,
  )

  const { closePrerenderer, localFetch } = (await import(serverEntrypoint)) as {
    closePrerenderer: () => void
    localFetch: $Fetch
  }

  try {
    // Crawl all pages
    const pages = await crawlPages()

    console.info(`Prerendered ${pages.length} pages:`)
    pages.forEach((page) => {
      console.info(`- ${page}`)
    })

    // TODO: Write the prerendered pages to the output directory
  } catch (error) {
    console.error(error)
  } finally {
    // Ensure server is always closed
    // server.process.kill()
    closePrerenderer()
  }

  function extractLinks(html: string): Array<string> {
    const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>/g
    const links: Array<string> = []
    let match

    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1]
      if (href && (href.startsWith('/') || href.startsWith('./'))) {
        links.push(href)
      }
    }

    return links
  }

  async function crawlPages() {
    const seen = new Set<string>()
    const retriesByPath = new Map<string, number>()
    const initialPages = new Set<string>(['/'])
    const concurrency = os.cpus().length
    console.info(`Concurrency: ${concurrency}`)
    const pool = createPool({ concurrency })

    for (const pathname of initialPages) {
      if (seen.has(pathname)) continue
      pool.add(crawlPageTask(pathname))
    }

    await pool.start()

    return Array.from(seen)

    function crawlPageTask(pathname: string) {
      seen.add(pathname)
      return async () => {
        console.info(`Crawling: ${pathname}`)
        const retries = retriesByPath.get(pathname) || 0
        try {
          // Fetch the route
          const encodedRoute = encodeURI(pathname)

          const res = await localFetch<Response>(
            withBase(encodedRoute, nodeNitro.options.baseURL),
            {
              headers: { 'x-nitro-prerender': encodedRoute },
              retry: nodeNitro.options.prerender.retry,
              retryDelay: nodeNitro.options.prerender.retryDelay,
            },
          )

          if (!res.ok) {
            throw new Error(`Failed to fetch ${pathname}: ${res.statusText}`)
          }

          // Guess route type and populate fileName
          const contentType = res.headers.get('content-type') || ''
          const isImplicitHTML =
            !pathname.endsWith('.html') && contentType.includes('html')
          // &&
          // !JsonSigRx.test(dataBuff.subarray(0, 32).toString('utf8'))
          const routeWithIndex = pathname.endsWith('/')
            ? pathname + 'index'
            : pathname

          const htmlPath =
            pathname.endsWith('/') || nitro.options.prerender.autoSubfolderIndex
              ? joinURL(pathname, 'index.html')
              : pathname + '.html'

          const filename = withoutBase(
            isImplicitHTML ? htmlPath : routeWithIndex,
            nitro.options.baseURL,
          )

          const html = await res.text()

          const filepath = path.join(nitro.options.output.publicDir, filename)

          await fsp.mkdir(path.dirname(filepath), {
            recursive: true,
          })

          await fsp.writeFile(filepath, html)

          // Find new links
          const links = extractLinks(html)
          for (const link of links) {
            if (!seen.has(link)) {
              pool.add(crawlPageTask(link))
            }
          }
        } catch (error) {
          if (retries < 3) {
            console.warn(`Encountered error, retrying: ${pathname} in 500ms`)
            await new Promise((resolve) => setTimeout(resolve, 500))
            retriesByPath.set(pathname, retries + 1)
            pool.add(crawlPageTask(pathname))
          } else {
            throw error
          }
        }
      }
    }
  }
}
