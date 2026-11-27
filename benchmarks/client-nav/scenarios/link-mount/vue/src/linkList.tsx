import * as Vue from 'vue'
import { Link } from '@tanstack/vue-router'
import { linkListTestId, linkRows } from '../../shared'

const linksVisible = Vue.shallowRef(false)

export function resetLinksVisible() {
  linksVisible.value = false
}

// Vue renders on its scheduler's microtask; `nextTick` resolves after that
// flush and its post-flush hooks, so a step includes every Link's mount or
// unmount work.
export function setLinksVisible(visible: boolean) {
  linksVisible.value = visible
  return Vue.nextTick()
}

const LinkList = Vue.defineComponent({
  setup() {
    return () => (
      <div data-testid={linkListTestId}>
        {linkRows.map(({ postId, page }) => (
          <Vue.Fragment key={postId}>
            <Link to="/about">About</Link>
            <Link
              to="/posts/$postId"
              params={{ postId }}
              search={{ page }}
              activeProps={{ class: 'active-link' }}
            >
              {`Post ${postId}`}
            </Link>
          </Vue.Fragment>
        ))}
      </div>
    )
  },
})

export const LinkListToggle = Vue.defineComponent({
  setup() {
    return () => (linksVisible.value ? <LinkList /> : null)
  },
})
