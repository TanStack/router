/**
 * First-class CSS pipeline for Bun.build:
 * - `import x from './file.css?url'` → hashed asset + `export default "/assets/..."`
 * - side-effect `import './file.css'` → hashed asset + empty JS module
 * - optional Tailwind v4 via `@tailwindcss/node` (optional peer)
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'pathe'
import { globSync } from 'tinyglobby'
import type { BunCssOptions } from './types'
import type { BunPlugin } from 'bun'

export interface CssAssetsPluginOptions {
  root: string
  clientOutDir: string
  publicBase: string
  srcDirectory: string
  css?: BunCssOptions | undefined
}

function normalizePublicBase(base: string): string {
  if (!base || base === '/') {
    return '/'
  }
  return base.endsWith('/') ? base : `${base}/`
}

function stripQuery(id: string): string {
  const q = id.indexOf('?')
  return q >= 0 ? id.slice(0, q) : id
}

function looksLikeTailwind(css: string): boolean {
  return (
    /@import\s+["']tailwindcss["']/.test(css) ||
    /@tailwind\s+/.test(css) ||
    /@theme\b/.test(css)
  )
}

async function collectTailwindCandidates(
  root: string,
  srcDirectory: string,
  contentGlobs?: Array<string>,
): Promise<Array<string>> {
  const patterns =
    contentGlobs && contentGlobs.length > 0
      ? contentGlobs
      : [
          join(srcDirectory, '**/*.{js,jsx,ts,tsx,html}'),
          join(srcDirectory, '**/*.{js,jsx,ts,tsx,html}').replace(/\\/g, '/'),
        ]

  const files = globSync(patterns, {
    cwd: root,
    absolute: true,
    onlyFiles: true,
  })

  const candidates = new Set<string>()
  // Rough class-like token scan (good enough for Tailwind utility discovery)
  const classRe = /[^a-zA-Z0-9_-]([a-zA-Z][a-zA-Z0-9_:/\[\]%.+-]*)/g
  for (const file of files) {
    let text: string
    try {
      text = await readFile(file, 'utf8')
    } catch {
      continue
    }
    classRe.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = classRe.exec(text)) !== null) {
      const token = match[1]
      if (token && token.length > 1 && !token.includes('://')) {
        candidates.add(token)
      }
    }
  }
  return [...candidates]
}

async function applyTailwind(
  css: string,
  opts: {
    id: string
    root: string
    srcDirectory: string
    content?: Array<string>
  },
): Promise<string | null> {
  try {
    // Resolve from the app root (not this package) so optional peer installs work
    // when start-plugin-core is symlinked from a monorepo.
    let twModulePath = '@tailwindcss/node'
    try {
      twModulePath = await Bun.resolve('@tailwindcss/node', opts.root)
    } catch {
      try {
        const { createRequire } = await import('node:module')
        const req = createRequire(join(opts.root, 'package.json'))
        twModulePath = req.resolve('@tailwindcss/node')
      } catch {
        // fall through to bare specifier
      }
    }

    const tw = (await import(twModulePath)) as {
      compile: (
        input: string,
        options: {
          base: string
          from?: string
          onDependency: (path: string) => void
        },
      ) => Promise<{ build: (candidates: Array<string>) => string }>
    }
    const compiled = await tw.compile(css, {
      base: dirname(opts.id),
      from: opts.id,
      onDependency() {},
    })
    const candidates = await collectTailwindCandidates(
      opts.root,
      opts.srcDirectory,
      opts.content,
    )
    return compiled.build(candidates)
  } catch (error) {
    console.warn(
      '[tanstack-start-bun] Tailwind CSS compile skipped:',
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

export function createCssAssetsPlugin(
  opts: CssAssetsPluginOptions,
): BunPlugin {
  const publicBase = normalizePublicBase(opts.publicBase)
  const written = new Map<string, string>() // abs path → public url
  const cssOpts = opts.css ?? {}
  const tailwindMode = cssOpts.tailwind ?? 'auto'

  const transformCss = async (code: string, id: string): Promise<string> => {
    let next = code
    if (cssOpts.transform) {
      next = await cssOpts.transform(next, { id })
    }

    const wantTailwind =
      tailwindMode === true ||
      (tailwindMode === 'auto' && looksLikeTailwind(next))

    if (wantTailwind) {
      const tw = await applyTailwind(next, {
        id,
        root: opts.root,
        srcDirectory: opts.srcDirectory,
        content: cssOpts.content,
      })
      if (tw !== null) {
        next = tw
      } else if (tailwindMode === true) {
        console.warn(
          '[tanstack-start-bun] bun.css.tailwind=true but @tailwindcss/node failed; emitting raw CSS',
        )
      }
    }

    return next
  }

  const emitCssAsset = async (filePath: string, css: string) => {
    const cached = written.get(filePath)
    if (cached) {
      return cached
    }
    const hash = createHash('sha256').update(css).digest('hex').slice(0, 8)
    const outName = `${basename(filePath, '.css')}-${hash}.css`
    const assetsDir = join(opts.clientOutDir, 'assets')
    await mkdir(assetsDir, { recursive: true })
    await writeFile(join(assetsDir, outName), css, 'utf8')
    const prefix =
      publicBase === '/' ? '' : publicBase.replace(/\/$/, '')
    const publicUrl = `${prefix}/assets/${outName}`
    written.set(filePath, publicUrl)
    return publicUrl
  }

  return {
    name: 'tanstack-start-bun:css-assets',
    setup(build) {
      build.onResolve({ filter: /\.css\?url$/ }, (args) => {
        const bare = args.path.replace(/\?url$/, '')
        let resolved = bare
        try {
          // Bun.resolve is async in some typings; prefer sync path join fallback
          const importerDir = dirname(args.importer || opts.root)
          resolved = bare.startsWith('/')
            ? bare
            : join(importerDir, bare)
        } catch {
          // keep bare
        }
        return { path: resolved, namespace: 'tss-css-url' }
      })

      build.onLoad({ filter: /.*/, namespace: 'tss-css-url' }, async (args) => {
        const filePath = stripQuery(args.path)
        const raw = await readFile(filePath, 'utf8')
        const css = await transformCss(raw, filePath)
        const url = await emitCssAsset(filePath, css)
        return {
          contents: `export default ${JSON.stringify(url)}`,
          loader: 'js',
        }
      })

      build.onLoad({ filter: /\.css$/ }, async (args) => {
        if (args.namespace === 'tss-css-url') {
          return undefined
        }
        const filePath = args.path
        const raw = await readFile(filePath, 'utf8')
        const css = await transformCss(raw, filePath)
        await emitCssAsset(filePath, css)
        // Side-effect import: empty module (CSS is a separate static asset)
        return {
          contents: 'export {}',
          loader: 'js',
        }
      })
    },
  }
}
