import { expect } from '@playwright/test'

type DeferredRouteMarker = 'immediate' | 'fallback' | 'deferred' | 'documentEnd'
type QueryHeavyRouteMarker = 'shell' | 'fastQuery' | 'slowQuery' | 'documentEnd'

type RequiredDeferredRouteMarker = Exclude<DeferredRouteMarker, 'fallback'>

type MarkerTimings = Partial<Record<DeferredRouteMarker, number>> &
  Record<RequiredDeferredRouteMarker, number>
type QueryHeavyMarkerTimings = Record<QueryHeavyRouteMarker, number>

const deferredRouteMarkers = {
  immediate: 'data-testid="immediate-data"',
  fallback: 'data-testid="deferred-loading"',
  deferred: 'Deferred data loaded!',
  documentEnd: '</html>',
} satisfies Record<DeferredRouteMarker, string>

const queryHeavyRouteMarkers = {
  shell: 'Query Heavy Test',
  fastQuery: 'data-testid="fast-async-query-1"',
  slowQuery: 'data-testid="slow-async-query-3"',
  documentEnd: '</html>',
} satisfies Record<QueryHeavyRouteMarker, string>

export async function expectDeferredRouteToStream(
  baseURL: string | undefined,
  options: { expectFallback?: boolean } = {},
) {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required')
  }

  const startedAt = performance.now()
  const response = await fetch(
    new URL('/deferred?streaming=render-only', baseURL),
    {
      headers: {
        accept: 'text/html',
        'accept-encoding': 'identity',
        'user-agent': 'Mozilla/5.0 streaming-ssr-test',
      },
    },
  )

  expect(response.status).toBe(200)
  expect(response.body).not.toBeNull()

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const markerTimings: Partial<Record<DeferredRouteMarker, number>> = {}
  const pendingMarkers = new Set<DeferredRouteMarker>(
    (Object.keys(deferredRouteMarkers) as Array<DeferredRouteMarker>).filter(
      (markerName) => options.expectFallback || markerName !== 'fallback',
    ),
  )
  let chunkCount = 0
  let html = ''

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    chunkCount += 1
    html += decoder.decode(value, { stream: true })

    const elapsed = performance.now() - startedAt

    for (const markerName of pendingMarkers) {
      if (html.includes(deferredRouteMarkers[markerName])) {
        markerTimings[markerName] = elapsed
        pendingMarkers.delete(markerName)
      }
    }
  }

  html += decoder.decode()

  const responsePreview =
    html.length > 2000
      ? `${html.slice(0, 1000)}\n...\n${html.slice(-1000)}`
      : html

  expect(
    Array.from(pendingMarkers),
    `Missing streaming markers in response:\n${responsePreview}`,
  ).toEqual([])

  const timings = markerTimings as MarkerTimings

  expect(chunkCount).toBeGreaterThan(1)
  expect(timings.deferred - timings.immediate).toBeGreaterThan(500)
  expect(timings.documentEnd - timings.immediate).toBeGreaterThan(500)

  if (options.expectFallback) {
    expect(timings.fallback).toBeDefined()
    expect(timings.deferred - timings.fallback!).toBeGreaterThan(500)
  }
}

export async function expectQueryHeavyRouteToStream(
  baseURL: string | undefined,
) {
  if (!baseURL) {
    throw new Error('Playwright baseURL is required')
  }

  const startedAt = performance.now()
  const response = await fetch(
    new URL('/query-heavy?streaming=render-only', baseURL),
    {
      headers: {
        accept: 'text/html',
        'accept-encoding': 'identity',
        'user-agent': 'Mozilla/5.0 streaming-ssr-test',
      },
    },
  )

  expect(response.status).toBe(200)
  expect(response.body).not.toBeNull()

  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  const markerTimings: Partial<Record<QueryHeavyRouteMarker, number>> = {}
  const pendingMarkers = new Set<QueryHeavyRouteMarker>(
    Object.keys(queryHeavyRouteMarkers) as Array<QueryHeavyRouteMarker>,
  )
  let chunkCount = 0
  let html = ''

  for (;;) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    chunkCount += 1
    html += decoder.decode(value, { stream: true })

    const elapsed = performance.now() - startedAt

    for (const markerName of pendingMarkers) {
      if (html.includes(queryHeavyRouteMarkers[markerName])) {
        markerTimings[markerName] = elapsed
        pendingMarkers.delete(markerName)
      }
    }
  }

  html += decoder.decode()

  const responsePreview =
    html.length > 2000
      ? `${html.slice(0, 1000)}\n...\n${html.slice(-1000)}`
      : html

  expect(
    Array.from(pendingMarkers),
    `Missing query-heavy streaming markers in response:\n${responsePreview}`,
  ).toEqual([])

  const timings = markerTimings as QueryHeavyMarkerTimings

  expect(chunkCount).toBeGreaterThan(1)
  expect(timings.fastQuery - timings.shell).toBeGreaterThan(0)
  expect(timings.slowQuery - timings.fastQuery).toBeGreaterThan(100)
  expect(timings.documentEnd - timings.fastQuery).toBeGreaterThan(100)
}
