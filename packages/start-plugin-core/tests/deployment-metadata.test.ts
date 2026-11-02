import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { defineDeploymentParticipant } from '@vitejs/deployment-metadata-helper'
import {
  SUPPORTED_VDM0001_VERSIONS,
  createDeploymentRenderBuiltUrl,
  discoverRequestMetadata,
} from '../src/vite/deployment-metadata'
import {
  generateDeploymentMetadataModule,
  resolveDeploymentMetadata,
} from '../src/deployment-metadata-module'

// types
import type { Plugin } from 'vite'
import type {
  DeploymentMetadata,
  RequestMetadataCarrier,
} from '@vitejs/deployment-metadata-types'

function provider(metadata: ReadonlyArray<DeploymentMetadata>): Plugin {
  return {
    name: 'test-provider',
    api: {
      'vite/deploymentMetadata': defineDeploymentParticipant({
        id: '@test/provider',
        getMetadata: () => metadata,
      }),
    },
  }
}

const deploymentRecord = {
  id: 'VDM0001',
  version: 1,
  value: 'dpl_123',
  carriers: [{ type: 'header', name: 'x-deployment-id' }],
} as const

const unsupportedDeploymentRecord = {
  id: 'VDM0001',
  version: Math.max(...SUPPORTED_VDM0001_VERSIONS) + 1,
  value: 'dpl_123',
  carriers: [{ type: 'header', name: 'x-deployment-id' }],
} as unknown as DeploymentMetadata

let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  warn.mockRestore()
})

