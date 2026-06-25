import {
  Link,
  useMatchRoute,
  useRouter,
  useRouterState,
} from '@tanstack/solid-router'
import { For, createMemo } from 'solid-js'
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
    return { class: 'active-link' }
  }

  return () => ({
    class: 'active-link active-link-fn',
    'data-active-key': descriptor.key,
  })
}

function createInactiveProps(descriptor: LinkDescriptor) {
  if (descriptor.styleVariant % 2 === 0) {
    return { class: 'inactive-link' }
  }

  return () => ({
    class: 'inactive-link inactive-link-fn',
    'data-inactive-key': descriptor.key,
  })
}

function PanelLink(props: { descriptor: LinkDescriptor }) {
  return (
    <Link
      {...(createLinkOptions(props.descriptor) as any)}
      data-location-link="true"
      data-href-key={props.descriptor.key}
      state={createLocationState(props.descriptor) as any}
      activeOptions={createActiveOptions(props.descriptor)}
      activeProps={createActiveProps(props.descriptor)}
      inactiveProps={createInactiveProps(props.descriptor)}
    >
      {createLinkLabel(props.descriptor)}
    </Link>
  )
}

function MatchProbe(props: { descriptor: MatchDescriptor }) {
  const matchRoute = useMatchRoute()
  const params = matchRoute(createMatchOptions(props.descriptor) as any)

  return (
    <span
      data-match-probe="true"
      data-match-key={props.descriptor.key}
      data-match-active={params() ? 'true' : 'false'}
    >
      {params() ? 'matched' : 'unmatched'}
    </span>
  )
}

function BuildLocationProbe(props: { descriptor: LinkDescriptor }) {
  const router = useRouter()
  const locationHref = useRouterState({
    select: (state) => state.location.href,
  })
  const builtHref = createMemo(() => {
    void locationHref()

    return readBuiltPublicHref(
      router.buildLocation({
        _fromLocation: router.state.location,
        ...createLinkOptions(props.descriptor),
        state: createLocationState(props.descriptor),
      } as any) as BuiltLocationSnapshot,
    )
  })

  return (
    <span data-built-href={builtHref()} data-built-key={props.descriptor.key}>
      {builtHref()}
    </span>
  )
}

export function LinkPanel() {
  return (
    <section data-link-panel="true">
      <For each={linkDescriptors}>
        {(descriptor) => <PanelLink descriptor={descriptor} />}
      </For>
      <For each={matchDescriptors}>
        {(descriptor) => <MatchProbe descriptor={descriptor} />}
      </For>
      <For each={buildLocationDescriptors}>
        {(descriptor) => <BuildLocationProbe descriptor={descriptor} />}
      </For>
    </section>
  )
}
