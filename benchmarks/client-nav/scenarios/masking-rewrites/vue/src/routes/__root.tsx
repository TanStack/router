import * as Vue from 'vue'
import { Outlet, createRootRoute } from '@tanstack/vue-router'
import { normalizeMaskingSearch } from '../../../shared.ts'
import { LinkPanel } from '../link-panel'

const Root = Vue.defineComponent({
  setup() {
    return () => (
      <>
        <LinkPanel />
        <main>
          <Outlet />
        </main>
      </>
    )
  },
})

export const rootRoute = createRootRoute({
  validateSearch: normalizeMaskingSearch,
  component: Root,
})
