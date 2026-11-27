import * as Vue from 'vue'
import { createLink } from '@tanstack/vue-router'
import {
  customLinkClass,
  linkListRevision,
  linkListTestId,
  linkRows,
} from '../../shared'
import type { LinkListState } from '../../shared'

// A design-system style anchor: forwards its attributes and adds its own
// class. `createLink` also passes the slot content as a `children` prop,
// which must not reach the element.
const BasicAnchor: Vue.FunctionalComponent<Record<string, unknown>> = (
  { children: _children, class: className, ...props },
  { slots },
) => (
  <a {...props} class={[customLinkClass, className]}>
    {slots.default?.()}
  </a>
)
BasicAnchor.inheritAttrs = false

const CustomLink = createLink(BasicAnchor)

const linkListState = Vue.shallowRef<LinkListState>('hidden')

export function resetLinkListState() {
  linkListState.value = 'hidden'
}

// Vue renders on its scheduler's microtask; `nextTick` resolves after that
// flush and its post-flush hooks, so a step includes every Link's mount,
// update or unmount work.
export function setLinkListState(state: LinkListState) {
  linkListState.value = state
  return Vue.nextTick()
}

const LinkList = Vue.defineComponent({
  props: {
    revision: { type: Number, required: true },
  },
  setup(props) {
    return () => (
      <div data-testid={linkListTestId} data-revision={props.revision}>
        {linkRows.map(({ postId, page }) => (
          <Vue.Fragment key={postId}>
            <CustomLink to="/about">About</CustomLink>
            <CustomLink
              to="/posts/$postId"
              params={{ postId }}
              search={{ page }}
              activeProps={{ class: 'active-link' }}
            >
              {`Post ${postId}`}
            </CustomLink>
          </Vue.Fragment>
        ))}
      </div>
    )
  },
})

export const LinkListToggle = Vue.defineComponent({
  setup() {
    return () =>
      linkListState.value === 'hidden' ? null : (
        <LinkList revision={linkListRevision(linkListState.value)} />
      )
  },
})
