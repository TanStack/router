import { Link, useRouter, useRouterState } from '@tanstack/react-router'
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

function PanelLink({ descriptor }: { descriptor: LinkDescriptor }) {
  return (
    <Link
      {...(createLinkOptions(descriptor) as any)}
      data-masking-link="true"
      data-mask-link-key={descriptor.key}
      data-mask-link-kind={descriptor.kind}
      data-testid={descriptor.testId}
      activeOptions={createMaskingLinkActiveOptions(descriptor)}
      activeProps={{ className: 'active-link' }}
      inactiveProps={{ className: 'inactive-link' }}
    >
      {createLinkLabel(descriptor)}
    </Link>
  )
}

function BuildLocationProbe({ descriptor }: { descriptor: LinkDescriptor }) {
  const router = useRouter()
  const locationHref = useRouterState({
    select: (state) => state.location.href,
  })
  void locationHref

  const builtLocation = router.buildLocation(
    createBuildLocationOptions(router.state.location, descriptor) as any,
  ) as unknown as BuiltLocationSnapshot
  const visiblePublicHref = readVisiblePublicHref(builtLocation)

  return (
    <span
      data-built-visible-href={visiblePublicHref}
      data-built-internal-href={builtLocation.href}
      data-built-key={descriptor.key}
      data-built-kind={descriptor.kind}
    >
      {visiblePublicHref}
    </span>
  )
}

export function LinkPanel() {
  return (
    <section data-link-panel="masking-rewrites">
      {linkDescriptors.map((descriptor) => (
        <PanelLink key={descriptor.key} descriptor={descriptor} />
      ))}
      {buildLocationDescriptors.map((descriptor) => (
        <BuildLocationProbe key={descriptor.key} descriptor={descriptor} />
      ))}
    </section>
  )
}
