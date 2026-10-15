import { parseExpression } from '@tanstack/router-utils'
import { is } from 'yuku-ast'
import { describe, expect, it } from 'vitest'
import {
  getObjectPropertyKeyName,
  getUniqueProgramIdentifier,
  normalizePath,
  routeFactoryCallCodeFilter,
} from '../src/core/utils'

function matchesRouteFactoryCallCodeFilter(code: string) {
  return routeFactoryCallCodeFilter.some((pattern) => {
    const result = pattern.test(code)
    pattern.lastIndex = 0
    return result
  })
}

describe('normalizePath', () => {
  it('should convert Windows backslashes to forward slashes', () => {
    expect(normalizePath('C:\\Users\\project\\src\\routes\\index.tsx')).toBe(
      'C:/Users/project/src/routes/index.tsx',
    )
  })

  it('should handle mixed slashes', () => {
    expect(normalizePath('C:/Users\\project/src\\routes/index.tsx')).toBe(
      'C:/Users/project/src/routes/index.tsx',
    )
  })

  it('should leave forward slashes unchanged', () => {
    expect(normalizePath('/home/user/project/src/routes/index.tsx')).toBe(
      '/home/user/project/src/routes/index.tsx',
    )
  })

  it('should handle relative paths with backslashes', () => {
    expect(normalizePath('src\\routes\\index.tsx')).toBe('src/routes/index.tsx')
  })

  it('should handle empty string', () => {
    expect(normalizePath('')).toBe('')
  })

  it('should handle path with query string', () => {
    expect(normalizePath('C:\\project\\file.tsx?tsr-split=component')).toBe(
      'C:/project/file.tsx?tsr-split=component',
    )
  })
})

describe('getUniqueProgramIdentifier', () => {
  it('returns the base name when unused', () => {
    expect(
      getUniqueProgramIdentifier(new Set(['existing']), 'TSRComponent').name,
    ).toBe('TSRComponent')
  })

  it('appends numeric suffixes for reserved names', () => {
    expect(
      getUniqueProgramIdentifier(
        new Set(['TSRComponent', 'TSRComponent2']),
        'TSRComponent',
      ).name,
    ).toBe('TSRComponent3')
  })

  it('avoids collisions across consecutive calls with the same base name', () => {
    const reservedNames = new Set(['existing'])

    const first = getUniqueProgramIdentifier(reservedNames, 'TSRComponent')
    const second = getUniqueProgramIdentifier(reservedNames, 'TSRComponent')

    expect(first.name).toBe('TSRComponent')
    expect(second.name).toBe('TSRComponent2')
    expect(reservedNames).toEqual(
      new Set(['existing', 'TSRComponent', 'TSRComponent2']),
    )
  })
})

describe('routeFactoryCallCodeFilter', () => {
  it('matches route factory calls with TypeScript type arguments', () => {
    expect(
      matchesRouteFactoryCallCodeFilter(
        'createRootRouteWithContext<MyContext>()({})',
      ),
    ).toBe(true)
  })

  it('matches route factory calls without TypeScript type arguments', () => {
    expect(
      matchesRouteFactoryCallCodeFilter('createRootRouteWithContext()({})'),
    ).toBe(true)
    expect(matchesRouteFactoryCallCodeFilter('createRootRoute({})')).toBe(true)
    expect(
      matchesRouteFactoryCallCodeFilter("createFileRoute('/posts')({})"),
    ).toBe(true)
  })

  it('matches route factory calls with whitespace before invocation', () => {
    expect(
      matchesRouteFactoryCallCodeFilter(
        'createRootRouteWithContext <MyContext>()({})',
      ),
    ).toBe(true)
    expect(matchesRouteFactoryCallCodeFilter('createRootRoute ({})')).toBe(true)
    expect(
      matchesRouteFactoryCallCodeFilter("createFileRoute ('/posts')({})"),
    ).toBe(true)
  })
})

describe('getObjectPropertyKeyName', () => {
  it.each([
    ['component: x', 'component'],
    ['"errorComponent": x', 'errorComponent'],
    ['[component]: x', undefined],
    ['[foo.bar]: x', undefined],
  ])('reads static keys in %s', (source, expected) => {
    const expression = parseExpression(`{${source}}`)
    if (
      !is.ObjectExpression(expression) ||
      !is.Property(expression.properties[0])
    ) {
      throw new Error('Expected an object property')
    }
    expect(getObjectPropertyKeyName(expression.properties[0])).toBe(expected)
  })
})
