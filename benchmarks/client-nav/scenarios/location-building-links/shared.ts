import type { NavigateOptions } from '@tanstack/router-core'
import type { ClientNavWorkload } from '#client-nav/benchmark'
import {
  createDeterministicRandom,
  randomSegment,
} from '#client-nav/bench-utils'
import {
  createClientNavLifecycle,
  warnClientNavDevMode,
  type Framework,
  type MountTestApp,
} from '#client-nav/lifecycle'

export type RootSearch = {
  page: number
  filter: string
  view: string
  preserve?: string
}

export type LinkKind =
  | 'project'
  | 'task'
  | 'relative-task'
  | 'project-updater'
  | 'report'
  | 'settings'

export type SearchVariant = 'object' | 'updater' | 'preserve' | 'none'

export type LinkDescriptor = {
  index: number
  key: string
  kind: LinkKind
  projectId: string
  siblingProjectId: string
  taskId: string
  reportId: string
  tab: string | undefined
  hash: string
  searchFilter: string
  searchVariant: SearchVariant
  activeVariant: number
  styleVariant: number
}

export type MatchDescriptor = {
  index: number
  key: string
  kind: Exclude<LinkKind, 'relative-task' | 'project-updater'>
  projectId: string
  taskId: string
  reportId: string
  tab: string | undefined
  includeSearch: boolean
  fuzzy: boolean
}

export type BuiltLocationSnapshot = {
  publicHref: string
  maskedLocation?: {
    publicHref: string
  }
}

type ScrollGlobal = typeof globalThis & {
  scrollTo?: typeof window.scrollTo
}

type NavigationStep = {
  label: string
  options: Record<string, unknown>
}

const linkKinds = [
  'project',
  'task',
  'relative-task',
  'project-updater',
  'report',
  'settings',
] as const satisfies ReadonlyArray<LinkKind>

const searchVariants = [
  'object',
  'updater',
  'preserve',
  'none',
] as const satisfies ReadonlyArray<SearchVariant>

const scenarioRandom = createDeterministicRandom(0x510cafe)

export const linkPanelExpectedCount = 300
export const matchProbeExpectedCount = 80
export const buildLocationExpectedCount = 30
export const navigationStepsPerCycle = 6
export const navigationCyclesPerRun = 4
export const navigationsPerBenchRun =
  navigationStepsPerCycle * navigationCyclesPerRun

export const settingsTabs = ['overview', 'billing', 'security', 'members']

function createSegments(prefix: string, count: number) {
  const values: Array<string> = []

  for (let index = 0; index < count; index++) {
    values.push(`${prefix}-${index}-${randomSegment(scenarioRandom)}`)
  }

  return values
}

export const projectIds = createSegments('project', 72)
export const taskIds = createSegments('task', 72)
export const reportIds = createSegments('report', 72)

export const initialProjectId = projectIds[0]!
export const initialLocation = `/dashboard/projects/${initialProjectId}?page=1&filter=initial&view=summary`

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numberValue = Number(value)

  if (Number.isFinite(numberValue) && numberValue > 0) {
    return Math.trunc(numberValue)
  }

  return fallback
}

function normalizeString(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return fallback
}

function normalizeOptionalString(value: unknown) {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return undefined
}

export function normalizeRootSearch(
  search: Record<string, unknown>,
): RootSearch {
  return {
    page: normalizePositiveInteger(search.page, 1),
    filter: normalizeString(search.filter, 'all'),
    view: normalizeString(search.view, 'summary'),
    preserve: normalizeOptionalString(search.preserve),
  }
}

