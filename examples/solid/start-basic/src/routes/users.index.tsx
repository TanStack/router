export const Route = createFileRoute({
  component: UsersIndexComponent,
})

function UsersIndexComponent() {
  return (
    <div>
      Select a user or{' '}
      <a
        href="/api/users"
        class="text-blue-800 hover:text-blue-600 underline"
      >
        view as JSON
      </a>
    </div>
  )
}
