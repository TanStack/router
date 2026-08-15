import { describe, expect, it } from 'vitest'
import { createBunDefine } from '../src/bun/planning'
import { parseEnvFile, createEnvDefine } from '../src/bun/load-env'
import { transformCssModules, isCssModulesFile } from '../src/bun/css-modules'
import { copyPublicDirToClient } from '../src/bun/copy-public-dir'
import { generateSerializationAdaptersModule } from '../src/serialization-adapters-module'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

describe('createBunDefine', () => {
  it('defines process.env and import.meta.env pairs', () => {
    const define = createBunDefine({
      serverFnBase: '/_serverFn',
      routerBasepath: '/',
      publicBase: '/app/',
      isDev: true,
      inlineCssEnabled: false,
      spaEnabled: true,
      disableCsrfMiddlewareWarning: true,
    })

    expect(define['process.env.TSS_SERVER_FN_BASE']).toBe(
      JSON.stringify('/_serverFn'),
    )
    expect(define['import.meta.env.TSS_SERVER_FN_BASE']).toBe(
      JSON.stringify('/_serverFn'),
    )
    expect(define['process.env.TSS_SHELL']).toBe(JSON.stringify('true'))
    expect(define['process.env.TSS_DEV_SSR_STYLES_ENABLED']).toBe(
      JSON.stringify('true'),
    )
    expect(define['process.env.TSS_DISABLE_CSRF_MIDDLEWARE_WARNING']).toBe(
      JSON.stringify('true'),
    )
    expect(define['import.meta.env.TSS_PUBLIC_BASE']).toBe(
      JSON.stringify('/app/'),
    )
  })

  it('disables shell and SSR styles outside spa/dev', () => {
    const define = createBunDefine({
      serverFnBase: '/_serverFn',
      routerBasepath: '/',
      publicBase: '/',
      isDev: false,
      inlineCssEnabled: true,
      spaEnabled: true,
    })
    expect(define['process.env.TSS_SHELL']).toBe(JSON.stringify('false'))
    expect(define['process.env.TSS_DEV_SSR_STYLES_ENABLED']).toBe(
      JSON.stringify('false'),
    )
    expect(define['process.env.TSS_INLINE_CSS_ENABLED']).toBe(
      JSON.stringify('true'),
    )
  })
})

describe('load-env helpers', () => {
  it('parses KEY=VALUE lines', () => {
    const parsed = parseEnvFile(`
# comment
FOO=bar
QUOTED="hello world"
SINGLE='x'
`)
    expect(parsed.FOO).toBe('bar')
    expect(parsed.QUOTED).toBe('hello world')
    expect(parsed.SINGLE).toBe('x')
  })

  it('creates define entries for env keys', () => {
    const define = createEnvDefine({ API_URL: 'https://example.test' })
    expect(define['process.env.API_URL']).toBe(
      JSON.stringify('https://example.test'),
    )
    expect(define['import.meta.env.API_URL']).toBe(
      JSON.stringify('https://example.test'),
    )
  })
})

describe('css modules', () => {
  it('detects module css files', () => {
    expect(isCssModulesFile('Button.module.css')).toBe(true)
    expect(isCssModulesFile('app.css')).toBe(false)
  })

  it('hashes local class names and rewrites css', () => {
    const result = transformCssModules({
      css: `.title { color: red; }\n.row { display: flex; }`,
      filePath: '/app/src/Button.module.css',
    })
    expect(result.exports.title).toMatch(/^title_/)
    expect(result.exports.row).toMatch(/^row_/)
    expect(result.css).toContain(`.${result.exports.title}`)
    expect(result.css).not.toMatch(/(?<![\w-])\.title\s*\{/)
  })
})

describe('copyPublicDirToClient', () => {
  it('copies public assets into client out dir', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bun-public-'))
    try {
      await mkdir(join(root, 'public'), { recursive: true })
      await writeFile(join(root, 'public', 'robots.txt'), 'User-agent: *\n', 'utf8')
      const clientOutDir = join(root, 'dist', 'client')
      const result = await copyPublicDirToClient({ root, clientOutDir })
      expect(result.copied).toBe(true)
      const copied = await readFile(join(clientOutDir, 'robots.txt'), 'utf8')
      expect(copied).toContain('User-agent')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('no-ops when public is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bun-public-missing-'))
    try {
      const result = await copyPublicDirToClient({
        root,
        clientOutDir: join(root, 'dist', 'client'),
      })
      expect(result.copied).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('serialization adapters module (Bun virtual)', () => {
  it('emits empty module without adapters', () => {
    const code = generateSerializationAdaptersModule({
      adapters: undefined,
      runtime: 'client',
    })
    expect(code).toContain('pluginSerializationAdapters')
    expect(code).toContain('hasPluginAdapters = false')
  })

  it('emits imports for configured adapters', () => {
    const code = generateSerializationAdaptersModule({
      adapters: [
        {
          module: './adapters/date',
          export: 'dateAdapter',
          isFactory: true,
        },
      ],
      runtime: 'server',
    })
    expect(code).toContain('./adapters/date')
    expect(code).toContain('dateAdapter')
    expect(code).toContain('hasPluginAdapters = true')
  })
})