function createLinkDescriptor(index: number): LinkDescriptor {
  const kind = linkKinds[index % linkKinds.length]!
  const projectId =
    index === 0 ? initialProjectId : projectIds[index % projectIds.length]!
  const siblingProjectId = projectIds[(index + 11) % projectIds.length]!
  const taskId = taskIds[(index * 3 + 5) % taskIds.length]!
  const reportId = reportIds[(index * 5 + 7) % reportIds.length]!
  const tab =
    index === 5
      ? settingsTabs[0]!
      : index % 12 === 5
        ? undefined
        : settingsTabs[index % settingsTabs.length]

  return {
    index,
    key: `location-link-${index}`,
    kind,
    projectId,
    siblingProjectId,
    taskId,
    reportId,
    tab,
    hash: `section-${index % 17}`,
    searchFilter: `filter-${index % 13}`,
    searchVariant:
      index === 5 ? 'preserve' : searchVariants[index % searchVariants.length]!,
    activeVariant: index === 5 ? 0 : index % 3,
    styleVariant: index % 4,
  }
}

function createMatchDescriptor(index: number): MatchDescriptor {
  const kindIndex = index % 4
  const kind = (
    kindIndex === 0
      ? 'project'
      : kindIndex === 1
        ? 'task'
        : kindIndex === 2
          ? 'report'
          : 'settings'
  ) satisfies MatchDescriptor['kind']

  return {
    index,
    key: `location-match-${index}`,
    kind,
    projectId: projectIds[(index * 7) % projectIds.length]!,
    taskId: taskIds[(index * 11) % taskIds.length]!,
    reportId: reportIds[(index * 13) % reportIds.length]!,
    tab:
      index % 8 === 0 ? undefined : settingsTabs[index % settingsTabs.length],
    includeSearch: index % 3 === 0,
    fuzzy: index % 2 === 0,
  }
}

export const linkDescriptors = Array.from(
  { length: linkPanelExpectedCount },
  (_, index) => createLinkDescriptor(index),
)

export const buildLocationDescriptors = linkDescriptors.slice(
  0,
  buildLocationExpectedCount,
)

export const hrefComparisonKeys = buildLocationDescriptors
  .slice(0, 12)
  .map((descriptor) => descriptor.key)

export const matchDescriptors = Array.from(
  { length: matchProbeExpectedCount },
  (_, index) => createMatchDescriptor(index),
)

export function createSearchObject(descriptor: LinkDescriptor): RootSearch {
  return {
    page: (descriptor.index % 11) + 1,
    filter: descriptor.searchFilter,
    view: descriptor.index % 2 === 0 ? 'grid' : 'list',
    preserve: descriptor.key,
  }
}

export function createSearchUpdater(descriptor: LinkDescriptor) {
  return (prev: RootSearch): RootSearch => {
    const normalized = normalizeRootSearch(
      prev as unknown as Record<string, unknown>,
    )

    return {
      page: normalized.page + ((descriptor.index % 3) + 1),
      filter: descriptor.searchFilter,
      view: normalized.view === 'grid' ? 'detail' : 'grid',
      preserve: descriptor.key,
    }
  }
}

function createSearchValue(descriptor: LinkDescriptor) {
  if (descriptor.searchVariant === 'object') {
    return createSearchObject(descriptor)
  }

  if (descriptor.searchVariant === 'updater') {
    return createSearchUpdater(descriptor)
  }

  if (descriptor.searchVariant === 'preserve') {
    return true
  }

  return undefined
}

function withSearch(
  options: Record<string, unknown>,
  descriptor: LinkDescriptor,
) {
  const search = createSearchValue(descriptor)

  if (search !== undefined) {
    return {
      ...options,
      search,
    }
  }

  return options
}

export function createLocationState(descriptor: LinkDescriptor) {
  return {
    scenario: 'location-building-links',
    key: descriptor.key,
    index: descriptor.index,
  }
}

export function createActiveOptions(descriptor: LinkDescriptor) {
  if (descriptor.activeVariant === 0) {
    return {
      exact: true,
      includeSearch: false,
    }
  }

  if (descriptor.activeVariant === 1) {
    return {
      includeSearch: true,
    }
  }

  return {
    includeSearch: true,
    includeHash: true,
  }
}

