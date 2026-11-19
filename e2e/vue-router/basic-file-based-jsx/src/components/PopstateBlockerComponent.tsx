import { defineComponent } from 'vue'
import { useBlocker, useNavigate } from '@tanstack/vue-router'

export const PopstateBlockerComponent = defineComponent({
  setup() {
    const navigate = useNavigate()

    const blocker = useBlocker({
      shouldBlockFn: ({ action }) => action !== 'PUSH' && action !== 'REPLACE',
      enableBeforeUnload: false,
      withResolver: true,
    })

    return () => (
      <div>
        <h1>Popstate blocker</h1>
        <div data-testid="blocker-status">
          blocker is {blocker.value.status}
        </div>
        <button
          data-testid="add-entry"
          onClick={() =>
            navigate({ to: '/global-blocker/popstate', hash: `s${Date.now()}` })
          }
        >
          add entry
        </button>
      </div>
    )
  },
})
