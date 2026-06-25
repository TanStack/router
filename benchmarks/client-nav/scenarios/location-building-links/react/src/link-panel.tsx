import {
  Link,
  useMatchRoute,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'
import {
  buildLocationDescriptors,
  createActiveOptions,
  createLinkLabel,
  createLinkOptions,
  createLocationState,
  createMatchOptions,
  linkDescriptors,
  matchDescriptors,
  readBuiltPublicHref,
  type BuiltLocationSnapshot,
  type LinkDescriptor,
  type MatchDescriptor,
} from '../../shared.ts'

function createActiveProps(descriptor: LinkDescriptor) {
  if (descriptor.styleVariant % 2 === 0) {
    return { className: 'active-link' }
  }

  return () => ({
    className: 'active-link active-link-fn',
    'data-active-key': descriptor.key,
  })
}

function createInactiveProps(descriptor: LinkDescriptor) {
  if (descriptor.styleVariant % 2 === 0) {
    return { className: 'inactive-link' }
  }

  return () => ({
    className: 'inactive-link inactive-link-fn',
    'data-inactive-key': descriptor.key,
  })
}

function PanelLink({ descriptor }: { descriptor: LinkDescriptor }) {
  return (
    <Link
      {...(createLinkOptions(descriptor) as any)}
      data-location-link="true"
      data-href-key={descriptor.key}
      state={createLocationState(descriptor) as any}
      activeOptions={createActiveOptions(descriptor)}
      activeProps={createActiveProps(descriptor)}
      inactiveProps={createInactiveProps(descriptor)}
    >
      {createLinkLabel(descriptor)}
    </Link>
  )
}

function MatchProbe({ descriptor }: { descriptor: MatchDescriptor }) {
  const matchRoute = useMatchRoute()
  const params = matchRoute(createMatchOptions(descriptor) as any)

  return (
    <span
      data-match-probe="true"
      data-match-key={descriptor.key}
      data-match-active={params ? 'true' : 'false'}
    >
      {params ? 'matched' : 'unmatched'}
    </span>
  )
}

function BuildLocationProbe({ descriptor }: { descriptor: LinkDescriptor }) {
  const router = useRouter()
  const locationHref = useRouterState({
    select: (state) => state.location.href,
  })
  void locationHref

  const builtHref = readBuiltPublicHref(
    router.buildLocation({
      _fromLocation: router.state.location,
      ...createLinkOptions(descriptor),
      state: createLocationState(descriptor),
    } as any) as BuiltLocationSnapshot,
  )

  return (
    <span data-built-href={builtHref} data-built-key={descriptor.key}>
      {builtHref}
    </span>
  )
}

export function LinkPanel() {
  return (
    <section data-link-panel="true">
      {linkDescriptors.map((descriptor) => (
        <PanelLink key={descriptor.key} descriptor={descriptor} />
      ))}
      {matchDescriptors.map((descriptor) => (
        <MatchProbe key={descriptor.key} descriptor={descriptor} />
      ))}
      {buildLocationDescriptors.map((descriptor) => (
        <BuildLocationProbe key={descriptor.key} descriptor={descriptor} />
      ))}
    </section>
  )
}
