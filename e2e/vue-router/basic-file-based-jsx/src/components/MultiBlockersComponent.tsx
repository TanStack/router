import { defineComponent } from 'vue'
import { useBlocker } from '@tanstack/vue-router'

export const MultiBlockersComponent = defineComponent({
  setup() {
    const blocker1 = useBlocker({
      shouldBlockFn: () => true,
      enableBeforeUnload: false,
      withResolver: true,
    })

    const blocker2 = useBlocker({
      shouldBlockFn: () => true,
      enableBeforeUnload: false,
      withResolver: true,
    })

    return () => (
      <div>
        <h1>This page always blocks navigation</h1>
        <div data-testid="blocker-1-status">
          blocker1 is {blocker1.value.status}
        </div>
        <div data-testid="blocker-2-status">
          blocker2 is {blocker2.value.status}
        </div>
      </div>
    )
  },
})
