import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { join } from 'pathe'
import type { BunPlugin } from 'bun'
import type { CompileStartFrameworkOptions } from '../types'

const require = createRequire(import.meta.url)

export async function transformFrameworkJsx(opts: {
  code: string
  id: string
  env: 'client' | 'server'
  framework: CompileStartFrameworkOptions
  root: string
}): Promise<string | null> {
  if (opts.framework === 'react') {
    return null
  }
  // Only transform explicit JSX/TSX files — `.ts` often contains generics (`Foo<T>`)
  // that would false-positive a naive `<` / `>` check.
  if (!/\.[cm]?[jt]sx$/.test(opts.id.split('?')[0] ?? '')) {
    return null
  }
  if (!opts.code.includes('<') || !opts.code.includes('>')) {
    return null
  }
  if (opts.framework === 'solid') {
    return transformSolidJsx(opts.code, opts.id, opts)
  }
  if (opts.framework === 'vue') {
    return transformVueJsx(opts.code, opts.id, opts)
  }
  return null
}

/**
 * Framework JSX transforms for Bun.build.
 * React is handled by Bun natively; Solid/Vue need Babel presets.
 */
export function createFrameworkJsxPlugin(opts: {
  framework: CompileStartFrameworkOptions
  env: 'client' | 'server'
  root: string
}): BunPlugin | null {
  if (opts.framework === 'react') {
    return null
  }

  return {
    name: `tanstack-start-bun:jsx:${opts.framework}:${opts.env}`,
    setup(build) {
      build.onLoad({ filter: /\.[cm]?[jt]sx$/ }, async (args) => {
        if (args.path.includes('node_modules')) {
          return undefined
        }

        const code = await readFile(args.path, 'utf8')
        const transformed = await transformFrameworkJsx({
          code,
          id: args.path,
          env: opts.env,
          framework: opts.framework,
          root: opts.root,
        })
        if (!transformed) {
          return undefined
        }
        return {
          contents: transformed,
          loader:
            opts.framework === 'vue'
              ? 'js'
              : args.path.endsWith('x')
                ? 'tsx'
                : 'ts',
        }
      })
    },
  }
}

async function resolveFromAppOrPackage(
  root: string,
  specifiers: Array<string>,
): Promise<string | null> {
  for (const specifier of specifiers) {
    try {
      return await Bun.resolve(specifier, root)
    } catch {
      try {
        const req = createRequire(join(root, 'package.json'))
        return req.resolve(specifier)
      } catch {
        try {
          return require.resolve(specifier)
        } catch {
          // continue
        }
      }
    }
  }
  return null
}

async function transformSolidJsx(
  code: string,
  filename: string,
  opts: { env: 'client' | 'server'; root: string },
): Promise<string | null> {
  const babelPath = await resolveFromAppOrPackage(opts.root, ['@babel/core'])
  const solidPresetPath = await resolveFromAppOrPackage(opts.root, [
    'babel-preset-solid',
  ])
  const tsPresetPath = await resolveFromAppOrPackage(opts.root, [
    '@babel/preset-typescript',
  ])
  if (!babelPath || !solidPresetPath) {
    console.warn(
      '[tanstack-start-bun] Solid JSX requires optional peers @babel/core and babel-preset-solid',
    )
    return null
  }

  const babel = (await import(babelPath)) as {
    transformAsync: (
      code: string,
      options: Record<string, unknown>,
    ) => Promise<{ code?: string | null } | null>
  }
  const solidPreset =
    (await import(solidPresetPath)).default ?? (await import(solidPresetPath))
  const presets: Array<unknown> = [
    [
      solidPreset,
      {
        generate: opts.env === 'server' ? 'ssr' : 'dom',
        hydratable: true,
      },
    ],
  ]
  if (tsPresetPath) {
    const tsPreset =
      (await import(tsPresetPath)).default ?? (await import(tsPresetPath))
    presets.unshift([tsPreset, { isTSX: true, allExtensions: true }])
  }

  const result = await babel.transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    presets,
    sourceMaps: false,
  })

  return result?.code ?? null
}

async function transformVueJsx(
  code: string,
  filename: string,
  opts: { env: 'client' | 'server'; root: string },
): Promise<string | null> {
  const babelPath = await resolveFromAppOrPackage(opts.root, ['@babel/core'])
  const vueJsxPath = await resolveFromAppOrPackage(opts.root, [
    '@vue/babel-plugin-jsx',
  ])
  const tsPresetPath = await resolveFromAppOrPackage(opts.root, [
    '@babel/preset-typescript',
  ])
  if (!babelPath || !vueJsxPath) {
    console.warn(
      '[tanstack-start-bun] Vue JSX requires optional peers @babel/core and @vue/babel-plugin-jsx',
    )
    return null
  }

  const babel = (await import(babelPath)) as {
    transformAsync: (
      code: string,
      options: Record<string, unknown>,
    ) => Promise<{ code?: string | null } | null>
  }
  const vueJsx =
    (await import(vueJsxPath)).default ?? (await import(vueJsxPath))

  const presets: Array<unknown> = []
  if (tsPresetPath) {
    const tsPreset =
      (await import(tsPresetPath)).default ?? (await import(tsPresetPath))
    presets.push([tsPreset, { isTSX: true, allExtensions: true }])
  }

  const result = await babel.transformAsync(code, {
    filename,
    babelrc: false,
    configFile: false,
    presets,
    plugins: [[vueJsx, { ssr: opts.env === 'server' }]],
    sourceMaps: false,
  })

  return result?.code ?? null
}
