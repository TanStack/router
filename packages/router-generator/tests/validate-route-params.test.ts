import { beforeEach, describe, expect, it, vi } from 'vitest'
import { validateRouteParams } from '../src/validate-route-params'
import type { Logger } from '../src/logger'

describe('validateRouteParams', () => {
  const warn = vi.fn()
  const logger = { warn } as unknown as Logger

  beforeEach(() => {
    warn.mockClear()
  })

  describe('valid param names', () => {
    it('should not warn for valid simple params', () => {
      validateRouteParams('/users/$userId', 'users/$userId.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(0)
    })

    it('should not warn for params with underscores', () => {
      validateRouteParams('/items/$_id', 'items/$_id.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(0)
    })

    it('should not warn for params with dollar sign prefix', () => {
      validateRouteParams('/data/$$var', 'data/$$var.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(0)
    })

    it('should not warn for braces params', () => {
      validateRouteParams('/users/{$userName}', 'users/{$userName}.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(0)
    })

    it('should not warn for optional params', () => {
      validateRouteParams('/search/{-$query}', 'search/{-$query}.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(0)
    })

    it('should not warn for wildcards', () => {
      validateRouteParams('/files/$', 'files/$.tsx', logger)
      validateRouteParams('/catch/{$}', 'catch/{$}.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(0)
    })

    it('should not warn for paths without params', () => {
      validateRouteParams('/users/list', 'users/list.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(0)
    })
  })

  describe('invalid param names', () => {
    it('should warn for params starting with a number', () => {
      validateRouteParams('/users/$123', 'users/$123.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('123'))
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid param name'),
      )
    })

    it('should warn for params with hyphens', () => {
      validateRouteParams('/users/$user-name', 'users/$user-name.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('user-name'))
    })

    it('should warn for params with dots', () => {
      validateRouteParams('/users/{$my.param}', 'users/{$my.param}.tsx', logger)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('my.param'))
    })

    it('should warn for multiple invalid params', () => {
      validateRouteParams(
        '/users/$1id/posts/$post-id',
        'users/$1id/posts/$post-id.tsx',
        logger,
      )
      expect(warn).toHaveBeenCalledTimes(2)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('1id'))
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('post-id'))
    })

    it('should include file path in warning message', () => {
      validateRouteParams('/users/$123', 'users/$123.tsx', logger)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('users/$123.tsx'),
      )
    })

    it('should include route path in warning message', () => {
      validateRouteParams('/users/$123', 'users/$123.tsx', logger)
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('/users/$123'))
    })
  })
})
