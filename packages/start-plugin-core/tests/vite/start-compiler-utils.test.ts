import { describe, expect, test } from 'vitest'
import {
  createViteDevServerFnModuleSpecifierEncoder,
  decodeViteDevServerModuleSpecifier,
  getViteDevServerFnImport,
} from '../../src/vite/start-compiler-plugin/module-specifier'
import { mergeHotUpdateModules } from '../../src/vite/start-compiler-plugin/hot-update'
import type { EnvironmentModuleNode } from 'vite'

describe('Vite dev server module specifiers', () => {
  test('resolves registered server function ids before decoding them', () => {
    const generatedIdShapedManualId = Buffer.from(
      JSON.stringify({
        file: '/src/routes/wrong.tsx?tss-serverfn-split',
        export: 'wrong_createServerFn_handler',
      }),
      'utf8',
    ).toString('base64url')

    expect(
      getViteDevServerFnImport(generatedIdShapedManualId, {
        [generatedIdShapedManualId]: {
          functionName: 'getUser_createServerFn_handler',
          functionId: generatedIdShapedManualId,
          filename: '/repo/app/src/routes/users.tsx',
          extractedFilename:
            '/repo/app/src/routes/users.tsx?tss-serverfn-split',
          isClientReferenced: true,
        },
      }),
    ).toEqual({
      file: '/repo/app/src/routes/users.tsx?tss-serverfn-split',
      export: 'getUser_createServerFn_handler',
    })
  })

  test('falls back to decoding generated dev server function ids', () => {
    const encodedId = Buffer.from(
      JSON.stringify({
        file: '/src/routes/users.tsx?tss-serverfn-split',
        export: 'getUser_createServerFn_handler',
      }),
      'utf8',
    ).toString('base64url')

    expect(getViteDevServerFnImport(encodedId, {})).toEqual({
      file: '/src/routes/users.tsx?tss-serverfn-split',
      export: 'getUser_createServerFn_handler',
    })
  })

  test('encodes app files as root-relative dev server paths', () => {
    const encode = createViteDevServerFnModuleSpecifierEncoder('/repo/app')

    const specifier = encode({
      extractedFilename: '/repo/app/src/routes/index.tsx',
      root: '/repo/app',
    })

    expect(specifier).toBe('/src/routes/index.tsx')
    expect(decodeViteDevServerModuleSpecifier(specifier)).toBe(
      'src/routes/index.tsx',
    )
  })

  test('preserves POSIX absolute /@fs paths outside the app root', () => {
    const encode = createViteDevServerFnModuleSpecifierEncoder('/repo/app')

    const specifier = encode({
      extractedFilename: '/repo/shared/server-fn.ts',
      root: '/repo/app',
    })

    expect(specifier).toBe('/@fs/repo/shared/server-fn.ts')
    expect(decodeViteDevServerModuleSpecifier(`${specifier}?x=1`)).toBe(
      '/repo/shared/server-fn.ts',
    )
  })

  test('preserves Windows drive-letter /@fs paths', () => {
    const encode = createViteDevServerFnModuleSpecifierEncoder('C:/repo/app')

    const specifier = encode({
      extractedFilename: 'D:/repo/shared/server-fn.ts',
      root: 'C:/repo/app',
    })

    expect(specifier).toBe('/@fs/D:/repo/shared/server-fn.ts')
    expect(decodeViteDevServerModuleSpecifier(`${specifier}?x=1`)).toBe(
      'D:/repo/shared/server-fn.ts',
    )
  })
})

describe('mergeHotUpdateModules', () => {
  test('returns undefined when no extra modules were added', () => {
    const current = [{ id: '/src/route.tsx' }] as Array<EnvironmentModuleNode>

    expect(mergeHotUpdateModules(current, [])).toBeUndefined()
  })

  test('keeps native Vite modules and appends extra modules without duplicates', () => {
    const route = { id: '/src/route.tsx' } as EnvironmentModuleNode
    const provider = {
      id: '/src/route.tsx?tss-serverfn-split',
    } as EnvironmentModuleNode

    expect(mergeHotUpdateModules([route], [route, provider])).toEqual([
      route,
      provider,
    ])
  })
})
