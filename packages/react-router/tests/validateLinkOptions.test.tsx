import { describe, expect, test } from 'vitest'
import { createFileRoute } from '../src/fileRoute'
import type {
  ValidateLinkOptions,
  ValidateUseParamsOptions,
  ValidateUseSearchOptions,
} from '../src/typePrimitives'
import type {
  ValidateNavigateOptions,
  ValidateRedirectOptions,
} from '@tanstack/router-core'

describe('Validation types regression tests', () => {
  test('should not cause TypeScript circular reference error in loader return type', () => {
    // This test ensures that ValidateLinkOptions can be used in loader return types
    // without causing the TypeScript error:
    // 'loader' implicitly has return type 'any' because it does not have a return type annotation

    const route = createFileRoute('/user/$userId')({
      loader: (): { breadcrumbs: ValidateLinkOptions } => {
        const breadcrumbs: ValidateLinkOptions = {
          to: '/user/$userId',
          params: { userId: '123' },
        }

        return {
          breadcrumbs,
        }
      },
      component: () => <div>User</div>,
    })

    expect(route).toBeDefined()
  })

  test('should work with ValidateLinkOptions directly in loader', () => {
    const route = createFileRoute('/profile/$userId')({
      loader: () => {
        const linkOptions: ValidateLinkOptions = {
          to: '/profile/$userId',
          params: { userId: '456' },
        }

        return {
          navigation: linkOptions,
        }
      },
      component: () => <div>Profile</div>,
    })

    expect(route).toBeDefined()
  })

  test('should work with array of ValidateLinkOptions', () => {
    const route = createFileRoute('/dashboard')({
      loader: () => {
        const breadcrumbs: Array<ValidateLinkOptions> = [
          { to: '/' },
          { to: '/dashboard' },
        ]

        return {
          breadcrumbs,
        }
      },
      component: () => <div>Dashboard</div>,
    })

    expect(route).toBeDefined()
  })

  test('should work with ValidateNavigateOptions in loader', () => {
    const route = createFileRoute('/navigate-test')({
      loader: () => {
        const navOptions: ValidateNavigateOptions = {
          to: '/dashboard',
        }

        return {
          navOptions,
        }
      },
      component: () => <div>Navigate Test</div>,
    })

    expect(route).toBeDefined()
  })

  test('should work with ValidateRedirectOptions in loader', () => {
    const route = createFileRoute('/redirect-test')({
      loader: () => {
        const redirectOptions: ValidateRedirectOptions = {
          to: '/login',
        }

        return {
          redirectOptions,
        }
      },
      component: () => <div>Redirect Test</div>,
    })

    expect(route).toBeDefined()
  })

  test('should work with ValidateUseSearchOptions in loader', () => {
    const route = createFileRoute('/search-test')({
      loader: () => {
        const searchOptions: ValidateUseSearchOptions<{
          from: '/search-test'
        }> = {
          from: '/search-test',
        }

        return {
          searchOptions,
        }
      },
      component: () => <div>Search Test</div>,
    })

    expect(route).toBeDefined()
  })

  test('should work with ValidateUseParamsOptions in loader', () => {
    const route = createFileRoute('/params-test/$id')({
      loader: () => {
        const paramsOptions: ValidateUseParamsOptions<{
          from: '/params-test/$id'
        }> = {
          from: '/params-test/$id',
        }

        return {
          paramsOptions,
        }
      },
      component: () => <div>Params Test</div>,
    })

    expect(route).toBeDefined()
  })
})
