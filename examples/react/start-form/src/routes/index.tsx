import { createFileRoute, useHydrated, useRouter } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { useServerFn } from '@tanstack/react-start'
import { useState } from 'react'
import { readGoal, saveGoal } from '../server/goal'
export const Route = createFileRoute('/')({
  loader: () => readGoal(),
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  component: Home,
})
function Home() {
  const goal = Route.useLoaderData()
  const router = useRouter()
  const hydrated = useHydrated()
  const save = useServerFn(saveGoal)
  const [optimisticGoal, setOptimisticGoal] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const form = useForm({
    defaultValues: { goal },
    onSubmitMeta: { redirect: false },
    validators: {
      onSubmit: ({ value }) =>
        value.goal.length === 0
          ? { fields: { goal: 'Enter a reading goal.' } }
          : undefined,
    },
    onSubmit: async ({ value, formApi, meta }) => {
      setMessage('')
      setOptimisticGoal(value.goal.trim())
      try {
        const result = await save({ data: value })
        if (result.error) {
          formApi.setErrorMap({ onSubmit: { fields: { goal: result.error } } })
          return
        }
        await router.invalidate()
        setMessage('Saved.')
        if (meta.redirect) {
          await router.navigate({ to: '/saved' })
        }
      } catch {
        setMessage(
          'Could not confirm the save. Reload to check your saved goal.',
        )
      } finally {
        setOptimisticGoal(null)
      }
    },
  })
  return (
    <main>
      <h1>Reading goal</h1>
      <p aria-live="polite">Current goal: {optimisticGoal ?? goal}</p>
      <form
        method="post"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <fieldset disabled={!hydrated || isSubmitting}>
              <form.Field name="goal">
                {(field) => (
                  <div>
                    <label htmlFor="goal">Your goal</label>
                    <input
                      id="goal"
                      name={field.name}
                      value={field.state.value}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      onBlur={field.handleBlur}
                      aria-describedby="goal-error"
                      aria-invalid={field.state.meta.errors.length > 0}
                    />
                    <div id="goal-error" role="alert">
                      {field.state.meta.errors.map((error) => (
                        <p key={error}>{error}</p>
                      ))}
                    </div>
                  </div>
                )}
              </form.Field>
              <button type="submit">
                {isSubmitting ? 'Saving...' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => void form.handleSubmit({ redirect: true })}
              >
                Save and continue
              </button>
            </fieldset>
          )}
        </form.Subscribe>
      </form>
      <p role="status">{message}</p>
    </main>
  )
}
