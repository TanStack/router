import type { LocationRewrite, NavigateOptions } from '@tanstack/router-core'
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

export type MaskingSearch = {
  page: number
  filter: string
  layout: string
}

export type LinkKind =
  | 'photo-detail'
  | 'auto-masked-modal'
  | 'explicit-masked-modal'
  | 'unmasked-modal'
  | 'legacy-settings'
  | 'team-project'

export type LinkDescriptor = {
  index: number
  key: string
  testId: string
  kind: LinkKind
  photoId: string
  teamId: string
  projectId: string
  hash: string
}

export type BuiltLocationSnapshot = {
  href: string
  publicHref: string
  pathname: string
  hash: string
  maskedLocation?: {
    href: string
    publicHref: string
    pathname: string
    state: any
  }
  state: any
}

type RouteMarkerExpectation = {
  route: string
  photoId?: string
  teamId?: string
  projectId?: string
}

type NavigationStep =
  | {
      kind: 'navigate'
      label: string
      options: Record<string, unknown>
    }
  | {
      kind: 'click'
      label: string
      testId: string
    }

type ScrollGlobal = typeof globalThis & {
  scrollTo?: typeof window.scrollTo
}

const scenarioRandom = createDeterministicRandom(0x13a5cafe)

const linkKinds = [
  'photo-detail',
  'auto-masked-modal',
  'explicit-masked-modal',
  'unmasked-modal',
  'legacy-settings',
  'team-project',
] as const satisfies ReadonlyArray<LinkKind>

export const routerBasepath = '/app'
export const publicLocale = 'en'
export const publicLocalePrefix = `/${publicLocale}`
export const linkPanelExpectedCount = 72
export const buildLocationExpectedCount = 24
export const navigationStepsPerCycle = 8
export const navigationCyclesPerRun = 2
export const navigationsPerBenchRun =
  navigationStepsPerCycle * navigationCyclesPerRun

function createSegments(prefix: string, count: number) {
  const values: Array<string> = []

  for (let index = 0; index < count; index++) {
    values.push(`${prefix}-${index}-${randomSegment(scenarioRandom)}`)
  }

  return values
}

export const photoIds = createSegments('photo', 80)
export const teamIds = createSegments('team', 32)
export const projectIds = createSegments('project', 48)
export const initialPhotoId = photoIds[0]!

function ensureLeadingSlash(pathname: string) {
  return pathname.startsWith('/') ? pathname : `/${pathname}`
}

function trimTrailingSlash(pathname: string) {
  if (pathname !== '/' && pathname.endsWith('/')) {
    return pathname.slice(0, -1)
  }

  return pathname
}

function withOptionalTrailingSlash(pathname: string, trailingSlash: boolean) {
  const normalized = ensureLeadingSlash(pathname)

  if (trailingSlash) {
    return normalized.endsWith('/') ? normalized : `${normalized}/`
  }

  return trimTrailingSlash(normalized)
}

function addSearchAndHash(
  pathname: string,
  search?: MaskingSearch,
  hash?: string,
) {
  const searchStr = search ? stringifySearch(search) : ''
  const hashStr = hash ? `#${hash}` : ''

  return `${pathname}${searchStr}${hashStr}`
}

function normalizePositiveInteger(value: unknown, fallback: number) {
  const numericValue = Number(value)

  if (Number.isFinite(numericValue) && numericValue > 0) {
    return Math.trunc(numericValue)
  }

  return fallback
}

function normalizeString(value: unknown, fallback: string) {
  if (typeof value === 'string' && value.length > 0) {
    return value
  }

  return fallback
}

export function normalizeMaskingSearch(
  search: Record<string, unknown>,
): MaskingSearch {
  return {
    page: normalizePositiveInteger(search.page, 1),
    filter: normalizeString(search.filter, 'all'),
    layout: normalizeString(search.layout, 'grid'),
  }
}

export function stringifySearch(search: MaskingSearch) {
  const params = new URLSearchParams()
  params.set('page', `${search.page}`)
  params.set('filter', search.filter)
  params.set('layout', search.layout)

  return `?${params.toString()}`
}

export function createActionSearch(
  cycle: number,
  label: string,
): MaskingSearch {
  return {
    page: cycle + 2,
    filter: `${label}-${cycle}`,
    layout: cycle % 2 === 0 ? 'grid' : 'detail',
  }
}