describe('discoverRequestMetadata', () => {
  test('discoverRequestMetadata resolves deployment id', async () => {
    await expect(
      discoverRequestMetadata({ plugins: [provider([deploymentRecord])] }),
    ).resolves.toEqual(deploymentRecord)
  })

  test('discoverRequestMetadata resolves empty deployment id as undefined', async () => {
    await expect(
      discoverRequestMetadata({ plugins: [] }),
    ).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  test('discoverRequestMetadata warns when only unsupported VDM0001 versions are advertised', async () => {
    await expect(
      discoverRequestMetadata({
        plugins: [provider([unsupportedDeploymentRecord])],
      }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()

    expect(warn).toHaveBeenCalledWith(
      '[deployment-metadata]',
      '@test/provider advertised VDM0001 v2; TanStack Start supports VDM0001 v1. Skew protection is disabled.',
    )
  })

  test('discoverRequestMetadata prefers a supported version without warning', async () => {
    await expect(
      discoverRequestMetadata({
        plugins: [provider([unsupportedDeploymentRecord, deploymentRecord])],
      }),
    ).resolves.toEqual(deploymentRecord)
    expect(warn).not.toHaveBeenCalled()
  })

  test('discoverRequestMetadata ignores other standards without warning', async () => {
    await expect(
      discoverRequestMetadata({
        plugins: [
          provider([
            {
              id: 'VDM0002',
              version: 1,
            } as unknown as DeploymentMetadata,
          ]),
        ],
      }),
    ).resolves.toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('resolveDeploymentMetadata', () => {
  const headerCarrier = { type: 'header', name: 'x-deployment-id' } as const
  const queryCarrier = { type: 'query', name: '__deployment_id' } as const
  const cookieCarrier = {
    type: 'cookie',
    name: '__deployment_id',
  } as unknown as RequestMetadataCarrier

  test('resolves a string value', async () => {
    await expect(
      resolveDeploymentMetadata({
        value: 'dpl_123',
        carriers: [headerCarrier, queryCarrier],
      }),
    ).resolves.toEqual({
      value: 'dpl_123',
      carriers: [headerCarrier, queryCarrier],
    })
  })

  test('resolves a synchronous value producer', async () => {
    await expect(
      resolveDeploymentMetadata({
        value: () => 'dpl_123',
        carriers: [headerCarrier],
      }),
    ).resolves.toEqual({ value: 'dpl_123', carriers: [headerCarrier] })
  })

  test('resolves an asynchronous value producer', async () => {
    await expect(
      resolveDeploymentMetadata({
        value: () => Promise.resolve('dpl_123'),
        carriers: [headerCarrier],
      }),
    ).resolves.toEqual({ value: 'dpl_123', carriers: [headerCarrier] })
  })

  test('drops unsupported carrier types and keeps preference order', async () => {
    await expect(
      resolveDeploymentMetadata({
        value: 'dpl_123',
        carriers: [cookieCarrier, queryCarrier, headerCarrier],
      }),
    ).resolves.toEqual({
      value: 'dpl_123',
      carriers: [queryCarrier, headerCarrier],
    })
    expect(warn).not.toHaveBeenCalled()
  })

  test('resolves as undefined when no carriers are supported', async () => {
    await expect(
      resolveDeploymentMetadata({
        value: 'dpl_123',
        carriers: [cookieCarrier],
      }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      '[deployment-metadata]',
      'Deployment metadata has no supported carriers (received: cookie; supported: header, query). Skew protection is disabled.',
    )
  })

  test('resolves as undefined when the value is empty', async () => {
    await expect(
      resolveDeploymentMetadata({ value: '', carriers: [headerCarrier] }),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      '[deployment-metadata]',
      'Deployment metadata has an empty value. Skew protection is disabled.',
    )
  })

  test('resolves as undefined when the value producer returns empty', async () => {
    await expect(
      resolveDeploymentMetadata({
        value: () => Promise.resolve(''),
        carriers: [headerCarrier],
      }),
    ).resolves.toBeUndefined()
  })
})

describe('generateDeploymentMetadataModule', () => {
  test('exports the resolved metadata as an object literal', () => {
    const metadata = {
      value: 'dpl_123',
      carriers: [{ type: 'header', name: 'x-deployment-id' }],
    } as const

    expect(generateDeploymentMetadataModule(metadata)).toBe(
      `export const deploymentMetadata = ${JSON.stringify(metadata)}`,
    )
  })

  test('exports null without metadata', () => {
    expect(generateDeploymentMetadataModule(undefined)).toBe(
      'export const deploymentMetadata = null',
    )
  })
})

describe('createDeploymentRenderBuiltUrl', () => {
  const headerCarrier = { type: 'header', name: 'x-deployment-id' } as const
  const queryCarrier = { type: 'query', name: 'dpl' } as const

  test('tags built urls with the first query carrier', () => {
    const renderBuiltUrl = createDeploymentRenderBuiltUrl({
      deploymentMetadata: {
        value: 'dpl 123',
        carriers: [headerCarrier, queryCarrier],
      },
      publicBase: '/app/',
      hasUserRenderBuiltUrl: false,
    })

    expect(renderBuiltUrl?.('assets/logo-abc.svg')).toBe(
      '/app/assets/logo-abc.svg?dpl=dpl%20123',
    )
  })

  test('joins an absolute url base', () => {
    const renderBuiltUrl = createDeploymentRenderBuiltUrl({
      deploymentMetadata: { value: 'dpl_123', carriers: [queryCarrier] },
      publicBase: 'https://cdn.example.com/app',
      hasUserRenderBuiltUrl: false,
    })

    expect(renderBuiltUrl?.('assets/logo-abc.svg')).toBe(
      'https://cdn.example.com/app/assets/logo-abc.svg?dpl=dpl_123',
    )
  })

  test('leaves built urls alone without a query carrier', () => {
    expect(
      createDeploymentRenderBuiltUrl({
        deploymentMetadata: { value: 'dpl_123', carriers: [headerCarrier] },
        publicBase: '/',
        hasUserRenderBuiltUrl: false,
      }),
    ).toBeUndefined()
    expect(warn).not.toHaveBeenCalled()
  })

  test('keeps a user configured renderBuiltUrl and warns', () => {
    expect(
      createDeploymentRenderBuiltUrl({
        deploymentMetadata: { value: 'dpl_123', carriers: [queryCarrier] },
        publicBase: '/',
        hasUserRenderBuiltUrl: true,
      }),
    ).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      '[deployment-metadata]',
      'experimental.renderBuiltUrl is already configured, so built asset urls are not tagged with the deployment id. Skew protection for assets is disabled.',
    )
  })
})
