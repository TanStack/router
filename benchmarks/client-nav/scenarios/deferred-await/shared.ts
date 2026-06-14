import type { ClientNavWorkload } from '#client-nav/benchmark'
import type { Framework, MountTestApp } from '#client-nav/lifecycle'
import {
  createDeterministicRandom,
  randomSegment,
} from '#client-nav/bench-utils'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
} from '#client-nav/lifecycle'

export interface CriticalDeferredData {
  id: string
  label: string
  checksum: number
}

export interface DeferredPayload {
  key: string
  label: string
  checksum: number
}

export interface ItemLoaderData {
  critical: CriticalDeferredData
  primary: Promise<DeferredPayload>
  primaryKey: string
  secondary: Promise<DeferredPayload>
  secondaryKey: string
}

export interface DetailsLoaderData {
  critical: CriticalDeferredData
  details: Promise<DeferredPayload>
  detailsKey: string
}

export interface ReportSectionLoaderData {
  key: string
  promise: Promise<DeferredPayload>
}

export interface ReportLoaderData {
  critical: CriticalDeferredData
  sections: Array<ReportSectionLoaderData>
}

export interface DeferredRegistrySnapshot {
  pendingKeys: Array<string>
}

export interface DeferredAwaitControls {
  getDeferredRegistrySnapshot: () => DeferredRegistrySnapshot
  resetDeferredRegistry: () => void
  resolveDeferredKey: (key: string) => DeferredPayload
  resolveReportDeferredKeys: (reportId: string) => Array<DeferredPayload>
}

type ControlledDeferred = {
  key: string
  payload: DeferredPayload
  promise: Promise<DeferredPayload>
  resolve: (payload: DeferredPayload) => void
}

type DeferredTarget = {
  itemId: string
  reportId: string
}

export const REPORT_SECTION_COUNT = 6

const cycleCountPerInvocation = 8
const staleWindowMs = 60_000
const benchmarkRandom = createDeterministicRandom(0x64656672)

let benchmarkSequence = 0
let deferredRegistry = new Map<string, ControlledDeferred>()

function normalizeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9-]/g, '-')
}

function nextTargetId(label: string) {
  const sequence = benchmarkSequence.toString(36)
  return `${label}-${sequence}-${randomSegment(benchmarkRandom)}`
}

function createDeferredTarget(): DeferredTarget {
  benchmarkSequence += 1

  return {
    itemId: nextTargetId('item'),
    reportId: nextTargetId('report'),
  }
}

function createCriticalData(kind: string, id: string): CriticalDeferredData {
  const seed = `${kind}:${id}`

  return {
    id,
    label: `${kind}-${id}`,
    checksum: runDeferredComputation(seed, 18),
  }
}

function createDeferredPayload(key: string): DeferredPayload {
  return {
    key,
    label: `resolved-${key}`,
    checksum: runDeferredComputation(key, 28),
  }
}

function registerDeferredPayload(key: string) {
  if (deferredRegistry.has(key)) {
    throw new Error(`Deferred key already registered: ${key}`)
  }

  const payload = createDeferredPayload(key)
  let resolveDeferred!: (payload: DeferredPayload) => void
  const promise = new Promise<DeferredPayload>((resolve) => {
    resolveDeferred = resolve
  })

  deferredRegistry.set(key, {
    key,
    payload,
    promise,
    resolve: resolveDeferred,
  })

  return promise
}

export function deferredRouteStaleTime() {
  return staleWindowMs
}

function runDeferredComputation(seed: string | number, rounds = 24) {
  const text = String(seed)
  let value = typeof seed === 'number' ? Math.trunc(seed) : text.length

  for (let index = 0; index < rounds; index++) {
    const charCode = text.charCodeAt(index % text.length) || 0
    value = (value * 1664525 + 1013904223 + charCode + index) >>> 0
  }

  return value
}

export function itemPrimaryKey(itemId: string) {
  return `item-primary-${normalizeSegment(itemId)}`
}

export function itemSecondaryKey(itemId: string) {
  return `item-secondary-${normalizeSegment(itemId)}`
}

export function itemDetailsKey(itemId: string) {
  return `item-details-${normalizeSegment(itemId)}`
}

export function reportSectionKey(reportId: string, sectionIndex: number) {
  return `report-section-${normalizeSegment(reportId)}-${sectionIndex}`
}

export function deferredFallbackMarker(key: string) {
  return `fallback-${key}`
}

export function deferredResolvedMarker(key: string) {
  return `resolved-${key}`
}

