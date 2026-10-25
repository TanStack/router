import { afterEach, describe, expect, it, vi } from 'vitest'
import { runWithStartContext } from '@tanstack/start-storage-context'
import { serverFnFetcher } from '../src/client-rpc/serverFnFetcher'
import { X_TSS_RAW_RESPONSE } from '../src/constants'
import type { ResolvedDeploymentMetadata } from '../src/deployment-metadata'

// Stands in for the module the Start plugin generates at build time.
const deploymentMetadataModule = vi.hoisted(() => ({
  current: null as ResolvedDeploymentMetadata | null,
}))

vi.mock('#tanstack-start-deployment-metadata', () => ({
  get deploymentMetadata() {
    return deploymentMetadataModule.current
  },
}))

function setDeploymentMetadata(metadata: ResolvedDeploymentMetadata) {
  deploymentMetadataModule.current = metadata
}

async function captureRequest(
  url: string,
  first: Record<string, unknown>,
): Promise<{ url: string; headers: Headers }> {
  const handler = vi.fn(
    async (_url: string, _requestInit: RequestInit) =>
      new Response(null, { headers: { [X_TSS_RAW_RESPONSE]: 'true' } }),
  )

  await runWithStartContext({ startOptions: undefined } as any, () =>
    serverFnFetcher(url, [first], handler),
  )

  const [requestUrl, requestInit] = handler.mock.calls[0]!
  return { url: requestUrl, headers: new Headers(requestInit.headers) }
}

afterEach(() => {
  deploymentMetadataModule.current = null
})

describe('serverFnFetcher deployment metadata', () => {
  it('sends the deployment value in a header carrier', async () => {
    setDeploymentMetadata({
      value: 'dpl_123',
      carriers: [
        { type: 'header', name: 'x-deployment-id' },
        { type: 'query', name: '__deployment_id' },
      ],
    })

    const request = await captureRequest('/_serverFn/test', {
      method: 'POST',
    })

    expect(request.headers.get('x-deployment-id')).toBe('dpl_123')
    expect(request.url).toBe('/_serverFn/test')
  })

  it('sends the deployment value in a query carrier', async () => {
    setDeploymentMetadata({
      value: 'dpl_123',
      carriers: [{ type: 'query', name: '__deployment_id' }],
    })

    const request = await captureRequest('/_serverFn/test', {
      method: 'POST',
    })

    expect(request.url).toBe('/_serverFn/test?__deployment_id=dpl_123')
    expect(request.headers.has('__deployment_id')).toBe(false)
  })

  it('keeps the GET payload after a query carrier', async () => {
    setDeploymentMetadata({
      value: 'dpl_123',
      carriers: [{ type: 'query', name: '__deployment_id' }],
    })

    const request = await captureRequest('/_serverFn/test', {
      method: 'GET',
      data: { id: 1 },
    })

    const url = new URL(request.url, 'http://localhost')
    expect(url.searchParams.get('__deployment_id')).toBe('dpl_123')
    expect(url.searchParams.has('payload')).toBe(true)
  })

  it('encodes carrier names and values in the query', async () => {
    setDeploymentMetadata({
      value: 'dpl 1&2',
      carriers: [{ type: 'query', name: 'deploy id' }],
    })

    const request = await captureRequest('/_serverFn/test', {
      method: 'POST',
    })

    const url = new URL(request.url, 'http://localhost')
    expect(url.searchParams.get('deploy id')).toBe('dpl 1&2')
  })

  it('sends nothing without deployment metadata', async () => {
    const request = await captureRequest('/_serverFn/test', {
      method: 'POST',
    })

    expect(request.url).toBe('/_serverFn/test')
    expect(request.headers.has('x-deployment-id')).toBe(false)
  })
})