export function internalPhotosPath(trailingSlash = false) {
  return withOptionalTrailingSlash('/photos', trailingSlash)
}

export function internalPhotoDetailPath(
  photoId: string,
  trailingSlash = false,
) {
  return withOptionalTrailingSlash(`/photos/${photoId}`, trailingSlash)
}

export function internalPhotoModalPath(photoId: string, trailingSlash = false) {
  return withOptionalTrailingSlash(`/photos/${photoId}/modal`, trailingSlash)
}

export function internalSettingsProfilePath(trailingSlash = false) {
  return withOptionalTrailingSlash('/settings/profile', trailingSlash)
}

export function internalTeamProjectPath(
  teamId: string,
  projectId: string,
  trailingSlash = false,
) {
  return withOptionalTrailingSlash(
    `/teams/${teamId}/projects/${projectId}`,
    trailingSlash,
  )
}

export function publicPhotosHref(
  search?: MaskingSearch,
  trailingSlash = false,
) {
  return addSearchAndHash(
    `${routerBasepath}${publicLocalePrefix}${internalPhotosPath(trailingSlash)}`,
    search,
  )
}

export function publicPhotoDetailHref(
  photoId: string,
  search?: MaskingSearch,
  hash?: string,
  trailingSlash = false,
) {
  return addSearchAndHash(
    `${routerBasepath}${publicLocalePrefix}${internalPhotoDetailPath(
      photoId,
      trailingSlash,
    )}`,
    search,
    hash,
  )
}

export function publicPhotoModalHref(
  photoId: string,
  search?: MaskingSearch,
  hash?: string,
  trailingSlash = false,
) {
  return addSearchAndHash(
    `${routerBasepath}${publicLocalePrefix}${internalPhotoModalPath(
      photoId,
      trailingSlash,
    )}`,
    search,
    hash,
  )
}

export function publicLegacySettingsHref(
  search?: MaskingSearch,
  trailingSlash = false,
) {
  return addSearchAndHash(
    `${routerBasepath}${publicLocalePrefix}${withOptionalTrailingSlash(
      '/legacy/profile',
      trailingSlash,
    )}`,
    search,
  )
}

export function publicTeamProjectHref(
  teamId: string,
  projectId: string,
  search?: MaskingSearch,
  hash?: string,
  trailingSlash = false,
) {
  return addSearchAndHash(
    `${routerBasepath}${publicLocalePrefix}${internalTeamProjectPath(
      teamId,
      projectId,
      trailingSlash,
    )}`,
    search,
    hash,
  )
}

export const initialPublicHref = publicPhotosHref({
  page: 1,
  filter: 'initial',
  layout: 'grid',
})

function stripPublicLocalePrefix(pathname: string) {
  if (
    pathname === publicLocalePrefix ||
    pathname === `${publicLocalePrefix}/`
  ) {
    return '/'
  }

  if (pathname.startsWith(`${publicLocalePrefix}/`)) {
    return pathname.slice(publicLocalePrefix.length)
  }

  return pathname
}

function addPublicLocalePrefix(pathname: string) {
  if (pathname === '/') {
    return `${publicLocalePrefix}/`
  }

  if (pathname.startsWith(`${publicLocalePrefix}/`)) {
    return pathname
  }

  return `${publicLocalePrefix}${ensureLeadingSlash(pathname)}`
}

function isLegacySettingsPath(pathname: string) {
  return trimTrailingSlash(pathname) === `${publicLocalePrefix}/legacy/profile`
}

function isInternalSettingsProfilePath(pathname: string) {
  return trimTrailingSlash(pathname) === '/settings/profile'
}

