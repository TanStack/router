import { defineComponent, onMounted, onUnmounted } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

const pendingMinMs = 1500

function recordEvent(type: string) {
  if (typeof window === 'undefined') {
    return
  }

  const global = window as any
  global.__events ??= []
  global.__events.push({ type, t: performance.now() })
}

const Pending = defineComponent({
  setup() {
    onMounted(() => {
      recordEvent('pending-mounted')
    })
    onUnmounted(() => {
      recordEvent('pending-unmounted')
    })

    return () => (
      <div data-testid="ssr-false-pending">Loading SSR false route...</div>
    )
  },
})

const Target = defineComponent({
  setup() {
    onMounted(() => {
      recordEvent('target-mounted')
    })

    return () => (
      <div data-testid="ssr-false-target">SSR false route loaded</div>
    )
  },
})

export const Route = createFileRoute('/ssr-false-pending-min')({
  ssr: false,
  pendingMs: 0,
  pendingMinMs,
  pendingComponent: Pending,
  loader: async () => {
    recordEvent('loader-start')
    await new Promise((resolve) => setTimeout(resolve, 50))
    recordEvent('loader-done')

    return { ok: true }
  },
  component: Target,
})
