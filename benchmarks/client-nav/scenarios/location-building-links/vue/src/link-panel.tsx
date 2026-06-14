import * as Vue from 'vue'
import {
  Link,
  useMatchRoute,
  useRouter,
  useRouterState,
} from '@tanstack/vue-router'
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
  },
})

const MatchProbe = Vue.defineComponent({
  props: {
    descriptor: {
      type: Object as Vue.PropType<MatchDescriptor>,
      required: true,
    },
  },
  setup(props) {
    const matchRoute = useMatchRoute()
    const params = matchRoute(createMatchOptions(props.descriptor) as any)

    return () => (
      <span
        data-match-probe="true"
        data-match-key={props.descriptor.key}
        data-match-active={params.value ? 'true' : 'false'}
      >
        {params.value ? 'matched' : 'unmatched'}
      </span>
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

      const builtHref = readBuiltPublicHref(
        router.buildLocation({
          _fromLocation: router.state.location,
          ...createLinkOptions(props.descriptor),
          state: createLocationState(props.descriptor),
        } as any) as BuiltLocationSnapshot,
      )

      return (
        <span data-built-href={builtHref} data-built-key={props.descriptor.key}>
          {builtHref}
        </span>
      )
    }
  },
})

export const LinkPanel = Vue.defineComponent({
  setup() {
    return () => (
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
  },
})
