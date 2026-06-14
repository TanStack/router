import * as Vue from 'vue'
import { Link, createRoute } from '@tanstack/vue-router'
import { START_MARKER } from '../../../shared'
import { rootRoute } from './__root'

const StartPage: ReturnType<typeof Vue.defineComponent> = Vue.defineComponent({
  setup() {
    return () => (
      <main
        data-control-flow-branch={START_MARKER.branch}
        data-control-flow-value={START_MARKER.value}
      >
        <nav>
          <Link
            data-testid="control-flow-target-link"
            to="/flow/target/$id"
            params={{ id: 'link-target' }}
            replace
          >
            Target
          </Link>
          <Link
            data-testid="control-flow-before-load-link"
            to="/flow/redirect-before-load/$id"
            params={{ id: 'link-before-load' }}
            replace
          >
            Before load redirect
          </Link>
          <Link
            data-testid="control-flow-loader-redirect-link"
            to="/flow/redirect-loader/$id"
            params={{ id: 'link-loader' }}
            replace
          >
            Loader redirect
          </Link>
          <Link
            data-testid="control-flow-not-found-link"
            to="/flow/not-found/$id"
            params={{ id: 'link-missing' }}
            replace
          >
            Not found
          </Link>
          <Link
            data-testid="control-flow-error-link"
            to="/flow/error/$id"
            params={{ id: 'link-error' }}
            replace
          >
            Error
          </Link>
          <Link
            data-testid="control-flow-search-link"
            to="/flow/search"
            search={{ mode: 'valid', token: 'link-valid' } as never}
            replace
          >
            Search
          </Link>
          <a
            data-testid="control-flow-invalid-search-link"
            href="/flow/search?mode=invalid&token=link-invalid"
          >
            Invalid search
          </a>
          <a
            data-testid="control-flow-unmatched-link"
            href="/flow/unmatched/link"
          >
            Unmatched
          </a>
        </nav>
      </main>
    )
  },
})

export const startRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/flow/start',
  component: StartPage,
})