export function createItemLoaderData(itemId: string): ItemLoaderData {
  const primaryKey = itemPrimaryKey(itemId)
  const secondaryKey = itemSecondaryKey(itemId)

  return {
    critical: createCriticalData('item', itemId),
    primary: registerDeferredPayload(primaryKey),
    primaryKey,
    secondary: registerDeferredPayload(secondaryKey),
    secondaryKey,
  }
}

export function createDetailsLoaderData(itemId: string): DetailsLoaderData {
  const detailsKey = itemDetailsKey(itemId)

  return {
    critical: createCriticalData('details', itemId),
    details: registerDeferredPayload(detailsKey),
    detailsKey,
  }
}

export function createReportLoaderData(reportId: string): ReportLoaderData {
  return {
    critical: createCriticalData('report', reportId),
    sections: Array.from(
      { length: REPORT_SECTION_COUNT },
      (_, sectionIndex) => {
        const key = reportSectionKey(reportId, sectionIndex)

        return {
          key,
          promise: registerDeferredPayload(key),
        }
      },
    ),
  }
}

export function getDeferredRegistrySnapshot(): DeferredRegistrySnapshot {
  return {
    pendingKeys: Array.from(deferredRegistry.keys()).sort(),
  }
}

export function resolveDeferredKey(key: string) {
  const entry = deferredRegistry.get(key)

  if (!entry) {
    throw new Error(`Missing deferred key: ${key}`)
  }

  deferredRegistry.delete(key)
  entry.resolve(entry.payload)

  return entry.payload
}

export function resolveReportDeferredKeys(reportId: string) {
  const payloads: Array<DeferredPayload> = []

  for (let index = 0; index < REPORT_SECTION_COUNT; index++) {
    payloads.push(resolveDeferredKey(reportSectionKey(reportId, index)))
  }

  return payloads
}

export function resetDeferredRegistry() {
  for (const entry of deferredRegistry.values()) {
    entry.resolve(entry.payload)
  }

  deferredRegistry = new Map<string, ControlledDeferred>()
}

function selectorForMarker(marker: string) {
  return `[data-deferred-marker="${marker}"]`
}

function readPageMarker(container: ParentNode) {
  const markers = Array.from(
    container.querySelectorAll<HTMLElement>('[data-deferred-page]'),
  )
  const marker = markers[markers.length - 1]

  return {
    page: marker?.dataset.deferredPage,
    id: marker?.dataset.deferredId,
  }
}

function hasMarker(container: ParentNode, marker: string) {
  return container.querySelector(selectorForMarker(marker)) !== null
}

function createReportResolvedMarkers(reportId: string) {
  return Array.from({ length: REPORT_SECTION_COUNT }, (_, index) =>
    deferredResolvedMarker(reportSectionKey(reportId, index)),
  )
}

function createReportFallbackMarkers(reportId: string) {
  return Array.from({ length: REPORT_SECTION_COUNT }, (_, index) =>
    deferredFallbackMarker(reportSectionKey(reportId, index)),
  )
}

