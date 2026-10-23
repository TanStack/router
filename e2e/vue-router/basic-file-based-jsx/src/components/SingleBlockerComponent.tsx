import { defineComponent } from 'vue'
import { useBlocker } from '@tanstack/vue-router'

export const SingleBlockerComponent = defineComponent({
  setup() {
    const blocker = useBlocker({
      shouldBlockFn: () => true,
      enableBeforeUnload: false,
      withResolver: true,
    })

    return () => (
      <div>
        <h1>This page always blocks navigation</h1>
        <div data-testid="blocker-status">
          blocker is {blocker.value.status}
        </div>
      </div>
    )
  },
})
