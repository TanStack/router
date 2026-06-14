import * as Vue from 'vue'
import { Link, useRouter, useRouterState } from '@tanstack/vue-router'
import {
  buildLocationDescriptors,
  createLinkLabel,
  createLinkOptions,
  linkDescriptors,
  readVisiblePublicHref,
  type BuiltLocationSnapshot,
  type LinkDescriptor,
} from '../../shared.ts'

const PanelLink = Vue.defineComponent({
  props: {
    descriptor: {
      type: Object as Vue.PropType<LinkDescriptor>,
      required: true,
    },
  },
  setup(props) {
    return () => (
      <Link
        {...(createLinkOptions(props.descriptor) as any)}
        data-masking-link="true"
        data-mask-link-key={props.descriptor.key}
        data-mask-link-kind={props.descriptor.kind}
        data-testid={props.descriptor.testId}
        activeOptions={{
          includeSearch: props.descriptor.kind !== 'team-project',
        }}
        activeProps={{ class: 'active-link' }}
        inactiveProps={{ class: 'inactive-link' }}
      >
        {createLinkLabel(props.descriptor)}
      </Link>
    )
  },
})

const BuildLocationProbe = Vue.defineComponent({
  props: {
    descriptor: {
      type: Object as Vue.PropType<LinkDescriptor>,
      required: true,
    },
  },
  setup(props) {
    const router = useRouter()
    const locationHref = useRouterState({
      select: (state) => state.location.href,
    })

    return () => {
      void locationHref.value

      const builtLocation = router.buildLocation({
        _fromLocation: router.state.location,
        ...createLinkOptions(props.descriptor),
      } as any) as unknown as BuiltLocationSnapshot
      const visiblePublicHref = readVisiblePublicHref(builtLocation)

      return (
        <span
          data-built-visible-href={visiblePublicHref}
          data-built-internal-href={builtLocation.href}
          data-built-key={props.descriptor.key}
          data-built-kind={props.descriptor.kind}
        >
          {visiblePublicHref}
        </span>
      )
    }
  },
})

export const LinkPanel = Vue.defineComponent({
  setup() {
    return () => (
      <section data-link-panel="masking-rewrites">
        {linkDescriptors.map((descriptor) => (
          <PanelLink key={descriptor.key} descriptor={descriptor} />
        ))}
        {buildLocationDescriptors.map((descriptor) => (
          <BuildLocationProbe key={descriptor.key} descriptor={descriptor} />
        ))}
      </section>
    )
  },
})
