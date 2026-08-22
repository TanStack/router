import { describe, expect, it } from 'vitest'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyDefineReplacements,
  rewriteImportsForDevMiddleware,
  transformDevModule,
} from '../src/bun/dev-transform'

describe('applyDefineReplacements', () => {
  it('replaces longer keys first', () => {
    const out = applyDefineReplacements('process.env.TSS_FOO + process.env', {
      'process.env.TSS_FOO': '"x"',
      'process.env': '{}',
    })
    expect(out).toBe('"x" + {}')
  })

  it('no-ops without define', () => {
    expect(applyDefineReplacements('a', undefined)).toBe('a')
  })
})

describe('rewriteImportsForDevMiddleware', () => {
  it('rewrites Start entry aliases to /@fs paths', () => {
    const code = `import { getRouter } from '#tanstack-router-entry'`
    const out = rewriteImportsForDevMiddleware(
      code,
      '/app/src/main.tsx',
      '/app',
      { '#tanstack-router-entry': '/app/src/router.tsx' },
    )
    expect(out).toContain('/@fs/app/src/router.tsx')
    expect(out).not.toContain('#tanstack-router-entry')
  })

  it('rewrites relative imports to /@fs', () => {
    const code = `import { x } from './utils'`
    const out = rewriteImportsForDevMiddleware(
      code,
      '/app/src/main.tsx',
      '/app',
    )
    expect(out).toContain('/@fs/app/src/utils')
  })
})

describe('transformDevModule css ?url', () => {
  it('exports a stylesheet URL for ?url imports', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bun-dev-css-'))
    const cssPath = join(dir, 'app.css')
    try {
      await writeFile(cssPath, '@import "tailwindcss";\n', 'utf8')
      const result = await transformDevModule(
        { root: dir, framework: 'react' },
        `${cssPath}?url`,
      )
      expect(result.contentType).toContain('javascript')
      expect(result.code).toContain('/@tanstack-start/styles.css')
      expect(result.code).not.toContain('@import "tailwindcss"')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('exports SVG imports as data URLs instead of raw SVG source', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bun-dev-svg-'))
    const svgPath = join(dir, 'icon.svg')
    try {
      await writeFile(
        svgPath,
        '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>',
        'utf8',
      )
      const result = await transformDevModule(
        { root: dir, framework: 'react' },
        svgPath,
      )
      expect(result.contentType).toContain('javascript')
      expect(result.code).toContain('data:image/svg+xml')
      expect(result.code).not.toMatch(/^<svg/m)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
