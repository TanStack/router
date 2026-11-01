import { defineComponent } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

export const Route = createFileRoute('/')({
  component: defineComponent({
    setup() {
      const label: string = 'Inline Vue component'
      return () => <div>{label}</div>
    },
  }),
})