export function createLinkOptions(descriptor: LinkDescriptor) {
  if (descriptor.kind === 'project') {
    return withSearch(
      {
        to: '/dashboard/projects/$projectId',
        params: { projectId: descriptor.projectId },
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
      descriptor,
    )
  }

  if (descriptor.kind === 'task') {
    return withSearch(
      {
        to: '/dashboard/projects/$projectId/tasks/$taskId',
        params: {
          projectId: descriptor.projectId,
          taskId: descriptor.taskId,
        },
        hash: descriptor.hash,
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
      descriptor,
    )
  }

  if (descriptor.kind === 'relative-task') {
    return withSearch(
      {
        from: '/dashboard/projects/$projectId',
        to: './tasks/$taskId',
        params: (prev: { projectId?: string }) => ({
          ...prev,
          projectId: descriptor.projectId,
          taskId: descriptor.taskId,
        }),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
      descriptor,
    )
  }

  if (descriptor.kind === 'project-updater') {
    return withSearch(
      {
        to: '/dashboard/projects/$projectId',
        params: (prev: { projectId?: string }) => ({
          ...prev,
          projectId: descriptor.siblingProjectId,
        }),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
      descriptor,
    )
  }

  if (descriptor.kind === 'report') {
    return withSearch(
      {
        to: '/dashboard/reports/$reportId',
        params: { reportId: descriptor.reportId },
        hash: descriptor.hash,
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
      descriptor,
    )
  }

  return withSearch(
    {
      to: '/settings/{-$tab}',
      params: { tab: descriptor.tab },
      replace: true,
      resetScroll: false,
      hashScrollIntoView: false,
    },
    descriptor,
  )
}

export function createMatchOptions(descriptor: MatchDescriptor) {
  const base = {
    includeSearch: descriptor.includeSearch,
    fuzzy: descriptor.fuzzy,
  }

  if (descriptor.kind === 'project') {
    return {
      ...base,
      to: '/dashboard/projects/$projectId',
      params: { projectId: descriptor.projectId },
    }
  }

  if (descriptor.kind === 'task') {
    return {
      ...base,
      to: '/dashboard/projects/$projectId/tasks/$taskId',
      params: {
        projectId: descriptor.projectId,
        taskId: descriptor.taskId,
      },
    }
  }

  if (descriptor.kind === 'report') {
    return {
      ...base,
      to: '/dashboard/reports/$reportId',
      params: { reportId: descriptor.reportId },
    }
  }

  return {
    ...base,
    to: '/settings/{-$tab}',
    params: { tab: descriptor.tab },
  }
}

export function createLinkLabel(descriptor: LinkDescriptor) {
  if (descriptor.kind === 'project') {
    return `Project ${descriptor.projectId}`
  }

  if (descriptor.kind === 'task') {
    return `Task ${descriptor.projectId}/${descriptor.taskId}`
  }

  if (descriptor.kind === 'relative-task') {
    return `Relative task ${descriptor.taskId}`
  }

  if (descriptor.kind === 'project-updater') {
    return `Updater project ${descriptor.siblingProjectId}`
  }

  if (descriptor.kind === 'report') {
    return `Report ${descriptor.reportId}`
  }

  return `Settings ${descriptor.tab ?? 'default'}`
}

export function readBuiltPublicHref(location: BuiltLocationSnapshot) {
  return location.maskedLocation?.publicHref ?? location.publicHref
}

export function patchMissingScrollToGlobal() {
  const scrollGlobal = globalThis as ScrollGlobal
  const hadScrollTo = Object.prototype.hasOwnProperty.call(
    scrollGlobal,
    'scrollTo',
  )
  const previousScrollTo = scrollGlobal.scrollTo

  if (typeof previousScrollTo === 'function') {
    return () => {}
  }

  const fallbackScrollTo =
    typeof window !== 'undefined' && typeof window.scrollTo === 'function'
      ? window.scrollTo.bind(window)
      : () => {}

  Object.defineProperty(scrollGlobal, 'scrollTo', {
    value: fallbackScrollTo,
    configurable: true,
    writable: true,
  })

  let restored = false

  return () => {
    if (restored) {
      return
    }

    restored = true

    if (hadScrollTo) {
      Object.defineProperty(scrollGlobal, 'scrollTo', {
        value: previousScrollTo,
        configurable: true,
        writable: true,
      })
      return
    }

    delete (scrollGlobal as { scrollTo?: typeof window.scrollTo }).scrollTo
  }
}

function createActionSearch(cycle: number, label: string): RootSearch {
  return {
    page: cycle + 1,
    filter: `${label}-${cycle}`,
    view: cycle % 2 === 0 ? 'grid' : 'list',
    preserve: `action-${label}-${cycle}`,
  }
}

function createActionSearchUpdater(cycle: number, label: string) {
  return (prev: RootSearch): RootSearch => {
    const normalized = normalizeRootSearch(
      prev as unknown as Record<string, unknown>,
    )

    return {
      page: normalized.page + cycle + 1,
      filter: `${label}-${cycle}`,
      view: normalized.view === 'grid' ? 'detail' : 'grid',
      preserve: `action-${label}-${cycle}`,
    }
  }
}

function createNavigationCycle(cycle: number): Array<NavigationStep> {
  const projectId = projectIds[(cycle * 7 + 1) % projectIds.length]!
  const siblingProjectId = projectIds[(cycle * 7 + 2) % projectIds.length]!
  const taskId = taskIds[(cycle * 5 + 3) % taskIds.length]!
  const reportId = reportIds[(cycle * 3 + 4) % reportIds.length]!
  const tab =
    cycle % 2 === 0 ? settingsTabs[cycle % settingsTabs.length] : undefined

  return [
    {
      label: `project-${cycle}`,
      options: {
        to: '/dashboard/projects/$projectId',
        params: { projectId },
        search: createActionSearch(cycle, 'project'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `task-${cycle}`,
      options: {
        from: '/dashboard/projects/$projectId',
        to: './tasks/$taskId',
        params: (prev: { projectId?: string }) => ({
          ...prev,
          projectId,
          taskId,
        }),
        search: createActionSearchUpdater(cycle, 'task'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `sibling-project-${cycle}`,
      options: {
        to: '/dashboard/projects/$projectId',
        params: (prev: { projectId?: string }) => ({
          ...prev,
          projectId: siblingProjectId,
        }),
        search: true,
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `report-${cycle}`,
      options: {
        to: '/dashboard/reports/$reportId',
        params: { reportId },
        search: createActionSearch(cycle, 'report'),
        hash: `report-${cycle}`,
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `settings-${cycle}`,
      options: {
        to: '/settings/{-$tab}',
        params: { tab },
        search: createActionSearch(cycle, 'settings'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      label: `hash-only-${cycle}`,
      options: {
        from: '/settings/{-$tab}',
        to: '.',
        params: { tab },
        search: true,
        hash: `settings-hash-${cycle}`,
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
  ]
}

const navigationSteps = Array.from(
  { length: navigationCyclesPerRun },
  (_, cycle) => createNavigationCycle(cycle),
).flat()

function getRouteMarker(container: ParentNode) {
  return container.querySelector<HTMLElement>('[data-route-marker]')
}

function assertCount(
  container: ParentNode,
  selector: string,
  expected: number,
) {
  const actual = container.querySelectorAll(selector).length

  if (actual !== expected) {
    throw new Error(`Expected ${expected} ${selector} nodes, got ${actual}`)
  }
}

function assertActiveLink(container: ParentNode) {
  if (!container.querySelector('.active-link')) {
    throw new Error('Expected at least one active link class')
  }
}

function assertRouteMarker(
  container: ParentNode,
  expected: {
    route: string
    projectId?: string
    taskId?: string
    reportId?: string
    tab?: string
  },
) {
  const marker = getRouteMarker(container)

  if (!marker) {
    throw new Error('Expected an active route marker')
  }

  if (marker.dataset.routeMarker !== expected.route) {
    throw new Error(
      `Expected route marker ${expected.route}, got ${marker.dataset.routeMarker}`,
    )
  }

  const checks = [
    ['projectId', expected.projectId],
    ['taskId', expected.taskId],
    ['reportId', expected.reportId],
    ['tab', expected.tab],
  ] as const

  for (const [field, value] of checks) {
    if (value !== undefined && marker.dataset[field] !== value) {
      throw new Error(
        `Expected route marker ${field} ${value}, got ${marker.dataset[field]}`,
      )
    }
  }
}

function assertHrefParity(container: ParentNode) {
  for (const key of hrefComparisonKeys) {
    const link = container.querySelector<HTMLAnchorElement>(
      `[data-href-key="${key}"]`,
    )
    const built = container.querySelector<HTMLElement>(
      `[data-built-key="${key}"]`,
    )
    const linkHref = link?.getAttribute('href')
    const builtHref = built?.dataset.builtHref

    if (!linkHref || !builtHref || linkHref !== builtHref) {
      throw new Error(
        `Href parity failed for ${key}: link=${linkHref} built=${builtHref}`,
      )
    }
  }
}

export function createLocationBuildingLinksWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({
    mountTestApp,
    timeoutMs: 4_000,
  })
  let stepIndex = 0

  async function waitForScenarioReady() {
    await lifecycle.waitForCounter(
      () =>
        lifecycle.getContainer().querySelectorAll('[data-location-link="true"]')
          .length,
      linkPanelExpectedCount,
      { label: 'location link panel render' },
    )
    await lifecycle.waitForCounter(
      () =>
        lifecycle.getContainer().querySelectorAll('[data-match-probe="true"]')
          .length,
      matchProbeExpectedCount,
      { label: 'location match probe render' },
    )
    await lifecycle.waitForCounter(
      () =>
        lifecycle.getContainer().querySelectorAll('[data-built-href]').length,
      buildLocationExpectedCount,
      { label: 'location build href render' },
    )
  }

  async function before() {
    stepIndex = 0
    await lifecycle.before()
    await waitForScenarioReady()
  }

  async function runSteps(count: number) {
    for (let index = 0; index < count; index++) {
      const step = navigationSteps[stepIndex % navigationSteps.length]!
      stepIndex += 1

      await lifecycle.navigate(step.options as NavigateOptions, {
        wait: 'rendered',
        label: step.label,
      })
    }
  }

  async function sanity() {
    await before()

    try {
      const container = lifecycle.getContainer()
      assertCount(
        container,
        '[data-location-link="true"]',
        linkPanelExpectedCount,
      )
      assertCount(
        container,
        '[data-match-probe="true"]',
        matchProbeExpectedCount,
      )
      assertCount(container, '[data-built-href]', buildLocationExpectedCount)
      assertActiveLink(container)
      assertRouteMarker(container, {
        route: 'project',
        projectId: initialProjectId,
      })
      assertHrefParity(container)

      await runSteps(navigationStepsPerCycle)

      await lifecycle.waitForCounter(
        () => {
          const marker = getRouteMarker(container)
          return marker?.dataset.routeMarker === 'settings' ? 1 : 0
        },
        1,
        { label: 'settings route marker' },
      )

      assertRouteMarker(container, {
        route: 'settings',
        tab: settingsTabs[0],
      })
      assertActiveLink(container)
      assertHrefParity(container)
    } finally {
      await lifecycle.after()
    }
  }

  return {
    name: `client location building links loop (${framework})`,
    before,
    run: () => runSteps(navigationsPerBenchRun),
    sanity,
    after: lifecycle.after,
  }
}
