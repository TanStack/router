import { createFileRoute, useRouter } from '@tanstack/react-router'
import { sortJson } from '~/utils/sortJson'

export const Route = createFileRoute('/next')({
  component: Next,
})

function Next() {
  const router = useRouter()

  return (
    <div className="p-8 space-y-6">
      <h1 className="font-bold text-lg">Next</h1>

      <div>
        <div className="font-semibold">
          Bridged context (router.options.context)
        </div>
        <pre
          data-testid="bridged-context-next"
          className="bg-gray-100 p-2 rounded text-black"
        >
          {JSON.stringify(
            {
              context: sortJson(router.options.context),
            },
            null,
            2,
          )}
        </pre>
      </div>
    </div>
  )
}