export function createDeferredAwaitWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
  controls: DeferredAwaitControls,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({ mountTestApp })

  function assertPageMarker(expectedPage: string, expectedId?: string) {
    const actual = readPageMarker(lifecycle.getContainer())

    if (actual.page !== expectedPage || actual.id !== expectedId) {
      throw new Error(
        `Expected deferred page ${expectedPage}/${expectedId ?? ''}, got ${actual.page ?? 'missing'}/${actual.id ?? ''}`,
      )
    }
  }

  function assertMarkerMissing(marker: string) {
    if (hasMarker(lifecycle.getContainer(), marker)) {
      throw new Error(`Expected deferred marker to be absent: ${marker}`)
    }
  }

  function assertPending(key: string, expected: boolean) {
    const snapshot = controls.getDeferredRegistrySnapshot()
    const isPending = snapshot.pendingKeys.includes(key)

    if (isPending !== expected) {
      throw new Error(
        `Expected deferred key ${key} pending=${expected}, got ${isPending}`,
      )
    }
  }

  async function waitForPage(expectedPage: string, expectedId?: string) {
    await lifecycle.waitForCounter(
      () => {
        const actual = readPageMarker(lifecycle.getContainer())
        return actual.page === expectedPage && actual.id === expectedId ? 1 : 0
      },
      1,
      { label: `deferred page ${expectedPage}/${expectedId ?? ''}` },
    )

    assertPageMarker(expectedPage, expectedId)
  }

  async function waitForMarker(marker: string) {
    await lifecycle.waitForCounter(
      () => (hasMarker(lifecycle.getContainer(), marker) ? 1 : 0),
      1,
      { label: `deferred marker ${marker}` },
    )
  }

  async function waitForMarkers(markers: Array<string>, label: string) {
    await lifecycle.waitForCounter(
      () =>
        markers.reduce(
          (count, marker) =>
            hasMarker(lifecycle.getContainer(), marker) ? count + 1 : count,
          0,
        ),
      markers.length,
      { label },
    )
  }

  async function navigateToItem(itemId: string) {
    const primaryKey = itemPrimaryKey(itemId)
    const secondaryKey = itemSecondaryKey(itemId)

    await lifecycle.navigate(
      {
        to: '/deferred/items/$itemId',
        params: { itemId },
        replace: true,
      },
      { label: `deferred item ${itemId}`, wait: 'rendered' },
    )
    await waitForPage('item', itemId)
    await waitForMarker(deferredFallbackMarker(primaryKey))
    await waitForMarker(deferredFallbackMarker(secondaryKey))
    assertMarkerMissing(deferredResolvedMarker(primaryKey))
    assertMarkerMissing(deferredResolvedMarker(secondaryKey))
  }

  async function navigateToDetails(itemId: string) {
    const detailsKey = itemDetailsKey(itemId)

    await lifecycle.navigate(
      {
        to: '/deferred/items/$itemId/details',
        params: { itemId },
        replace: true,
      },
      { label: `deferred details ${itemId}`, wait: 'rendered' },
    )
    await waitForPage('details', itemId)
    await waitForMarker(deferredFallbackMarker(detailsKey))
    assertMarkerMissing(deferredResolvedMarker(detailsKey))
  }

  async function navigateToReport(reportId: string) {
    const fallbackMarkers = createReportFallbackMarkers(reportId)

    await lifecycle.navigate(
      {
        to: '/deferred/reports/$reportId',
        params: { reportId },
        replace: true,
      },
      { label: `deferred report ${reportId}`, wait: 'rendered' },
    )
    await waitForPage('report', reportId)
    await waitForMarkers(fallbackMarkers, `report fallbacks ${reportId}`)

    for (const marker of createReportResolvedMarkers(reportId)) {
      assertMarkerMissing(marker)
    }
  }

  async function resolveAndWait(key: string) {
    controls.resolveDeferredKey(key)
    await waitForMarker(deferredResolvedMarker(key))
    assertPending(key, false)
  }

  async function resolveReportAndWait(reportId: string) {
    controls.resolveReportDeferredKeys(reportId)
    await waitForMarkers(
      createReportResolvedMarkers(reportId),
      `report resolved markers ${reportId}`,
    )

    for (let index = 0; index < REPORT_SECTION_COUNT; index++) {
      assertPending(reportSectionKey(reportId, index), false)
    }
  }

  async function runCycle(target: DeferredTarget) {
    await navigateToItem(target.itemId)
    await resolveAndWait(itemPrimaryKey(target.itemId))
    await resolveAndWait(itemSecondaryKey(target.itemId))
    await navigateToDetails(target.itemId)
    await resolveAndWait(itemDetailsKey(target.itemId))
    await navigateToReport(target.reportId)
    await resolveReportAndWait(target.reportId)
  }

  async function before() {
    controls.resetDeferredRegistry()
    await lifecycle.before()
    await waitForPage('index')
  }

  async function after() {
    try {
      await lifecycle.after()
    } finally {
      controls.resetDeferredRegistry()
    }
  }

  async function run() {
    for (let index = 0; index < cycleCountPerInvocation; index++) {
      await runCycle(createDeferredTarget())
    }
  }

  async function sanity() {
    await before()

    try {
      const itemId = 'sanity-item'
      const reportId = 'sanity-report'
      const primaryKey = itemPrimaryKey(itemId)
      const secondaryKey = itemSecondaryKey(itemId)
      const detailsKey = itemDetailsKey(itemId)

      await navigateToItem(itemId)
      assertPending(primaryKey, true)
      assertPending(secondaryKey, true)
      assertMarkerMissing(deferredResolvedMarker(primaryKey))
      await resolveAndWait(primaryKey)
      assertPending(secondaryKey, true)
      await resolveAndWait(secondaryKey)

      await navigateToDetails(itemId)
      assertPending(detailsKey, true)
      await resolveAndWait(detailsKey)

      await navigateToReport(reportId)

      for (let index = 0; index < REPORT_SECTION_COUNT; index++) {
        const key = reportSectionKey(reportId, index)
        assertPending(key, true)
        assertMarkerMissing(deferredResolvedMarker(key))
      }

      await resolveReportAndWait(reportId)
    } finally {
      await after()
    }
  }

  return {
    name: `client deferred await loop (${framework})`,
    before,
    run,
    sanity,
    after,
  }
}
