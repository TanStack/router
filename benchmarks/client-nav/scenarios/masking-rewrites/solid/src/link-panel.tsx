import { For, createMemo } from 'solid-js'
import { Link, useRouter, useRouterState } from '@tanstack/solid-router'
import {
  buildLocationDescriptors,
  createBuildLocationOptions,
  createLinkLabel,
  createLinkOptions,
  createMaskingLinkActiveOptions,
  linkDescriptors,
  readVisiblePublicHref,
  type BuiltLocationSnapshot,
  type LinkDescriptor,
} from '../../shared.ts'

function PanelLink(props: { descriptor: LinkDescriptor }) {
  return (
    <Link
      {...(createLinkOptions(props.descriptor) as any)}
      data-masking-link="true"
      data-mask-link-key={props.descriptor.key}
      data-mask-link-kind={props.descriptor.kind}
      data-testid={props.descriptor.testId}
      activeOptions={createMaskingLinkActiveOptions(props.descriptor)}
      activeProps={{ class: 'active-link' }}
      inactiveProps={{ class: 'inactive-link' }}
    >
      {createLinkLabel(props.descriptor)}
    </Link>
  )
}

function BuildLocationProbe(props: { descriptor: LinkDescriptor }) {
  const router = useRouter()
  const locationHref = useRouterState({
    select: (state) => state.location.href,
  })
  const builtLocation = createMemo(() => {
    void locationHref()

    return router.buildLocation(
      createBuildLocationOptions(
        router.state.location,
        props.descriptor,
      ) as any,
    ) as unknown as BuiltLocationSnapshot
  })
  const visiblePublicHref = createMemo(() =>
    readVisiblePublicHref(builtLocation()),
  )

  return (
    <span
      data-built-visible-href={visiblePublicHref()}
      data-built-internal-href={builtLocation().href}
      data-built-key={props.descriptor.key}
      data-built-kind={props.descriptor.kind}
    >
      {visiblePublicHref()}
    </span>
  )
}

export function LinkPanel() {
  return (
    <section data-link-panel="masking-rewrites">
      <For each={linkDescriptors}>
        {(descriptor) => <PanelLink descriptor={descriptor} />}
      </For>
      <For each={buildLocationDescriptors}>
        {(descriptor) => <BuildLocationProbe descriptor={descriptor} />}
      </For>
    </section>
  )
}
