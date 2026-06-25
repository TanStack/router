import * as Vue from 'vue'
import { Teleport } from 'vue'
import { HeadContent, Outlet, createRootRoute } from '@tanstack/vue-router'
import { normalizeHeadSearch } from '../../../shared.ts'

const RootComponent = Vue.defineComponent({
  setup() {
    return () => (
      <>
        <Teleport to="head">
          <HeadContent />
        </Teleport>
        <Outlet />
      </>
    )
  },
})

export const Route = createRootRoute({
  validateSearch: normalizeHeadSearch,
  component: RootComponent,
})
