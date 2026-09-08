import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('prerenderWithVite', () => {
  beforeEach(() => {
    vi.resetModules()
    delete process.env.TSS_PRERENDERING
    delete process.env.TSS_CLIENT_OUTPUT_DIR
    delete (globalThis as any).__ROUTE_OPTIONS_LOADED
    delete globalThis.TSS_PRERENDER_ROUTE_TREE
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('imports route options from the prerender bundle and cleans up', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tss-vite-prerender-'))
    const clientOutputDirectory = join(root, 'client')
    const serverOutputDirectory = join(root, 'server')
    const prerenderOutputDirectory = join(
      serverOutputDirectory,
      '.tanstack/prerender',
    )
    const close = vi.fn()
    const prerenderSpy = vi.fn(async ({ handler }: any) => {
      expect((globalThis as any).__ROUTE_OPTIONS_LOADED).toBe(1)
      await handler.close()
    })

    vi.doMock('vite', () => ({
      preview: vi.fn(async () => ({
        resolvedUrls: { local: ['http://127.0.0.1:4173/'] },
        close,
      })),
    }))
    vi.doMock('../src/prerender', async () => {
      const actual = await vi.importActual<any>('../src/prerender')
      return {
        ...actual,
        prerender: prerenderSpy,
      }
    })

    await mkdir(prerenderOutputDirectory, { recursive: true })
    await writeFile(
      join(prerenderOutputDirectory, 'server.js'),
      'globalThis.__ROUTE_OPTIONS_LOADED = (globalThis.__ROUTE_OPTIONS_LOADED ?? 0) + 1',
    )

    const { prerenderWithVite } = await import('../src/vite/prerender')

    try {
      await prerenderWithVite({
        startConfig: createStartConfig(true),
        builder: createBuilder({
          clientOutputDirectory,
          serverOutputDirectory,
          prerenderOutputDirectory,
        }),
      } as any)

      expect(prerenderSpy).toHaveBeenCalledOnce()
      expect(close).toHaveBeenCalledOnce()
      expect(process.env.TSS_PRERENDERING).toBeUndefined()
      expect(process.env.TSS_CLIENT_OUTPUT_DIR).toBeUndefined()
      expect(globalThis.TSS_PRERENDER_ROUTE_TREE).toBeUndefined()
      await expect(access(prerenderOutputDirectory)).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('cleans up if route-options import fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tss-vite-prerender-'))
    const clientOutputDirectory = join(root, 'client')
    const serverOutputDirectory = join(root, 'server')
    const prerenderOutputDirectory = join(
      serverOutputDirectory,
      '.tanstack/prerender',
    )
    const prerenderSpy = vi.fn()

    vi.doMock('vite', () => ({
      preview: vi.fn(),
    }))
    vi.doMock('../src/prerender', async () => {
      const actual = await vi.importActual<any>('../src/prerender')
      return {
        ...actual,
        prerender: prerenderSpy,
      }
    })

    await mkdir(prerenderOutputDirectory, { recursive: true })
    await writeFile(
      join(prerenderOutputDirectory, 'server.js'),
      'throw new Error("boom")',
    )

    const { prerenderWithVite } = await import('../src/vite/prerender')

    try {
      await expect(
        prerenderWithVite({
          startConfig: createStartConfig(true),
          builder: createBuilder({
            clientOutputDirectory,
            serverOutputDirectory,
            prerenderOutputDirectory,
          }),
        } as any),
      ).rejects.toThrow('boom')

      expect(prerenderSpy).not.toHaveBeenCalled()
      expect(process.env.TSS_PRERENDERING).toBeUndefined()
      expect(process.env.TSS_CLIENT_OUTPUT_DIR).toBeUndefined()
      expect(globalThis.TSS_PRERENDER_ROUTE_TREE).toBeUndefined()
      await expect(access(prerenderOutputDirectory)).rejects.toThrow()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('imports route options from the server bundle when separation is disabled', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tss-vite-prerender-'))
    const clientOutputDirectory = join(root, 'client')
    const serverOutputDirectory = join(root, 'server')
    const prerenderOutputDirectory = join(
      serverOutputDirectory,
      '.tanstack/prerender',
    )
    const serverRouteOptionsDirectory = join(serverOutputDirectory, 'server')
    const close = vi.fn()
    const prerenderSpy = vi.fn(async ({ handler }: any) => {
      expect((globalThis as any).__ROUTE_OPTIONS_LOADED).toBe('server')
      await handler.close()
    })

    vi.doMock('vite', () => ({
      preview: vi.fn(async () => ({
        resolvedUrls: { local: ['http://127.0.0.1:4173/'] },
        close,
      })),
    }))
    vi.doMock('../src/prerender', async () => {
      const actual = await vi.importActual<any>('../src/prerender')
      return {
        ...actual,
        prerender: prerenderSpy,
      }
    })

    await mkdir(serverRouteOptionsDirectory, { recursive: true })
    await mkdir(prerenderOutputDirectory, { recursive: true })
    await writeFile(
      join(serverRouteOptionsDirectory, 'server.js'),
      'globalThis.__ROUTE_OPTIONS_LOADED = "server"',
    )
    await writeFile(
      join(prerenderOutputDirectory, 'server.js'),
      'throw new Error("should not load prerender bundle")',
    )

    const { prerenderWithVite } = await import('../src/vite/prerender')

    try {
      await prerenderWithVite({
        startConfig: createStartConfig(false),
        builder: createBuilder({
          clientOutputDirectory,
          serverOutputDirectory,
          prerenderOutputDirectory,
        }),
      } as any)

      expect(prerenderSpy).toHaveBeenCalledOnce()
      expect(close).toHaveBeenCalledOnce()
      expect(process.env.TSS_PRERENDERING).toBeUndefined()
      expect(process.env.TSS_CLIENT_OUTPUT_DIR).toBeUndefined()
      expect(globalThis.TSS_PRERENDER_ROUTE_TREE).toBeUndefined()
      await expect(access(prerenderOutputDirectory)).resolves.toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not import route options for SPA builds', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tss-vite-prerender-'))
    const clientOutputDirectory = join(root, 'client')
    const serverOutputDirectory = join(root, 'server')
    const prerenderOutputDirectory = join(
      serverOutputDirectory,
      '.tanstack/prerender',
    )
    const serverRouteOptionsDirectory = join(serverOutputDirectory, 'server')
    const close = vi.fn()
    const prerenderSpy = vi.fn(async ({ handler }: any) => {
      expect((globalThis as any).__ROUTE_OPTIONS_LOADED).toBeUndefined()
      await handler.close()
    })

    vi.doMock('vite', () => ({
      preview: vi.fn(async () => ({
        resolvedUrls: { local: ['http://127.0.0.1:4173/'] },
        close,
      })),
    }))
    vi.doMock('../src/prerender', async () => {
      const actual = await vi.importActual<any>('../src/prerender')
      return {
        ...actual,
        prerender: prerenderSpy,
      }
    })

    await mkdir(serverRouteOptionsDirectory, { recursive: true })
    await writeFile(
      join(serverRouteOptionsDirectory, 'server.js'),
      'throw new Error("should not load server bundle")',
    )

    const { prerenderWithVite } = await import('../src/vite/prerender')

    try {
      await prerenderWithVite({
        startConfig: createStartConfig(false, true),
        builder: createBuilder({
          clientOutputDirectory,
          serverOutputDirectory,
          prerenderOutputDirectory,
        }),
      } as any)

      expect(prerenderSpy).toHaveBeenCalledOnce()
      expect(close).toHaveBeenCalledOnce()
      expect(process.env.TSS_PRERENDERING).toBeUndefined()
      expect(process.env.TSS_CLIENT_OUTPUT_DIR).toBeUndefined()
      expect(globalThis.TSS_PRERENDER_ROUTE_TREE).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('cleans up when the separate route-options environment is missing', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tss-vite-prerender-'))
    const clientOutputDirectory = join(root, 'client')
    const serverOutputDirectory = join(root, 'server')
    const prerenderOutputDirectory = join(
      serverOutputDirectory,
      '.tanstack/prerender',
    )
    const prerenderSpy = vi.fn()
    const preview = vi.fn()

    vi.doMock('vite', () => ({ preview }))
    vi.doMock('../src/prerender', async () => {
      const actual = await vi.importActual<any>('../src/prerender')
      return {
        ...actual,
        prerender: prerenderSpy,
      }
    })

    const builder = createBuilder({
      clientOutputDirectory,
      serverOutputDirectory,
      prerenderOutputDirectory,
    })
    delete (builder.environments as any).prerender

    const { prerenderWithVite } = await import('../src/vite/prerender')

    try {
      await expect(
        prerenderWithVite({
          startConfig: createStartConfig(true),
          builder,
        } as any),
      ).rejects.toThrow('Vite\'s "prerender" environment not found')

      expect(preview).not.toHaveBeenCalled()
      expect(prerenderSpy).not.toHaveBeenCalled()
      expect(process.env.TSS_PRERENDERING).toBeUndefined()
      expect(process.env.TSS_CLIENT_OUTPUT_DIR).toBeUndefined()
      expect(globalThis.TSS_PRERENDER_ROUTE_TREE).toBeUndefined()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

function createStartConfig(
  separateRouteOptionsBundle: boolean,
  spaEnabled = false,
) {
  return {
    prerender: { enabled: true, separateRouteOptionsBundle },
    pages: [],
    router: { basepath: '' },
    spa: { enabled: spaEnabled, prerender: { outputPath: '/_shell' } },
    sitemap: { enabled: false },
  }
}

function createBuilder({
  clientOutputDirectory,
  serverOutputDirectory,
  prerenderOutputDirectory,
}: {
  clientOutputDirectory: string
  serverOutputDirectory: string
  prerenderOutputDirectory: string
}) {
  return {
    environments: {
      client: {
        config: { build: { outDir: clientOutputDirectory } },
      },
      ssr: {
        config: {
          configFile: false,
          build: {
            outDir: serverOutputDirectory,
            rollupOptions: { input: { server: 'src/server.ts' } },
          },
        },
      },
      prerender: {
        config: {
          build: {
            outDir: prerenderOutputDirectory,
            rollupOptions: { input: { server: 'src/server.ts' } },
          },
        },
      },
    },
  }
}
