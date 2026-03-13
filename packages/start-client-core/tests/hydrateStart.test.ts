import { describe, it, expect, vi, beforeEach } from 'vitest'
import { hydrateStart } from '../src/client/hydrateStart'
import { hydrate } from '@tanstack/router-core/ssr/client'
import type { AnyRouter } from '@tanstack/router-core'

declare global {
  interface Window {
    __TSS_START_OPTIONS__?: any
  }
}

// Mocks
vi.mock('@tanstack/router-core/ssr/client', () => ({
  hydrate: vi.fn(),
}))

// Mock factory to avoid duplication
const createMockRouter = (overrides = {}): Partial<AnyRouter> => ({
  state: { matches: [] } as any,
  options: { basepath: '/' } as any,
  update: vi.fn(),
  ...overrides,
})

let mockGetRouter: ReturnType<typeof vi.fn>

vi.mock('#tanstack-router-entry', () => ({
  get getRouter() {
    if (!mockGetRouter) {
      mockGetRouter = vi.fn(() => Promise.resolve(createMockRouter()))
    }
    return mockGetRouter
  },
  startInstance: undefined
}))

vi.mock('#tanstack-start-entry', () => ({
  get getRouter() {
    if (!mockGetRouter) {
      mockGetRouter = vi.fn(() => Promise.resolve(createMockRouter()))
    }
    return mockGetRouter
  },
  startInstance: undefined
}))

describe('hydrateStart', () => {
  beforeEach(() => {
    // Ensure mockGetRouter is initialized
    if (!mockGetRouter) {
      mockGetRouter = vi.fn(() => Promise.resolve(createMockRouter()))
    }
    
    vi.clearAllMocks()
    delete window.__TSS_SPA_SHELL__
    delete window.__TSS_START_OPTIONS__
    window.history.pushState({}, '', '/')
    mockGetRouter.mockResolvedValue(createMockRouter())
  })

  describe('Normal hydration (no SPA shell)', () => {
    it('should call hydrate(router) when no SPA shell marker is present', async () => {
      const router = await hydrateStart()
      
      expect(hydrate).toHaveBeenCalledWith(router)
      expect(router.update).toHaveBeenCalledWith(
        expect.objectContaining({
          serializationAdapters: expect.any(Array)
        })
      )
    })

    it('should call hydrate(router) when SPA shell marker is present but path matches root', async () => {
      window.__TSS_SPA_SHELL__ = true
      window.history.pushState({}, '', '/')
      
      const router = await hydrateStart()
      expect(hydrate).toHaveBeenCalledWith(router)
    })
  })

  describe('SPA shell fallback detection', () => {
    it('should NOT call hydrate(router) when SPA shell marker is present and path is deep', async () => {
      window.__TSS_SPA_SHELL__ = true
      window.history.pushState({}, '', '/deep/link')
      
      await hydrateStart()
      expect(hydrate).not.toHaveBeenCalled()
    })

    it('should skip hydration for deep paths with trailing slash', async () => {
      window.__TSS_SPA_SHELL__ = true
      window.history.pushState({}, '', '/deep/link/')
      
      await hydrateStart()
      expect(hydrate).not.toHaveBeenCalled()
    })
  })

  describe('Custom basepath handling', () => {
    it('should hydrate when path matches basepath with trailing slash', async () => {
      window.__TSS_SPA_SHELL__ = true
      window.history.pushState({}, '', '/app/')
      
      mockGetRouter.mockResolvedValueOnce(createMockRouter({
        options: { basepath: '/app' }
      }))
      
      await hydrateStart()
      expect(hydrate).toHaveBeenCalled() // /app/ matches basepath /app after normalization
    })

    it('should skip hydration when path is deeper than custom basepath', async () => {
      window.__TSS_SPA_SHELL__ = true
      window.history.pushState({}, '', '/app/dashboard')
      
      mockGetRouter.mockResolvedValueOnce(createMockRouter({
        options: { basepath: '/app' }
      }))
      
      await hydrateStart()
      expect(hydrate).not.toHaveBeenCalled()
    })

    it('should handle empty basepath', async () => {
      window.__TSS_SPA_SHELL__ = true
      window.history.pushState({}, '', '/any-path')
      
      mockGetRouter.mockResolvedValueOnce(createMockRouter({
        options: { basepath: '' }
      }))
      
      await hydrateStart()
      expect(hydrate).not.toHaveBeenCalled()
    })
  })

  describe('Existing matches handling', () => {
    it('should skip hydration when matches already exist', async () => {
      mockGetRouter.mockResolvedValueOnce(createMockRouter({
        state: { matches: [{ id: 'test-match' }] }
      }))
      
      await hydrateStart()
      expect(hydrate).not.toHaveBeenCalled()
    })

    it('should not check SPA shell when matches exist', async () => {
      window.__TSS_SPA_SHELL__ = true
      window.history.pushState({}, '', '/deep/link')
      
      mockGetRouter.mockResolvedValueOnce(createMockRouter({
        state: { matches: [{ id: 'test-match' }] }
      }))
      
      await hydrateStart()
      // Should skip entire hydration block, not just the SPA check
      expect(hydrate).not.toHaveBeenCalled()
    })
  })

  describe('Router configuration', () => {
    it('should always call router.update with serializationAdapters', async () => {
      const router = await hydrateStart()
      
      expect(router.update).toHaveBeenCalledWith(
        expect.objectContaining({
          basepath: process.env.TSS_ROUTER_BASEPATH,
          serializationAdapters: expect.arrayContaining([
            expect.objectContaining({ key: expect.any(String) })
          ])
        })
      )
    })

    it('should merge router serializationAdapters if they exist', async () => {
      const existingAdapter = { name: 'existing-adapter', serialize: vi.fn() }
      mockGetRouter.mockResolvedValueOnce(createMockRouter({
        options: { 
          basepath: '/',
          serializationAdapters: [existingAdapter]
        }
      }))
      
      const router = await hydrateStart()
      
      expect(router.update).toHaveBeenCalledWith(
        expect.objectContaining({
          serializationAdapters: expect.arrayContaining([existingAdapter])
        })
      )
    })
  })
})