export function createMaskingRewrite(): LocationRewrite {
  return {
    input: ({ url }) => {
      const nextUrl = new URL(url.href)

      if (isLegacySettingsPath(nextUrl.pathname)) {
        nextUrl.pathname = withOptionalTrailingSlash(
          '/settings/profile',
          nextUrl.pathname.endsWith('/'),
        )
        return nextUrl
      }

      nextUrl.pathname = stripPublicLocalePrefix(nextUrl.pathname)

      return nextUrl
    },
    output: ({ url }) => {
      const nextUrl = new URL(url.href)

      if (isInternalSettingsProfilePath(nextUrl.pathname)) {
        nextUrl.pathname = withOptionalTrailingSlash(
          `${publicLocalePrefix}/legacy/profile`,
          nextUrl.pathname.endsWith('/'),
        )
        return nextUrl
      }

      nextUrl.pathname = addPublicLocalePrefix(nextUrl.pathname)

      return nextUrl
    },
  }
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

function createLinkDescriptor(index: number): LinkDescriptor {
  const kind = linkKinds[index % linkKinds.length]!

  return {
    index,
    key: `masking-link-${index}`,
    testId: `masking-link-${index}`,
    kind,
    photoId: index === 0 ? initialPhotoId : photoIds[index % photoIds.length]!,
    teamId: teamIds[(index * 5 + 3) % teamIds.length]!,
    projectId: projectIds[(index * 7 + 2) % projectIds.length]!,
    hash: `panel-${index % 11}`,
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

function getDescriptorByKind(kind: LinkKind, ordinal = 0) {
  let seen = 0

  for (const descriptor of linkDescriptors) {
    if (descriptor.kind !== kind) {
      continue
    }

    if (seen === ordinal) {
      return descriptor
    }

    seen += 1
  }

  throw new Error(`Missing masking rewrite link descriptor for ${kind}`)
}

const teamNavigationDescriptors = [
  getDescriptorByKind('team-project', 0),
  getDescriptorByKind('team-project', 1),
]

export const requiredNavigationLinkTestIds = teamNavigationDescriptors.map(
  (descriptor) => descriptor.testId,
)

export function createDescriptorSearch(
  descriptor: LinkDescriptor,
): MaskingSearch {
  return {
    page: (descriptor.index % 9) + 1,
    filter: `descriptor-${descriptor.index % 13}`,
    layout: descriptor.index % 2 === 0 ? 'grid' : 'detail',
  }
}

export function createLinkState(descriptor: LinkDescriptor) {
  return {
    scenario: 'masking-rewrites',
    key: descriptor.key,
    kind: descriptor.kind,
  }
}

export function createLinkOptions(descriptor: LinkDescriptor) {
  const baseOptions = {
    replace: true,
    resetScroll: false,
    hashScrollIntoView: false,
    state: createLinkState(descriptor),
  }

  if (descriptor.kind === 'photo-detail') {
    return {
      ...baseOptions,
      to: '/photos/$photoId',
      params: { photoId: descriptor.photoId },
      search: createDescriptorSearch(descriptor),
    }
  }

  if (descriptor.kind === 'auto-masked-modal') {
    return {
      ...baseOptions,
      to: '/photos/$photoId/modal',
      params: { photoId: descriptor.photoId },
      search: createDescriptorSearch(descriptor),
    }
  }

  if (descriptor.kind === 'explicit-masked-modal') {
    return {
      ...baseOptions,
      to: '/photos/$photoId/modal',
      params: { photoId: descriptor.photoId },
      search: createDescriptorSearch(descriptor),
      mask: {
        to: '/photos/$photoId',
        params: { photoId: descriptor.photoId },
        search: {
          ...createDescriptorSearch(descriptor),
          layout: 'detail',
        },
        state: {
          scenario: 'masking-rewrites',
          key: descriptor.key,
          mask: 'explicit-photo-detail',
        },
        unmaskOnReload: true,
      },
    }
  }

  if (descriptor.kind === 'unmasked-modal') {
    return {
      ...baseOptions,
      to: '/photos/$photoId/modal',
      params: { photoId: descriptor.photoId },
      search: createDescriptorSearch(descriptor),
      mask: {
        to: '/photos/$photoId/modal',
        params: { photoId: descriptor.photoId },
        search: createDescriptorSearch(descriptor),
        state: {
          scenario: 'masking-rewrites',
          key: descriptor.key,
          mask: 'visible-modal',
        },
      },
    }
  }

  if (descriptor.kind === 'legacy-settings') {
    return {
      ...baseOptions,
      to: '/settings/profile',
      search: createDescriptorSearch(descriptor),
    }
  }

  return {
    ...baseOptions,
    to: '/teams/$teamId/projects/$projectId',
    params: {
      teamId: descriptor.teamId,
      projectId: descriptor.projectId,
    },
    search: createDescriptorSearch(descriptor),
    hash: descriptor.hash,
  }
}

export function createLinkLabel(descriptor: LinkDescriptor) {
  if (descriptor.kind === 'photo-detail') {
    return `Photo ${descriptor.photoId}`
  }

  if (descriptor.kind === 'auto-masked-modal') {
    return `Auto masked modal ${descriptor.photoId}`
  }

  if (descriptor.kind === 'explicit-masked-modal') {
    return `Explicit masked modal ${descriptor.photoId}`
  }

  if (descriptor.kind === 'unmasked-modal') {
    return `Visible modal ${descriptor.photoId}`
  }

  if (descriptor.kind === 'legacy-settings') {
    return `Legacy settings ${descriptor.index}`
  }

  return `Team ${descriptor.teamId} project ${descriptor.projectId}`
}

export function readVisiblePublicHref(location: BuiltLocationSnapshot) {
  return location.maskedLocation?.publicHref ?? location.publicHref
}

function createNavigationCycle(cycle: number): Array<NavigationStep> {
  const firstPhotoId = photoIds[(cycle * 8 + 1) % photoIds.length]!
  const secondPhotoId = photoIds[(cycle * 8 + 2) % photoIds.length]!
  const unmaskedPhotoId = photoIds[(cycle * 8 + 3) % photoIds.length]!
  const noSlashPhotoId = photoIds[(cycle * 8 + 4) % photoIds.length]!
  const slashPhotoId = photoIds[(cycle * 8 + 5) % photoIds.length]!
  const teamDescriptor =
    teamNavigationDescriptors[cycle % teamNavigationDescriptors.length]!

  return [
    {
      kind: 'navigate',
      label: `public-photos-${cycle}`,
      options: {
        href: publicPhotosHref(createActionSearch(cycle, 'photos'), false),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      kind: 'navigate',
      label: `auto-masked-modal-${cycle}`,
      options: {
        to: '/photos/$photoId/modal',
        params: { photoId: firstPhotoId },
        search: createActionSearch(cycle, 'auto-mask'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      kind: 'navigate',
      label: `auto-masked-modal-next-${cycle}`,
      options: {
        to: '/photos/$photoId/modal',
        params: { photoId: secondPhotoId },
        search: createActionSearch(cycle, 'auto-mask-next'),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      kind: 'navigate',
      label: `unmasked-modal-${cycle}`,
      options: {
        to: '/photos/$photoId/modal',
        params: { photoId: unmaskedPhotoId },
        search: createActionSearch(cycle, 'visible-modal'),
        mask: {
          to: '/photos/$photoId/modal',
          params: { photoId: unmaskedPhotoId },
          search: createActionSearch(cycle, 'visible-modal-mask'),
          state: {
            scenario: 'masking-rewrites',
            cycle,
            mask: 'visible-modal',
          },
        },
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      kind: 'navigate',
      label: `legacy-settings-${cycle}`,
      options: {
        href: publicLegacySettingsHref(
          createActionSearch(cycle, 'legacy-settings'),
          cycle % 2 === 0,
        ),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      kind: 'click',
      label: `team-project-link-${cycle}`,
      testId: teamDescriptor.testId,
    },
    {
      kind: 'navigate',
      label: `trailing-no-slash-${cycle}`,
      options: {
        href: publicPhotoDetailHref(
          noSlashPhotoId,
          createActionSearch(cycle, 'no-slash'),
          undefined,
          false,
        ),
        replace: true,
        resetScroll: false,
        hashScrollIntoView: false,
      },
    },
    {
      kind: 'navigate',
      label: `trailing-slash-${cycle}`,
      options: {
        href: publicPhotoDetailHref(
          slashPhotoId,
          createActionSearch(cycle, 'slash'),
          undefined,
          true,
        ),
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

function assertRouteMarker(
  container: ParentNode,
  expected: RouteMarkerExpectation,
) {
  const marker = getRouteMarker(container)

  if (!marker) {
    throw new Error('Expected a masking rewrite route marker')
  }

  if (marker.dataset.routeMarker !== expected.route) {
    throw new Error(
      `Expected route marker ${expected.route}, got ${marker.dataset.routeMarker}`,
    )
  }

  const checks = [
    ['photoId', expected.photoId],
    ['teamId', expected.teamId],
    ['projectId', expected.projectId],
  ] as const

  for (const [field, value] of checks) {
    if (value !== undefined && marker.dataset[field] !== value) {
      throw new Error(
        `Expected route marker ${field} ${value}, got ${marker.dataset[field]}`,
      )
    }
  }
}

function assertPublicInternalDifference(
  location: BuiltLocationSnapshot,
  expectedInternalPath: string,
  expectedPublicPrefix: string,
) {
  const visiblePublicHref = readVisiblePublicHref(location)

  if (!location.href.startsWith(expectedInternalPath)) {
    throw new Error(
      `Expected internal href to start with ${expectedInternalPath}, got ${location.href}`,
    )
  }

  if (!visiblePublicHref.startsWith(expectedPublicPrefix)) {
    throw new Error(
      `Expected visible public href to start with ${expectedPublicPrefix}, got ${visiblePublicHref}`,
    )
  }

  if (location.href === visiblePublicHref) {
    throw new Error(
      `Expected internal and public hrefs to differ: ${location.href}`,
    )
  }

  if (!location.publicHref) {
    throw new Error('Expected location.publicHref to be populated')
  }
}

function assertMaskedLocationState(location: BuiltLocationSnapshot) {
  if (!location.maskedLocation) {
    throw new Error('Expected a masked location')
  }

  if (!location.maskedLocation.state.__tempLocation) {
    throw new Error('Expected masked location temp-location state')
  }
}

function assertBuiltHrefTransforms(container: ParentNode) {
  let maskedHrefCount = 0
  let legacyHrefCount = 0
  let differingHrefCount = 0

  for (const node of container.querySelectorAll<HTMLElement>(
    '[data-built-visible-href]',
  )) {
    const key = node.dataset.builtKey
    const kind = node.dataset.builtKind
    const internalHref = node.dataset.builtInternalHref
    const visibleHref = node.dataset.builtVisibleHref

    if (!key || !kind || !internalHref || !visibleHref) {
      throw new Error('Expected complete built href metadata')
    }

    const link = container.querySelector<HTMLAnchorElement>(
      `[data-mask-link-key="${key}"]`,
    )
    const linkHref = link?.getAttribute('href')

    if (linkHref !== visibleHref) {
      throw new Error(
        `Href parity failed for ${key}: link=${linkHref} built=${visibleHref}`,
      )
    }

    if (internalHref !== visibleHref) {
      differingHrefCount += 1
    }

    if (kind === 'auto-masked-modal') {
      maskedHrefCount += 1

      if (!internalHref.includes('/modal') || visibleHref.includes('/modal')) {
        throw new Error(
          `Expected masked modal href pair, got internal=${internalHref} visible=${visibleHref}`,
        )
      }
    }

    if (kind === 'legacy-settings') {
      legacyHrefCount += 1

      if (
        !visibleHref.startsWith(
          `${routerBasepath}${publicLocalePrefix}/legacy/profile`,
        )
      ) {
        throw new Error(
          `Expected legacy settings public href, got ${visibleHref}`,
        )
      }
    }
  }

  if (maskedHrefCount === 0) {
    throw new Error('Expected at least one masked modal built href')
  }

  if (legacyHrefCount === 0) {
    throw new Error('Expected at least one legacy settings built href')
  }

  if (differingHrefCount === 0) {
    throw new Error('Expected at least one differing internal/public href pair')
  }
}

export function createMaskingRewritesWorkload(
  framework: Framework,
  mountTestApp: MountTestApp,
): ClientNavWorkload {
  warnClientNavDevMode(framework)

  const lifecycle = createClientNavLifecycle({
    mountTestApp,
    timeoutMs: 4_000,
  })
  const cachedLinks = new Map<string, HTMLAnchorElement>()
  let stepIndex = 0

  async function waitForScenarioReady() {
    await lifecycle.waitForCounter(
      () =>
        lifecycle.getContainer().querySelectorAll('[data-masking-link="true"]')
          .length,
      linkPanelExpectedCount,
      { label: 'masking rewrite link panel render' },
    )
    await lifecycle.waitForCounter(
      () =>
        lifecycle.getContainer().querySelectorAll('[data-built-visible-href]')
          .length,
      buildLocationExpectedCount,
      { label: 'masking rewrite build href render' },
    )
  }

  async function prepareLinks() {
    for (const testId of requiredNavigationLinkTestIds) {
      await lifecycle.waitForLink(testId, cachedLinks)
    }
  }

  async function before() {
    stepIndex = 0
    cachedLinks.clear()
    await lifecycle.before()
    await waitForScenarioReady()
    await prepareLinks()
  }

  async function runSteps(count: number) {
    for (let index = 0; index < count; index++) {
      const step = navigationSteps[stepIndex % navigationSteps.length]!
      stepIndex += 1

      if (step.kind === 'click') {
        await lifecycle.click(step.testId, {
          cache: cachedLinks,
          wait: 'rendered',
          label: step.label,
        })
        continue
      }

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
      const router = lifecycle.getRouter()
      const firstMaskedPhotoId = photoIds[1]!
      const teamDescriptor = teamNavigationDescriptors[0]!

      assertCount(
        container,
        '[data-masking-link="true"]',
        linkPanelExpectedCount,
      )
      assertCount(
        container,
        '[data-built-visible-href]',
        buildLocationExpectedCount,
      )
      assertRouteMarker(container, { route: 'photos' })
      assertPublicInternalDifference(
        router.state.location as unknown as BuiltLocationSnapshot,
        internalPhotosPath(),
        `${routerBasepath}${publicLocalePrefix}${internalPhotosPath()}`,
      )
      assertBuiltHrefTransforms(container)

      const builtMaskedLocation = router.buildLocation({
        to: '/photos/$photoId/modal',
        params: { photoId: firstMaskedPhotoId },
        replace: true,
      } as never) as unknown as BuiltLocationSnapshot

      if (!builtMaskedLocation.maskedLocation) {
        throw new Error('Expected route mask to build a masked location')
      }

      assertPublicInternalDifference(
        builtMaskedLocation,
        internalPhotoModalPath(firstMaskedPhotoId),
        publicPhotoDetailHref(firstMaskedPhotoId).replace(/\?.*$/, ''),
      )

      await lifecycle.navigate(
        {
          to: '/photos/$photoId/modal',
          params: { photoId: firstMaskedPhotoId },
          search: createActionSearch(0, 'sanity-mask'),
          replace: true,
          resetScroll: false,
          hashScrollIntoView: false,
        } as NavigateOptions,
        { wait: 'rendered', label: 'sanity masked modal' },
      )
      assertRouteMarker(container, {
        route: 'photo-modal',
        photoId: firstMaskedPhotoId,
      })
      assertPublicInternalDifference(
        router.state.location as unknown as BuiltLocationSnapshot,
        internalPhotoModalPath(firstMaskedPhotoId),
        publicPhotoDetailHref(firstMaskedPhotoId).replace(/\?.*$/, ''),
      )
      assertMaskedLocationState(
        router.state.location as unknown as BuiltLocationSnapshot,
      )

      await lifecycle.navigate(
        {
          href: publicLegacySettingsHref(
            createActionSearch(0, 'sanity-legacy'),
          ),
          replace: true,
          resetScroll: false,
          hashScrollIntoView: false,
        } as NavigateOptions,
        { wait: 'rendered', label: 'sanity legacy settings' },
      )
      assertRouteMarker(container, { route: 'settings-profile' })
      assertPublicInternalDifference(
        router.state.location as unknown as BuiltLocationSnapshot,
        internalSettingsProfilePath(),
        `${routerBasepath}${publicLocalePrefix}/legacy/profile`,
      )

      await lifecycle.click(teamDescriptor.testId, {
        cache: cachedLinks,
        wait: 'rendered',
        label: 'sanity team project link',
      })
      assertRouteMarker(container, {
        route: 'team-project',
        teamId: teamDescriptor.teamId,
        projectId: teamDescriptor.projectId,
      })
      assertPublicInternalDifference(
        router.state.location as unknown as BuiltLocationSnapshot,
        internalTeamProjectPath(
          teamDescriptor.teamId,
          teamDescriptor.projectId,
        ),
        publicTeamProjectHref(
          teamDescriptor.teamId,
          teamDescriptor.projectId,
        ).replace(/\?.*$/, ''),
      )

      await runSteps(navigationStepsPerCycle)
      assertRouteMarker(container, { route: 'photo-detail' })
    } finally {
      await lifecycle.after()
    }
  }

  return {
    name: `client masking rewrites loop (${framework})`,
    before,
    run: () => runSteps(navigationsPerBenchRun),
    sanity,
    after: lifecycle.after,
  }
}
