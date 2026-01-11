import { ref } from 'vue'
import { createFileRoute } from '@tanstack/vue-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const count = ref(0)

  return (
    <div>
      <h1 data-testid="csp-heading">CSP Nonce Test</h1>
      <p data-testid="inline-styled" class="inline-styled">
        This should be green if inline styles work
      </p>
      <p data-testid="external-styled" class="external-styled">
        This should be blue if external styles work
      </p>
      <button data-testid="counter-btn" onClick={() => count.value++}>
        Count: <span data-testid="counter-value">{count.value}</span>
      </button>
    </div>
  )
}
