import * as Vue from 'vue'
import { Link, createRoute } from '@tanstack/vue-router'
import {
  CONTROL_FLOW_INVALID_SEARCH_HREF,
  CONTROL_FLOW_PATHS,
  CONTROL_FLOW_UNMATCHED_HREF,
  START_MARKER,
} from '../../../shared'
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
            to={CONTROL_FLOW_PATHS.target}
            params={{ id: 'link-target' }}
            replace
          >
            Target
          </Link>
          <Link
            data-testid="control-flow-before-load-link"
            to={CONTROL_FLOW_PATHS.redirectBeforeLoad}
            params={{ id: 'link-before-load' }}
            replace
          >
            Before load redirect
          </Link>
          <Link
            data-testid="control-flow-loader-redirect-link"
            to={CONTROL_FLOW_PATHS.redirectLoader}
            params={{ id: 'link-loader' }}
            replace
          >
            Loader redirect
          </Link>
          <Link
            data-testid="control-flow-not-found-link"
            to={CONTROL_FLOW_PATHS.notFound}
            params={{ id: 'link-missing' }}
            replace
          >
            Not found
          </Link>
          <Link
            data-testid="control-flow-error-link"
            to={CONTROL_FLOW_PATHS.error}
            params={{ id: 'link-error' }}
            replace
          >
            Error
          </Link>
          <Link
            data-testid="control-flow-search-link"
            to={CONTROL_FLOW_PATHS.search}
            search={{ mode: 'valid', token: 'link-valid' } as never}
            replace
          >
            Search
          </Link>
          <a
            data-testid="control-flow-invalid-search-link"
            href={CONTROL_FLOW_INVALID_SEARCH_HREF}
          >
            Invalid search
          </a>
          <a
            data-testid="control-flow-unmatched-link"
            href={CONTROL_FLOW_UNMATCHED_HREF}
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
  path: CONTROL_FLOW_PATHS.start,
  component: StartPage,
})
