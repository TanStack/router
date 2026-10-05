import { defineComponent } from 'vue'
import { Link, Outlet, useBlockerState } from '@tanstack/vue-router'

export const GlobalBlockerLayoutComponent = defineComponent({
  setup() {
    const blocker = useBlockerState()

    return () => (
      <div>
        <div>
          <Link
            to="/global-blocker/single-blocker"
            activeProps={{ class: 'font-bold' }}
          >
            Single Blocker
          </Link>{' '}
          <Link
            to="/global-blocker/multi-blockers"
            activeProps={{ class: 'font-bold' }}
          >
            Multi Blockers
          </Link>
        </div>
        <div data-testid="global-blocker-status">
          global status is {blocker.value.status}
        </div>
        {blocker.value.status === 'blocked' ? (
          <div>
            <h3>Global Blocking Modal</h3>
            <div>Navigation is blocked</div>
            <div>
              <button onClick={() => blocker.value.proceed()}>Proceed</button>
              <button onClick={() => blocker.value.proceedAll()}>
                Proceed All
              </button>
              <button onClick={() => blocker.value.reset()}>Reset</button>
            </div>
          </div>
        ) : null}
        <Outlet />
      </div>
    )
  },
})
