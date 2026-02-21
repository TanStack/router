import { createFileRoute } from '@tanstack/solid-router'
import { createSignal, onSettled } from 'solid-js'

export const Route = createFileRoute('/notRemountDeps')({
  validateSearch(search: { searchParam: string }) {
    return { searchParam: search.searchParam }
  },
  loaderDeps(opts) {
    return opts.search
  },
  component: Home,
  remountDeps(opts) {
    return opts.params
  },
})

const [mounts, setMounts] = createSignal(0)

function Home() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()

  onSettled(() => {
    setMounts((m) => m + 1)
  })

  return (
    <div class="p-2">
      <button
        onClick={() => {
          navigate({
            search: { searchParam: Math.random().toString(36).substring(2, 8) },
          })
        }}
      >
        Regenerate search param
      </button>

      <div>Search: {search().searchParam}</div>
      <div data-testid="component-mounts">
        Page component mounts: {mounts()}
      </div>
    </div>
  )
}
